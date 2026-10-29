const User = require('../models/User');
const IntegrationSetting = require('../models/IntegrationSetting');
const IntegrationChange = require('../models/IntegrationChange');
const ApiError = require('../utils/ApiError');
const vault = require('../integrations/vault');
const store = require('../integrations/store');
const testers = require('../integrations/testers');
const { INTEGRATIONS, BY_KEY } = require('../integrations/definitions');

/**
 * The Third-Party APIs screen of the admin panel: showing which keys each
 * service runs on, and changing them.
 *
 * Three rules hold everywhere in this file.
 *   A secret goes in and never comes out: the panel is shown its last four
 *   characters and nothing else.
 *   Nothing is saved that the provider has not accepted (integrations/testers).
 *   Nothing is changed without the admin's password, typed again for the
 *   change — a session left open on somebody's desk is not enough.
 */

const definitionFor = (key) => {
  const integration = BY_KEY[key];
  if (!integration) throw ApiError.notFound('Unknown service');
  return integration;
};

const asObject = (map) => (map instanceof Map ? Object.fromEntries(map) : map || {});

const slotOf = (integration, field) => `${integration.key}.${field.key}`;

const hasValue = (value) => value !== undefined && value !== null && value !== '';

// A secret saved in the panel, unlocked, or undefined when there is none or it
// will not open (the encryption key was changed since).
const ownSecret = (integration, field, doc) => {
  const sealed = asObject(doc?.secrets)[field.key];
  if (!sealed) return undefined;
  try {
    return vault.open(sealed, slotOf(integration, field));
  } catch {
    return undefined;
  }
};

const ownValue = (integration, field, doc) =>
  field.type === 'secret' ? ownSecret(integration, field, doc) : asObject(doc?.values)[field.key] || undefined;

// Secrets that were saved in the panel and will not open any more. While there
// is even one, the server uses nothing the panel saved for that service (see
// unlock() in integrations/store.js).
const unreadableSecrets = (integration, doc) =>
  integration.fields.filter(
    (field) =>
      field.type === 'secret' &&
      asObject(doc?.secrets)[field.key] &&
      ownSecret(integration, field, doc) === undefined
  );

// What the service would run on: the panel's value, else the server's.
const effective = (integration, field, doc) => {
  const own = ownValue(integration, field, doc);
  return hasValue(own) ? own : field.fromEnv();
};

const presentField = (integration, field, doc, setAside) => {
  const server = field.fromEnv();
  const stored =
    field.type === 'secret'
      ? Boolean(asObject(doc?.secrets)[field.key])
      : Boolean(asObject(doc?.values)[field.key]);

  const shown = {
    key: field.key,
    label: field.label,
    type: field.type,
    placeholder: field.placeholder || '',
    help: field.help || '',
    optional: Boolean(field.optional),
    ...(field.type === 'number' ? { min: field.min, max: field.max } : {}),
    // Where the value comes from.
    source: stored ? 'panel' : hasValue(server) ? 'server' : 'none',
    // Saved in the panel and not in use: a key saved for this service can no
    // longer be unlocked, so the server is running on its own values.
    notInUse: stored && setAside,
  };

  if (field.type === 'secret') {
    return {
      ...shown,
      hint: stored ? asObject(doc?.hints)[field.key] || '' : vault.hintOf(server || ''),
      // This is the one that will not unlock, and has to be entered again.
      unreadable: stored && ownSecret(integration, field, doc) === undefined,
    };
  }

  const own = asObject(doc?.values)[field.key];
  return {
    ...shown,
    value: String(hasValue(own) ? own : server ?? ''),
    // Google only: the server's own ID stays accepted next to the panel's.
    ...(integration.addsToEnv && stored && hasValue(server) && server !== own ? { alsoAccepted: server } : {}),
  };
};

const present = (integration, doc) => {
  const setAside = unreadableSecrets(integration, doc).length > 0;
  const fields = integration.fields.map((field) => presentField(integration, field, doc, setAside));
  const filled = fields.filter((field) => field.source !== 'none');
  return {
    key: integration.key,
    name: integration.name,
    purpose: integration.purpose,
    warning: integration.warning || '',
    steps: integration.steps,
    fields,
    // Google works with any one ID; every other service needs all its values.
    isConfigured: integration.addsToEnv
      ? filled.length > 0
      : fields.every((field) => field.optional || field.source !== 'none'),
    isCustomized: fields.some((field) => field.source === 'panel'),
    // What was saved here is not being used, and somebody has to enter the
    // keys again.
    needsAttention: setAside,
    updatedAt: doc?.updatedAt || null,
    updatedBy: doc?.updatedBy || null,
  };
};

const list = async () => {
  const docs = await IntegrationSetting.find({}).lean();
  const byKey = new Map(docs.map((doc) => [doc.key, doc]));
  return {
    integrations: INTEGRATIONS.map((integration) => present(integration, byKey.get(integration.key))),
    // False means the panel can show everything and save no keys.
    canSaveSecrets: vault.isReady(),
  };
};

/**
 * Reads what the panel sent for one service.
 *
 * An empty field means "leave it as it is": a secret is never sent to the
 * panel, so its box is always empty unless a new one was typed. Returns the
 * values that were actually given, or throws with everything wrong with them.
 */
