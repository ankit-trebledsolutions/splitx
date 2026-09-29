require('../testkit/safeEnv');

/**
 * Which keys a service runs on.
 *
 * The rule is simple — the admin panel's value if there is one, the server's
 * own otherwise — and everything that sends an email, stores a photo or starts
 * a call now depends on it. So does the promise that the panel cannot take a
 * service down: whatever is wrong with what it stored, the server's own value
 * is still there underneath.
 *
 * No database: the stored documents are handed to the store directly.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const env = require('../src/config/env');
require('../testkit/safeEnv').assertSafe(env);
const vault = require('../src/integrations/vault');
const store = require('../src/integrations/store');
const emailService = require('../src/services/email.service');
const storage = require('../src/storage');
const ai = require('../src/services/ai.service');

const sealed = (slot, value) => vault.seal(value, slot);

// What the panel would have stored for a service.
const saved = (key, { values = {}, secrets = {} } = {}) => ({
  key,
  values,
  secrets: Object.fromEntries(
    Object.entries(secrets).map(([field, value]) => [field, sealed(`${key}.${field}`, value)])
  ),
});

// Every test starts, and leaves, with nothing saved in the panel.
test.beforeEach(() => store.apply([]));
test.afterEach(() => {
  store.apply([]);
  test.mock.restoreAll();
});

// Changes config/env for one test and puts it back.
const withEnv = (t, changes) => {
  const original = {};
  for (const [path, value] of Object.entries(changes)) {
    const [group, name] = path.split('.');
    const target = name ? env[group] : env;
    const key = name || group;
    original[path] = target[key];
    target[key] = value;
  }
  t.after(() => {
    for (const [path, value] of Object.entries(original)) {
      const [group, name] = path.split('.');
      (name ? env[group] : env)[name || group] = value;
    }
  });
};

test('with nothing saved in the panel, every service runs on the server\'s own values', (t) => {
  withEnv(t, { 'email.resendApiKey': 're_from_the_server', 'email.from': 'Splix <server@splix.app>' });
  assert.deepEqual(store.resend(), { apiKey: 're_from_the_server', from: 'Splix <server@splix.app>' });
  assert.equal(store.stream().apiKey, env.streamApiKey);
  assert.equal(store.openai().model, env.openai.model);
});

test('a value saved in the panel is used instead, field by field', (t) => {
  withEnv(t, { 'email.resendApiKey': 're_from_the_server', 'email.from': 'Splix <server@splix.app>' });

  store.apply([saved('resend', { secrets: { apiKey: 're_from_the_panel' } })]);
  // Only the key was changed in the panel, so the address is still the server's.
  assert.deepEqual(store.resend(), { apiKey: 're_from_the_panel', from: 'Splix <server@splix.app>' });

  store.apply([
    saved('resend', { secrets: { apiKey: 're_from_the_panel' }, values: { from: 'Splix <panel@splix.app>' } }),
  ]);
  assert.deepEqual(store.resend(), { apiKey: 're_from_the_panel', from: 'Splix <panel@splix.app>' });
});

test('resetting in the panel returns a service to the server\'s own values', (t) => {
  withEnv(t, { 'email.resendApiKey': 're_from_the_server' });
  store.apply([saved('resend', { secrets: { apiKey: 're_from_the_panel' } })]);
  assert.equal(store.resend().apiKey, 're_from_the_panel');

  store.apply([]);
  assert.equal(store.resend().apiKey, 're_from_the_server');
});

test('a saved key that will not unlock costs the panel\'s values, never the service', (t) => {
  // The encryption key was changed, or the stored value was tampered with.
  const errors = t.mock.method(console, 'error', () => {});
  withEnv(t, { 'email.resendApiKey': 're_from_the_server', 'email.from': 'Splix <server@splix.app>' });

  const doc = saved('resend', { secrets: { apiKey: 're_from_the_panel' }, values: { from: 'Splix <panel@splix.app>' } });
  doc.secrets.apiKey = `${doc.secrets.apiKey.slice(0, -4)}AAAA`;
  store.apply([doc]);

  assert.equal(store.resend().apiKey, 're_from_the_server');
  // The address could still be read, and is set aside all the same: it was
  // saved for the panel's Resend account, and the server's may never have
  // heard of its domain. Every sign-up email would be refused.
  assert.equal(store.resend().from, 'Splix <server@splix.app>');
  assert.equal(errors.mock.callCount(), 1);
  assert.match(errors.mock.calls[0].arguments[0], /could not be read/);
  // The message names the service and never the value.
  assert.ok(!errors.mock.calls[0].arguments.join(' ').includes('re_from'));

  // Said once, not every time the settings are re-read.
  store.apply([doc]);
  assert.equal(errors.mock.callCount(), 1);
});

test('a key and a secret are never taken from two different places by accident', (t) => {
  t.mock.method(console, 'error', () => {});
  const serverKeys = { apiKey: env.streamApiKey, apiSecret: env.streamApiSecret };

  // The panel's key is plain text and readable; its secret will not unlock.
  const doc = saved('stream', { values: { apiKey: 'panelkey0001' }, secrets: { apiSecret: 'p'.repeat(64) } });
  doc.secrets.apiSecret = doc.secrets.apiSecret.replace(/^v1\./, 'v9.');
  store.apply([doc]);

  // The panel's key with the server's secret would sign tokens Stream rejects,
  // and nobody could make a call. The server's own pair still works.
  assert.deepEqual(store.stream(), serverKeys);

  // The same holds for a photo account.
  withEnv(t, { cloudinary: null });
  const photos = saved('cloudinary', {
    values: { cloudName: 'panel-cloud' },
    secrets: { apiKey: '123456789012345', apiSecret: 'a-secret-from-the-panel' },
  });
  photos.secrets.apiSecret = 'not-a-locked-value';
  store.apply([photos]);
  assert.equal(store.cloudinary(), null);
});

test('a document for a service that no longer exists is ignored', () => {
  assert.doesNotThrow(() => store.apply([{ key: 'mailchimp', values: { apiKey: 'x' }, secrets: {} }]));
});

test('the limits are numbers, whichever place they come from', (t) => {
  withEnv(t, { 'openai.userDailyCap': 5 });
  assert.strictEqual(store.openai().userDailyCap, 5);

  // The panel stores what was typed, which is text.
  store.apply([saved('openai', { values: { userDailyCap: '12', model: 'gpt-panel' } })]);
  const config = store.openai();
  assert.strictEqual(config.userDailyCap, 12);
  assert.equal(config.model, 'gpt-panel');
  // The rest of the OpenAI settings are not the panel's to change.
  assert.equal(config.baseUrl, env.openai.baseUrl);
  assert.equal(config.timeoutMs, env.openai.timeoutMs);
});

test('photo storage is an account or nothing: part of one is not used', (t) => {
  withEnv(t, { cloudinary: null });
  assert.equal(store.cloudinary(), null);
  assert.equal(storage.activeProvider, 'local');

  store.apply([saved('cloudinary', { values: { cloudName: 'splix' }, secrets: { apiKey: '123456789012345' } })]);
  assert.equal(store.cloudinary(), null);
  assert.equal(storage.activeProvider, 'local');

  store.apply([
    saved('cloudinary', {
      values: { cloudName: 'splix' },
      secrets: { apiKey: '123456789012345', apiSecret: 'a-secret-from-the-panel' },
    }),
  ]);
  assert.deepEqual(store.cloudinary(), {
    cloudName: 'splix',
    apiKey: '123456789012345',
    apiSecret: 'a-secret-from-the-panel',
  });
  // Uploads move to Cloudinary the moment the account is complete, no restart.
  assert.equal(storage.activeProvider, 'cloudinary');
});

test('Google IDs saved in the panel are accepted as well as the server\'s, never instead', (t) => {
  withEnv(t, { googleClientIds: ['1-server.apps.googleusercontent.com'] });

  store.apply([saved('google', { values: { webClientId: '2-panel.apps.googleusercontent.com' } })]);
  assert.deepEqual(store.googleClientIds(), [
    // Everybody on the current app version signs in with this one.
    '1-server.apps.googleusercontent.com',
    '2-panel.apps.googleusercontent.com',
  ]);

  // The same ID in both places is listed once.
  store.apply([saved('google', { values: { webClientId: '1-server.apps.googleusercontent.com' } })]);
  assert.deepEqual(store.googleClientIds(), ['1-server.apps.googleusercontent.com']);
});

test('listeners hear about the service that changed, and only when it really did', () => {
  const heard = [];
  const stop = store.onChange((key) => heard.push(key));

  store.apply([saved('resend', { secrets: { apiKey: 're_first' } })]);
  assert.deepEqual(heard, ['resend']);

  // Re-read from the database with nothing different: the stored text differs
  // every time a key is locked, the key itself does not.
  store.apply([saved('resend', { secrets: { apiKey: 're_first' } })]);
  assert.deepEqual(heard, ['resend']);

  store.apply([saved('resend', { secrets: { apiKey: 're_second' } })]);
  store.apply([]);
  assert.deepEqual(heard, ['resend', 'resend', 'resend']);

  stop();
  store.apply([saved('resend', { secrets: { apiKey: 're_third' } })]);
  assert.equal(heard.length, 3);
});

test('one failing listener does not stop the others, or the change', (t) => {
  t.mock.method(console, 'error', () => {});
  const heard = [];
  const stopBroken = store.onChange(() => {
    throw new Error('listener bug');
  });
  const stop = store.onChange((key) => heard.push(key));
  t.after(() => {
    stopBroken();
    stop();
  });

  store.apply([saved('stream', { secrets: { apiSecret: 'a'.repeat(40) } })]);
  assert.deepEqual(heard, ['stream']);
  assert.equal(store.stream().apiSecret, 'a'.repeat(40));
});

test('the next email is sent with the key and address saved in the panel', async (t) => {
  withEnv(t, { 'email.resendApiKey': 're_from_the_server', 'email.from': 'Splix <server@splix.app>' });
  const sent = t.mock.method(globalThis, 'fetch', async () => ({ ok: true, text: async () => '' }));
  const mail = { subject: 'Hello', html: '<p>Hello</p>', text: 'Hello' };

  await emailService.sendTest('admin@example.com', mail);
  store.apply([
    saved('resend', { secrets: { apiKey: 're_from_the_panel' }, values: { from: 'Splix <panel@splix.app>' } }),
  ]);
  await emailService.sendTest('admin@example.com', mail);

  const [before, after] = sent.mock.calls.map((call) => ({
    url: call.arguments[0],
    key: call.arguments[1].headers.Authorization,
    from: JSON.parse(call.arguments[1].body).from,
  }));
  assert.deepEqual(before, {
    url: 'https://api.resend.com/emails',
    key: 'Bearer re_from_the_server',
    from: 'Splix <server@splix.app>',
  });
  assert.deepEqual(after, {
    url: 'https://api.resend.com/emails',
    key: 'Bearer re_from_the_panel',
    from: 'Splix <panel@splix.app>',
  });
});

test('whether email is set up follows the panel too', (t) => {
  withEnv(t, { 'email.resendApiKey': '' });
  assert.equal(emailService.isConfigured(), false);
  store.apply([saved('resend', { secrets: { apiKey: 're_from_the_panel' } })]);
  assert.equal(emailService.isConfigured(), true);
});

test('a new OpenAI key is not punished for the old one\'s failure', async (t) => {
  t.mock.method(console, 'error', () => {});
  ai.resetBreaker();
  withEnv(t, { 'openai.apiKey': 'sk-revoked-on-the-server' });

  // OpenAI refuses the old key, and the planner switches itself off for ten
  // minutes so a dead key cannot use up everybody's daily plans.
  const asked = t.mock.method(globalThis, 'fetch', async () => ({
    ok: false,
    status: 401,
    headers: { get: () => null },
    json: async () => ({ error: { code: 'invalid_api_key' } }),
  }));
  await assert.rejects(ai.generateItinerary({ facts: { destination: 'Jaipur, India', days: 2 }, dayCount: 2, userId: 'user-1' }));
  assert.equal(asked.mock.calls[0].arguments[1].headers.Authorization, 'Bearer sk-revoked-on-the-server');
  assert.equal(ai.isBreakerOpen(), true);

  // The admin replaces it in the panel. Planning is available again at once,
  // not ten minutes later.
  store.apply([saved('openai', { secrets: { apiKey: 'sk-from-the-panel-0123456789' } })]);
  assert.equal(ai.isBreakerOpen(), false);
  assert.equal(ai.isConfigured(), true);
});
