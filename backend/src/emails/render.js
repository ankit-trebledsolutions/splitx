const { layout, escapeHtml, theme, FONT, APP_URL, SUPPORT_EMAIL } = require('./layout');

/**
 * Turns a template into the email that is actually sent.
 *
 * A template is five pieces of text — subject, preheader, body, text, reason —
 * with {{placeholders}} where the person's details go. The same code renders
 * the built-in designs (emails/defaults.js) and the versions an admin has
 * edited in the panel, so the two cannot drift apart.
 */

// {{ first_name }}: letters, digits and underscores, spaces inside the braces
// allowed, case ignored — an admin typing {{ Code }} means {{code}}.
const PLACEHOLDER = /\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/gi;

// An editor writing a link turns href="{{app_url}}" into percent-escapes. Put
// back before anything is stored, or the placeholder would never be filled.
const ENCODED_PLACEHOLDER = /%7B%7B\s*([a-z][a-z0-9_]*)\s*%7D%7D/gi;
const decodePlaceholders = (template) =>
  String(template ?? '').replace(ENCODED_PLACEHOLDER, (_match, key) => `{{${key}}}`);

const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || 'there';

// Everything a template may refer to, worked out from what the caller knows.
const buildValues = ({ name, code, minutes } = {}) => ({
  first_name: firstName(name),
  name: String(name || '').trim() || 'there',
  code: code === undefined || code === null ? '' : String(code),
  minutes: minutes === undefined || minutes === null ? '' : String(minutes),
  app_url: APP_URL,
  support_email: SUPPORT_EMAIL,
});

// One pass, so a value is never itself read as a template: somebody naming
// themselves "{{code}}" gets exactly that printed back, not a code.
const fill = (template, values, transform = (value) => value) =>
  String(template ?? '').replace(PLACEHOLDER, (match, key) => {
    const value = values[key.toLowerCase()];
    // A placeholder nothing fills is left visible rather than blanked: a gap in
    // a sentence hides the mistake, the braces show it.
    return value === undefined ? match : transform(value);
  });

const placeholdersIn = (template) => {
  const found = new Set();
  for (const match of String(template ?? '').matchAll(PLACEHOLDER)) {
    found.add(match[1].toLowerCase());
  }
  return [...found];
};

// The built-in designs style every element inline. Something an admin adds in
// the editor carries no styles at all, and an email client would print it in
// its own default — black text, on this dark card. The wrapper gives such text
// the card's own look to inherit.
const inheritCardStyle = (body) =>
  `<div style="font-family:${FONT};font-size:15px;line-height:24px;color:${theme.text};">${body}</div>`;

/**
 * content:  { subject, preheader, body, text, reason }
 * vars:     { name, code, minutes } — whatever this email has
 * edited:   true for a template changed in the panel (see inheritCardStyle)
 */
const render = (content, vars, { edited = false } = {}) => {
  const values = buildValues(vars);
  // Names come from users; never let them inject markup into the HTML part.
  const body = fill(content.body, values, escapeHtml);

  return {
    // A subject is one line. A line break in it would be read as the start of
    // another header by anything that handles the message as raw text.
    subject: fill(content.subject, values).replace(/[\r\n]+/g, ' ').trim(),
    html: layout({
      // layout() escapes these two itself.
      preheader: fill(content.preheader, values),
      reason: fill(content.reason, values),
      body: edited ? inheritCardStyle(body) : body,
    }),
    text: fill(content.text, values),
  };
};

// What an email must never contain. Inboxes strip most of it and spam filters
// punish the rest, so refusing at save time is kinder than letting it ship.
const FORBIDDEN_HTML = [
  { pattern: /<\s*script\b/i, problem: 'The design contains a <script> tag, which no inbox will run.' },
  {
    pattern: /<\s*(iframe|object|embed|form)\b/i,
    problem: 'The design contains an embedded frame or form, which inboxes remove.',
  },
  {
    pattern: /<[^>]*\son[a-z]+\s*=/i,
    problem: 'The design contains a script handler (such as onclick), which inboxes remove.',
  },
  {
    pattern: /\b(href|src)\s*=\s*["']?\s*(javascript|vbscript)\s*:/i,
    problem: 'The design contains a script link, which inboxes remove.',
  },
  {
    pattern: /\bsrc\s*=\s*["']?\s*data:/i,
    problem:
      'The design contains a pasted image. Most inboxes will not show it: upload the image somewhere and use its https:// address instead.',
  },
];

const FIELD_LABELS = {
  subject: 'subject',
  preheader: 'preview line',
  body: 'design',
  text: 'plain-text version',
  reason: 'footer line',
};

/**
 * Everything wrong with an edited template, as sentences an admin can act on.
 * An empty list means it is safe to store and send.
 *
 * definition: the entry from emails/defaults.js this content is for.
 */
const findProblems = (definition, content) => {
  const problems = [];
  const allowed = new Set(definition.variables.map((variable) => variable.key));

  if (!String(content.subject || '').trim()) problems.push('The subject cannot be empty.');
  if (!String(content.body || '').replace(/<[^>]*>|&nbsp;|\s/g, '')) {
    problems.push('The design cannot be empty.');
  }
  if (!String(content.text || '').trim()) problems.push('The plain-text version cannot be empty.');

  for (const field of Object.keys(FIELD_LABELS)) {
    for (const key of placeholdersIn(content[field])) {
      if (!allowed.has(key)) {
        problems.push(
          `{{${key}}} in the ${FIELD_LABELS[field]} is not something this email can fill in. Available: ${[...allowed]
            .map((name) => `{{${name}}}`)
            .join(', ')}.`
        );
      }
    }
  }

  // A code email without its code locks people out of sign-up or reset, and
  // nothing else would notice until they complained.
  for (const variable of definition.variables.filter((entry) => entry.required)) {
    for (const field of ['body', 'text']) {
      if (!placeholdersIn(content[field]).includes(variable.key)) {
        problems.push(
          `The ${FIELD_LABELS[field]} must contain {{${variable.key}}}: without it nobody receives their ${variable.label.toLowerCase()}.`
        );
      }
    }
  }

  for (const { pattern, problem } of FORBIDDEN_HTML) {
    if (pattern.test(String(content.body || ''))) problems.push(problem);
  }

  return problems;
};

module.exports = {
  render,
  fill,
  placeholdersIn,
  decodePlaceholders,
  findProblems,
  buildValues,
};