const readInput = (integration, input = {}) => {
  const given = {};
  const problems = [];

  for (const field of integration.fields) {
    const raw = input[field.key];
    if (raw === undefined || raw === null) continue;
    const value = String(raw).trim();
    if (value === '') continue;

    if (field.type === 'number') {
      if (!/^\d+$/.test(value) || Number(value) < field.min || Number(value) > field.max) {
        problems.push(`${field.label}: enter a whole number from ${field.min} to ${field.max}.`);
        continue;
      }
      given[field.key] = String(Number(value));
      continue;
    }

    if (field.pattern && !field.pattern.test(value)) {
      problems.push(`${field.label}: ${field.patternHint}.`);
      continue;
    }
    given[field.key] = value;
  }

  if (problems.length) throw ApiError.badRequest(problems.join(' '));
  return given;
};

// The values the service would run on if `given` were saved.
const candidate = (integration, doc, given) =>
  Object.fromEntries(
    integration.fields.map((field) => [
      field.key,
      hasValue(given[field.key]) ? given[field.key] : effective(integration, field, doc),
    ])
  );

// Which of the given values would actually change something. A text box is
// sent back filled with the value in use, so "given" alone says nothing.
const changedFields = (integration, doc, given) =>
  integration.fields.filter(
    (field) =>
      hasValue(given[field.key]) && String(given[field.key]) !== String(effective(integration, field, doc) ?? '')
  );

const runTest = (integration, values) => testers[integration.key](values);

// 403, never 401: the panel signs the admin out on a 401, and a mistyped
// password is not a lost session.
const confirmPassword = async (actor, password) => {
  const user = await User.findById(actor._id).select('+password');
  if (!user || !(await user.comparePassword(password))) {
    throw new ApiError(403, 'That is not your password. Nothing was changed.', { code: 'WRONG_PASSWORD' });
  }
};

const record = (integration, action, fields, actor) =>
  IntegrationChange.create({
    integration: integration.key,
    action,
    fields: fields.map((field) => field.label),
    actorId: String(actor._id),
    actorName: actor.name,
    actorEmail: actor.email,
  });

// The servers pick a change up within half a minute by themselves; this makes
// the one that saved it use it at once.
const applyNow = () =>
  store.refresh().catch((err) => console.error('[settings] saved, but could not be applied yet:', err.message));

// Checks a set of keys with the provider and saves nothing. Open without a
// password: it changes nothing, and the keys it is given go only to the
// provider they are for.
const test = async (key, input) => {
  const integration = definitionFor(key);
  const given = readInput(integration, input);
  const doc = await IntegrationSetting.findOne({ key }).lean();
  return runTest(integration, candidate(integration, doc, given));
};

const update = async (key, { values: input, password }, actor) => {
  const integration = definitionFor(key);
  await confirmPassword(actor, password);

  const given = readInput(integration, input);
  const doc = await IntegrationSetting.findOne({ key }).lean();
  const changed = changedFields(integration, doc, given);
  if (changed.length === 0) throw ApiError.badRequest('Nothing was changed, so nothing was saved.');

  // Saving one field of a set that cannot be read would change nothing: the
  // server would go on setting the whole of it aside.
  const stillUnreadable = unreadableSecrets(integration, doc).filter((field) => !hasValue(given[field.key]));
  if (stillUnreadable.length && vault.isReady()) {
    throw ApiError.badRequest(
      `The ${stillUnreadable.map((field) => field.label.toLowerCase()).join(' and the ')} saved here earlier can no longer be read. Enter it again as well, or reset ${integration.name} to the server values.`
    );
  }

  if (changed.some((field) => field.type === 'secret') && !vault.isReady()) {
    throw new ApiError(
      503,
      'Keys cannot be saved yet: SETTINGS_ENCRYPTION_KEY has not been set on the server. This is a one-time step for your developer.',
      { code: 'VAULT_NOT_READY' }
    );
  }

  const result = await runTest(integration, candidate(integration, doc, given));
  if (!result.ok) {
    throw new ApiError(400, `Not saved. ${result.message}`, { code: 'CONNECTION_TEST_FAILED' });
  }

  const set = { updatedBy: actor.name };
  for (const field of changed) {
    const value = given[field.key];
    if (field.type === 'secret') {
      set[`secrets.${field.key}`] = vault.seal(value, slotOf(integration, field));
      set[`hints.${field.key}`] = vault.hintOf(value);
    } else {
      set[`values.${field.key}`] = value;
    }
  }

  const saved = await IntegrationSetting.findOneAndUpdate(
    { key },
    { $set: set },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  ).lean();
  await record(integration, 'update', changed, actor);
  await applyNow();

  return { integration: present(integration, saved), test: result };
};

// Back to the values the server was set up with.
const reset = async (key, { password }, actor) => {
  const integration = definitionFor(key);
  await confirmPassword(actor, password);

  const doc = await IntegrationSetting.findOneAndDelete({ key }).lean();
  if (!doc) throw ApiError.badRequest(`${integration.name} is already running on the server's own values.`);

  const cleared = integration.fields.filter((field) =>
    field.type === 'secret' ? asObject(doc.secrets)[field.key] : asObject(doc.values)[field.key]
  );
  await record(integration, 'reset', cleared, actor);
  await applyNow();

  return { integration: present(integration, null) };
};

const changes = async () => {
  const entries = await IntegrationChange.find({}).sort({ createdAt: -1 }).limit(30).lean();
  return entries.map((entry) => ({
    id: String(entry._id),
    integration: entry.integration,
    name: BY_KEY[entry.integration]?.name || entry.integration,
    action: entry.action,
    fields: entry.fields,
    actorName: entry.actorName,
    actorEmail: entry.actorEmail,
    at: entry.createdAt,
  }));
};

module.exports = { list, test, update, reset, changes };
