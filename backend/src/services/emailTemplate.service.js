const EmailTemplate = require('../models/EmailTemplate');
const ApiError = require('../utils/ApiError');
const { DEFINITIONS, DEFAULTS, SAMPLE, CANVAS, blocksFor } = require('../emails/defaults');
const { render, findProblems, decodePlaceholders, placeholdersIn } = require('../emails/render');

/**
 * Email templates as the admin panel sees them, and the one decision the rest
 * of the API needs from here: which version of an email goes out.
 *
 * The built-in design is always there underneath. A stored template replaces
 * it only while it is usable, so a bad edit, a hand-changed document or a
 * database hiccup can cost an email its custom wording but never the email.
 */

const CONTENT_FIELDS = ['subject', 'preheader', 'body', 'text', 'reason'];

const definitionFor = (key) => {
  const definition = DEFAULTS[key];
  if (!definition) throw ApiError.notFound('Email template not found');
  return definition;
};

const pickContent = (source) =>
  Object.fromEntries(CONTENT_FIELDS.map((field) => [field, source?.[field] ?? '']));

// A stored template counts only if it is complete: `customized` alone is not
// trusted, since a document can be edited by hand.
const hasOwnContent = (stored) => Boolean(stored?.customized && stored.subject && stored.body && stored.text);

const contentOf = (definition, stored) =>
  hasOwnContent(stored) ? pickContent(stored) : definition.content;

// An email that carries a code is sent whatever the switch says.
const isActive = (definition, stored) => definition.required || stored?.isActive !== false;

// One template in the shape the panel works with: what the email is (from
// code) merged with what has been changed about it (from the database).
const present = (definition, stored) => ({
  key: definition.key,
  name: definition.name,
  description: definition.description,
  required: definition.required,
  variables: definition.variables,
  ...contentOf(definition, stored),
  isActive: isActive(definition, stored),
  isCustomized: hasOwnContent(stored),
  updatedAt: stored?.updatedAt || null,
  updatedBy: stored?.updatedBy || null,
});

// Only four emails exist, so searching and paging happen here rather than in a
// query. The response is paged all the same, to match every other list.
const list = async ({ search, page, limit }) => {
  const stored = await EmailTemplate.find({}).lean();
  const byKey = new Map(stored.map((doc) => [doc.key, doc]));

  const term = (search || '').trim().toLowerCase();
  const all = DEFINITIONS.map((definition) => present(definition, byKey.get(definition.key))).filter(
    (template) =>
      !term ||
      [template.name, template.description, template.subject].some((value) =>
        value.toLowerCase().includes(term)
      )
  );

  const total = all.length;
  return {
    templates: all.slice((page - 1) * limit, page * limit),
    total,
    page,
    limit,
    pages: Math.max(1, Math.ceil(total / limit)),
  };
};

const get = async (key) => {
  const definition = definitionFor(key);
  const stored = await EmailTemplate.findOne({ key }).lean();
  return {
    ...present(definition, stored),
    // For the editor: pieces it can insert, and the look of the card it is
    // editing inside. Sent from here so the design has one home, emails/layout.js.
    blocks: blocksFor(definition),
    canvas: CANVAS,
  };
};

// Tidies what the editor sent and refuses anything that would not survive
// being sent. Returns the content ready to store.
const cleanContent = (definition, input) => {
  const content = pickContent(input);
  content.subject = content.subject.replace(/[\r\n]+/g, ' ').trim();
  content.preheader = content.preheader.replace(/[\r\n]+/g, ' ').trim();
  content.reason = content.reason.replace(/[\r\n]+/g, ' ').trim();
  content.body = decodePlaceholders(content.body).trim();
  content.text = content.text.replace(/\r\n/g, '\n').trim();

  const problems = findProblems(definition, content);
  if (problems.length) throw ApiError.badRequest(problems.join(' '));
  return content;
};

const update = async (key, input, actor) => {
  const definition = definitionFor(key);
  const content = cleanContent(definition, input);

  // Upsert: the first edit of an email is what creates its document.
  const stored = await EmailTemplate.findOneAndUpdate(
    { key },
    { $set: { ...content, customized: true, updatedBy: actor.name } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  ).lean();
  return present(definition, stored);
};

// Names the state rather than toggling it, like suspending an account: a
// double click cannot switch an email back on.
const setActive = async (key, active, actor) => {
  const definition = definitionFor(key);
  if (definition.required && !active) {
    throw ApiError.badRequest(
      `"${definition.name}" cannot be switched off: people could no longer ${
        key === 'verify_email' ? 'finish signing up' : 'reset their password'
      }.`
    );
  }

  const stored = await EmailTemplate.findOneAndUpdate(
    { key },
    { $set: { isActive: active, updatedBy: actor.name } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  ).lean();
  return present(definition, stored);
};

// Back to the built-in design. The switch is left as it was: undoing an edit
// should not quietly start sending an email somebody turned off.
const reset = async (key, actor) => {
  const definition = definitionFor(key);
  const stored = await EmailTemplate.findOneAndUpdate(
    { key },
    {
      $set: { customized: false, updatedBy: actor.name },
      $unset: Object.fromEntries(CONTENT_FIELDS.map((field) => [field, ''])),
    },
    { new: true }
  ).lean();
  return present(definition, stored);
};

/**
 * The email as it would arrive, filled with sample details.
 *
 * With `draft` it shows what is in the editor right now, saved or not, and
 * reports what is wrong with it instead of refusing — a preview that goes
 * blank on the first mistake is no help in finding it.
 */
const preview = async (key, draft) => {
  const definition = definitionFor(key);

  if (draft) {
    const content = pickContent(draft);
    content.body = decodePlaceholders(content.body);
    return {
      ...render(content, SAMPLE, { edited: true }),
      problems: findProblems(definition, content),
    };
  }

  const stored = await EmailTemplate.findOne({ key }).lean();
  return {
    ...render(contentOf(definition, stored), SAMPLE, { edited: hasOwnContent(stored) }),
    problems: [],
  };
};

/**
 * What email.service.js sends. Returns null when the email is switched off.
 *
 * Never throws: whatever goes wrong here, the person waiting on a code still
 * gets the built-in email.
 */
const renderForSend = async (key, vars) => {
  const definition = DEFAULTS[key];
  if (!definition) throw new Error(`Unknown email template: ${key}`);

  let stored = null;
  try {
    stored = await EmailTemplate.findOne({ key }).lean();
  } catch (err) {
    console.error(`[email] could not load the "${key}" template, sending the built-in one:`, err.message);
  }

  if (!isActive(definition, stored)) return null;
  if (!hasOwnContent(stored)) return render(definition.content, vars);

  // Checked again at the last moment. Saving already refuses a template
  // without its code, but a document changed by hand never went through that.
  const content = pickContent(stored);
  const missing = definition.variables
    .filter((variable) => variable.required)
    .some((variable) =>
      ['body', 'text'].some((field) => !placeholdersIn(content[field]).includes(variable.key))
    );
  if (missing) {
    console.error(`[email] the stored "${key}" template has lost a required placeholder, sending the built-in one`);
    return render(definition.content, vars);
  }

  return render(content, vars, { edited: true });
};

module.exports = {
  list,
  get,
  update,
  setActive,
  reset,
  preview,
  renderForSend,
};
