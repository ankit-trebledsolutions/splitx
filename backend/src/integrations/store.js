const env = require('../config/env');
const vault = require('./vault');
const { BY_KEY } = require('./definitions');

/**
 * The keys each outside service is running on, right now.
 *
 * Services used to read config/env once, when the server started, which is why
 * changing a key meant editing a file and restarting. They ask here instead,
 * every time they are about to use one:
 *
 *   a value saved in the admin panel, if there is one
 *   otherwise the value the server was set up with (config/env)
 *
 * What the panel saved is kept in memory, already unlocked, and re-read from
 * the database twice a minute — so a change reaches every copy of the server
 * without a restart, and no request waits on the database to find its key.
 * Until the first read finishes, and whenever the database cannot be reached,
 * everything runs on config/env exactly as it did before this existed.
 */

const REFRESH_MS = 30 * 1000;

// { resend: { apiKey: 're_...', from: '...' }, ... } — only what the panel set.
let saved = {};
let timer = null;
const listeners = new Set();
// A value that will not unlock is reported once, not twice a minute for ever.
const reported = new Set();

const asStored = (map) => (map instanceof Map ? Object.fromEntries(map) : map || {});

/**
 * What one stored document says, unlocked.
 *
 * All of it or none of it. If a secret will not open — the encryption key was
 * changed, the stored value was altered — nothing the panel saved for that
 * service is used, and it runs on the server's own values, which are a set
 * that belongs together. Using what could still be read would pair the panel's
 * Stream key with the server's Stream secret, or the panel's sender address
 * with a Resend account that has never heard of its domain: a service that
 * looks set up and fails on every call.
 */
const unlock = (doc) => {
  const integration = BY_KEY[doc.key];
  if (!integration) return null;

  const values = asStored(doc.values);
  const secrets = asStored(doc.secrets);
  const own = {};

  for (const field of integration.fields) {
    if (field.type !== 'secret') {
      if (values[field.key]) own[field.key] = values[field.key];
      continue;
    }
    const sealed = secrets[field.key];
    if (!sealed) continue;
    try {
      own[field.key] = vault.open(sealed, `${doc.key}.${field.key}`);
    } catch (err) {
      if (!reported.has(sealed)) {
        reported.add(sealed);
        console.error(
          `[settings] the ${integration.name} ${field.label.toLowerCase()} saved in the admin panel could not be read (${err.message}). ${integration.name} is running on the server's own values until it is saved again.`
        );
      }
      return {};
    }
  }
  return own;
};

const sameValues = (a = {}, b = {}) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every((key) => a[key] === b[key]);
};

// Replaces what is in memory and tells whoever asked to hear about it. Takes
// the documents rather than fetching them, so the rules above can be tested
// without a database.
const apply = (docs) => {
  const next = {};
  for (const doc of docs) {
    const own = unlock(doc);
    if (own) next[doc.key] = own;
  }

  const changed = Object.keys(BY_KEY).filter((key) => !sameValues(saved[key], next[key]));
  saved = next;
  for (const key of changed) {
    for (const listener of listeners) {
      try {
        listener(key);
      } catch (err) {
        console.error('[settings] a change listener failed:', err.message);
      }
    }
  }
  return changed;
};

const refresh = async () => {
  // Required here, not at the top: services load this file long before the
  // database is connected, and tests load it with no database at all.
  const IntegrationSetting = require('../models/IntegrationSetting');
  return apply(await IntegrationSetting.find({}).lean());
};

// Called once by server.js, after the database is connected.
const start = async () => {
  await refresh().catch((err) =>
    console.error('[settings] could not read the admin panel settings, running on the server defaults:', err.message)
  );
  if (timer) return;
  timer = setInterval(() => {
    // The values in memory stay as they are: a database hiccup must not switch
    // a key back to an older one for thirty seconds.
    refresh().catch((err) => console.error('[settings] could not refresh:', err.message));
  }, REFRESH_MS);
  // Must not keep the process alive on shutdown.
  timer.unref();
};

const stop = () => {
  clearInterval(timer);
  timer = null;
};

// For something that remembers a verdict about a key (the AI circuit breaker)
// and has to forget it when the key is replaced.
const onChange = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const typed = (field, value) => (field.type === 'number' ? Number(value) : value);

// Every value of one service, each from the panel if it was set there and from
// the server otherwise. Read afresh on every call: tests change config/env as
// they go, and the panel changes `saved`.
const valuesOf = (key) => {
  const own = saved[key] || {};
  return Object.fromEntries(
    BY_KEY[key].fields.map((field) => [
      field.key,
      own[field.key] !== undefined ? typed(field, own[field.key]) : field.fromEnv(),
    ])
  );
};

const resend = () => valuesOf('resend');

// The timeouts and the address are the server's business and stay in config/env.
const openai = () => ({ ...env.openai, ...valuesOf('openai') });

// Null unless the account is complete, which is what sends uploads to the
// local folder on a machine with no storage account.
const r2 = () => {
  const values = valuesOf('r2');
  return values.accountId && values.accessKeyId && values.secretAccessKey && values.bucket ? values : null;
};

const stream = () => valuesOf('stream');

/**
 * Every client ID a Google sign-in may have been issued for.
 *
 * Added to the server's own list, never replacing it. The IDs are built into
 * the mobile app: if one saved in the panel took the place of the server's,
 * everybody on the current app version would be locked out of Google sign-in
 * until they updated, for a change that was meant to prepare the next version.
 */
const googleClientIds = () => [
  ...new Set([...env.googleClientIds, ...Object.values(saved.google || {})].filter(Boolean)),
];

module.exports = {
  start,
  stop,
  refresh,
  apply,
  onChange,
  valuesOf,
  resend,
  openai,
  r2,
  stream,
  googleClientIds,
};
