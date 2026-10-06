require('../testkit/safeEnv');

/**
 * Changing a service's keys from the admin panel.
 *
 * The rules under test are the ones the admin was promised: a saved key is
 * never shown again, a key the provider refuses is never saved, and nothing
 * changes without the admin's own password.
 *
 * No database and no outside calls: the models and the providers are replaced.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const env = require('../src/config/env');
require('../testkit/safeEnv').assertSafe(env);
const User = require('../src/models/User');
const IntegrationSetting = require('../src/models/IntegrationSetting');
const IntegrationChange = require('../src/models/IntegrationChange');
const vault = require('../src/integrations/vault');
const store = require('../src/integrations/store');
const testers = require('../src/integrations/testers');
const service = require('../src/services/integration.service');

const ACTOR = { _id: '65a000000000000000000001', name: 'Test Owner', email: 'owner@example.com' };
const PASSWORD = 'the-right-password';
const NEW_KEY = 're_new_key_0123456789abWXYZ';

const query = (result) => ({ lean: async () => result });

// What the panel would have stored for a service.
const stored = (key, { values = {}, secrets = {} } = {}) => ({
  key,
  values,
  secrets: Object.fromEntries(
    Object.entries(secrets).map(([field, value]) => [field, vault.seal(value, `${key}.${field}`)])
  ),
  hints: Object.fromEntries(Object.entries(secrets).map(([field, value]) => [field, vault.hintOf(value)])),
  updatedBy: 'Somebody Earlier',
  updatedAt: new Date('2026-09-01T10:00:00Z'),
});

/**
 * Stands in for the database and the providers. `existing` is what is already
 * saved; `accepts` is what the provider says about the keys it is shown.
 */
const world = (t, { existing = [], accepts = { ok: true, message: 'Accepted.' } } = {}) => {
  t.mock.method(console, 'error', () => {});
  t.mock.method(User, 'findById', () => ({
    select: async () => ({ comparePassword: async (given) => given === PASSWORD }),
  }));
  t.mock.method(IntegrationSetting, 'find', () => query(existing));
  t.mock.method(IntegrationSetting, 'findOne', ({ key }) => query(existing.find((doc) => doc.key === key) || null));

  const write = t.mock.method(IntegrationSetting, 'findOneAndUpdate', ({ key }, change) => {
    const before = existing.find((doc) => doc.key === key) || { key, values: {}, secrets: {}, hints: {} };
    const after = { ...before, values: { ...before.values }, secrets: { ...before.secrets }, hints: { ...before.hints } };
    for (const [path, value] of Object.entries(change.$set)) {
      const [group, field] = path.split('.');
      if (field) after[group][field] = value;
      else after[group] = value;
    }
    return query(after);
  });
  const remove = t.mock.method(IntegrationSetting, 'findOneAndDelete', ({ key }) =>
    query(existing.find((doc) => doc.key === key) || null)
  );
  const log = t.mock.method(IntegrationChange, 'create', async (entry) => entry);

  const asked = {};
  for (const name of ['resend', 'openai', 'r2', 'stream', 'google']) {
    asked[name] = t.mock.method(testers, name, async () => accepts);
  }
  t.after(() => store.apply([]));

  return { write, remove, log, asked };
};

const withEnv = (t, changes) => {
  const original = {};
  for (const [path, value] of Object.entries(changes)) {
    const [group, name] = path.split('.');
    original[path] = (name ? env[group] : env)[name || group];
    (name ? env[group] : env)[name || group] = value;
  }
  t.after(() => {
    for (const [path, value] of Object.entries(original)) {
      const [group, name] = path.split('.');
      (name ? env[group] : env)[name || group] = value;
    }
  });
};

const refused = (status, pattern) => (err) => {
  assert.equal(err.statusCode, status, err.message);
  assert.match(err.message, pattern);
  return true;
};

// ---- What the panel is shown ------------------------------------------------

test('the panel is told where each value comes from, and is never sent a secret', async (t) => {
  withEnv(t, {
    'email.resendApiKey': 're_server_key_0123456789SRVR',
    'email.from': 'Splix <server@splix.app>',
    'openai.apiKey': '',
  });
  world(t, { existing: [stored('stream', { secrets: { apiSecret: `${'s'.repeat(60)}PANL` } })] });

  const { integrations, canSaveSecrets } = await service.list();
  assert.equal(canSaveSecrets, true);
  assert.deepEqual(integrations.map((entry) => entry.key), ['resend', 'openai', 'r2', 'stream', 'google']);

  const field = (service_, key) => integrations.find((entry) => entry.key === service_).fields.find((f) => f.key === key);

  assert.deepEqual(
    { source: field('resend', 'apiKey').source, hint: field('resend', 'apiKey').hint },
    { source: 'server', hint: 'SRVR' }
  );
  assert.deepEqual(
    { source: field('resend', 'from').source, value: field('resend', 'from').value },
    { source: 'server', value: 'Splix <server@splix.app>' }
  );
  assert.deepEqual(
    { source: field('stream', 'apiSecret').source, hint: field('stream', 'apiSecret').hint },
    { source: 'panel', hint: 'PANL' }
  );
  assert.equal(field('openai', 'apiKey').source, 'none');
  assert.equal(integrations.find((entry) => entry.key === 'openai').isConfigured, false);
  assert.equal(integrations.find((entry) => entry.key === 'resend').isConfigured, true);

  // Whatever else changes about this response, no secret may ever be in it:
  // not the server's, not the panel's, not locked, not unlocked.
  const sent = JSON.stringify(integrations);
  for (const secret of ['re_server_key', 'ssssssss', env.streamApiSecret, 'v1.']) {
    assert.ok(!sent.includes(secret), `the response contains ${secret}`);
  }
  for (const entry of integrations) {
    for (const shown of entry.fields.filter((f) => f.type === 'secret')) {
      assert.equal(shown.value, undefined, `${entry.key}.${shown.key}`);
    }
  }
});

test('every service comes with its steps, the last of which is where the keys go', async (t) => {
  world(t);
  const { integrations } = await service.list();
  for (const entry of integrations) {
    assert.ok(entry.steps.length >= 3, entry.key);
    assert.match(entry.steps[0].title, /^Create/, entry.key);
    assert.match(entry.steps.at(-1).title, /^Paste/, entry.key);
    for (const step of entry.steps) {
      assert.ok(step.title && step.body, `${entry.key}: ${step.title}`);
      if (step.link) assert.match(step.link.url, /^https:\/\//, `${entry.key}: ${step.title}`);
    }
  }
});

test('a saved key that can no longer be unlocked is pointed out, with everything saved alongside it', async (t) => {
  const doc = stored('resend', { secrets: { apiKey: NEW_KEY }, values: { from: 'Splix <panel@splix.app>' } });
  world(t, { existing: [doc, stored('openai', { values: { userDailyCap: '9' } })] });
  withEnv(t, { settingsKey: 'a-different-encryption-key-0123456789' });

  const { integrations } = await service.list();
  const [resend, openai] = integrations;
  assert.equal(resend.needsAttention, true);

  const apiKey = resend.fields.find((f) => f.key === 'apiKey');
  assert.deepEqual(
    { source: apiKey.source, unreadable: apiKey.unreadable, notInUse: apiKey.notInUse },
    { source: 'panel', unreadable: true, notInUse: true }
  );
  // Readable, shown as saved, and marked as not being used.
  const from = resend.fields.find((f) => f.key === 'from');
  assert.deepEqual(
    { value: from.value, notInUse: from.notInUse },
    { value: 'Splix <panel@splix.app>', notInUse: true }
  );

  // A service with no secret saved has nothing that could fail to unlock.
  assert.equal(openai.needsAttention, false);
  assert.equal(openai.fields.find((f) => f.key === 'userDailyCap').notInUse, false);
});

test('a set that cannot be read is repaired by entering the key again, not by saving around it', async (t) => {
  withEnv(t, { 'email.resendApiKey': 're_server_key_0123456789SRVR', 'email.from': 'Splix <server@splix.app>' });
  const doc = stored('resend', { secrets: { apiKey: 're_lost_key_0123456789LOST' }, values: { from: 'Splix <panel@splix.app>' } });
  // Locked with an encryption key this server no longer has.
  doc.secrets.apiKey = doc.secrets.apiKey.replace(/^v1\./, 'v9.');
  const { write, asked } = world(t, { existing: [doc] });

  // Changing the address alone would leave the set unreadable, and the server
  // would go on ignoring all of it: a save that reports success and does nothing.
  await assert.rejects(
    service.update('resend', { values: { from: 'Splix <hello@splix.app>' }, password: PASSWORD }, ACTOR),
    refused(400, /api key saved here earlier can no longer be read\. Enter it again/)
  );
  assert.equal(write.mock.callCount(), 0);
  assert.equal(asked.resend.mock.callCount(), 0);

  await service.update('resend', { values: { apiKey: NEW_KEY }, password: PASSWORD }, ACTOR);
  // Checked as it will be used once saved: the new key with the address that
  // was saved alongside the old one.
  assert.deepEqual(asked.resend.mock.calls[0].arguments[0], { apiKey: NEW_KEY, from: 'Splix <panel@splix.app>' });
  assert.equal(vault.open(write.mock.calls[0].arguments[1].$set['secrets.apiKey'], 'resend.apiKey'), NEW_KEY);
});

// ---- Saving -----------------------------------------------------------------

test('a new key is checked with the provider, locked, and only then stored', async (t) => {
  withEnv(t, { 'email.resendApiKey': 're_server_key_0123456789SRVR', 'email.from': 'Splix <server@splix.app>' });
  const { write, log, asked } = world(t);

  const { integration, test: result } = await service.update(
    'resend',
    // The address box arrives filled with the value in use, untouched.
    { values: { apiKey: `  ${NEW_KEY}  `, from: 'Splix <server@splix.app>' }, password: PASSWORD },
    ACTOR
  );

  // The provider was shown what would be in use after the save.
  assert.deepEqual(asked.resend.mock.calls[0].arguments[0], { apiKey: NEW_KEY, from: 'Splix <server@splix.app>' });
  assert.equal(result.ok, true);

  const [filter, change, options] = write.mock.calls[0].arguments;
  assert.deepEqual(filter, { key: 'resend' });
  assert.equal(options.upsert, true);
  // Locked, and it opens to the key that was typed, spaces trimmed.
  assert.ok(!JSON.stringify(change).includes(NEW_KEY));
  assert.equal(vault.open(change.$set['secrets.apiKey'], 'resend.apiKey'), NEW_KEY);
  assert.equal(change.$set['hints.apiKey'], 'WXYZ');
  // The address was not changed, so it is not pinned to today's value.
  assert.equal(change.$set['values.from'], undefined);
  assert.equal(change.$set.updatedBy, 'Test Owner');

  const apiKey = integration.fields.find((f) => f.key === 'apiKey');
  assert.deepEqual({ source: apiKey.source, hint: apiKey.hint }, { source: 'panel', hint: 'WXYZ' });
  assert.ok(!JSON.stringify(integration).includes(NEW_KEY));

  // Who, what and when — and never the value.
  assert.deepEqual(log.mock.calls[0].arguments[0], {
    integration: 'resend',
    action: 'update',
    fields: ['API key'],
    actorId: ACTOR._id,
    actorName: 'Test Owner',
    actorEmail: 'owner@example.com',
  });
});

test('a key the provider refuses is not stored, and the admin is told why', async (t) => {
  const { write, log } = world(t, {
    accepts: { ok: false, message: 'Resend did not accept this key. Copy it again from Resend > API Keys.' },
  });

  await assert.rejects(
    service.update('resend', { values: { apiKey: NEW_KEY }, password: PASSWORD }, ACTOR),
    (err) => {
      assert.equal(err.statusCode, 400);
      assert.equal(err.code, 'CONNECTION_TEST_FAILED');
      assert.match(err.message, /^Not saved\. Resend did not accept this key/);
      return true;
    }
  );
  assert.equal(write.mock.callCount(), 0);
  assert.equal(log.mock.callCount(), 0);
});

test('the wrong password changes nothing, and does not sign the admin out', async (t) => {
  const { write, asked } = world(t);

  await assert.rejects(
    service.update('resend', { values: { apiKey: NEW_KEY }, password: 'a-guess' }, ACTOR),
    (err) => {
      // 401 is what the panel treats as a lost session.
      assert.equal(err.statusCode, 403);
      assert.equal(err.code, 'WRONG_PASSWORD');
      return true;
    }
  );
  await assert.rejects(service.reset('resend', { password: 'a-guess' }, ACTOR), refused(403, /not your password/));

  // Refused before the key was shown to anybody.
  assert.equal(asked.resend.mock.callCount(), 0);
  assert.equal(write.mock.callCount(), 0);
});

test('an empty box means "leave it as it is"', async (t) => {
  // A secret is never sent to the panel, so its box is empty unless a new one was typed.
  const existing = [stored('resend', { secrets: { apiKey: 're_kept_key_0123456789KEPT' } })];
  const { write, asked, log } = world(t, { existing });

  await service.update(
    'resend',
    { values: { apiKey: '', from: 'Splix <hello@splix.app>' }, password: PASSWORD },
    ACTOR
  );

  // Checked together with the key that is already saved.
  assert.deepEqual(asked.resend.mock.calls[0].arguments[0], {
    apiKey: 're_kept_key_0123456789KEPT',
    from: 'Splix <hello@splix.app>',
  });
  const change = write.mock.calls[0].arguments[1];
  assert.deepEqual(Object.keys(change.$set).sort(), ['updatedBy', 'values.from']);
  assert.deepEqual(log.mock.calls[0].arguments[0].fields, ['Sender address']);
});

test('saving without changing anything is refused rather than logged as a change', async (t) => {
  withEnv(t, { 'email.from': 'Splix <server@splix.app>' });
  const { write, log, asked } = world(t);

  await assert.rejects(
    service.update('resend', { values: { apiKey: '', from: 'Splix <server@splix.app>' }, password: PASSWORD }, ACTOR),
    refused(400, /Nothing was changed/)
  );
  assert.equal(asked.resend.mock.callCount(), 0);
  assert.equal(write.mock.callCount(), 0);
  assert.equal(log.mock.callCount(), 0);
});

test('values that cannot be right are refused before the provider is asked', async (t) => {
  const { write, asked } = world(t);
  const save = (key, values) => service.update(key, { values, password: PASSWORD }, ACTOR);

  await assert.rejects(save('resend', { apiKey: 'sk-this-is-an-openai-key-000' }), refused(400, /A Resend key starts with re_/));
  await assert.rejects(save('resend', { from: 'not an address' }), refused(400, /Sender address/));
  // A line break here would let the address carry a second header.
  await assert.rejects(save('resend', { from: 'Splix <a@splix.app>\nBcc: x@evil.example' }), refused(400, /Sender address/));
  await assert.rejects(save('openai', { userDailyCap: '-1' }), refused(400, /whole number from 0 to 1000/));
  await assert.rejects(save('openai', { userDailyCap: '2.5' }), refused(400, /whole number/));
  await assert.rejects(save('openai', { globalDailyCap: '999999999' }), refused(400, /whole number from 0 to 100000/));
  await assert.rejects(save('r2', { accountId: '../../evil' }), refused(400, /Account ID/));
  await assert.rejects(save('r2', { bucket: 'My Bucket' }), refused(400, /Bucket name/));
  await assert.rejects(save('google', { webClientId: 'my-client-id' }), refused(400, /apps\.googleusercontent\.com/));

  assert.equal(write.mock.callCount(), 0);
  for (const tester of Object.values(asked)) assert.equal(tester.mock.callCount(), 0);
});

test('a field the service does not have is ignored, not stored', async (t) => {
  const { write, asked } = world(t);
  await service.update(
    'openai',
    { values: { model: 'gpt-new', baseUrl: 'https://evil.example/v1', timeoutMs: '1' }, password: PASSWORD },
    ACTOR
  );

  // Where OpenAI lives is not the panel's to change: saved, it would send the
  // real key to whoever owned that address.
  assert.equal(asked.openai.mock.calls[0].arguments[0].baseUrl, undefined);
  assert.deepEqual(Object.keys(write.mock.calls[0].arguments[1].$set).sort(), ['updatedBy', 'values.model']);
});

test('without an encryption key on the server, a secret is refused rather than stored readable', async (t) => {
  const { write } = world(t);
  withEnv(t, { settingsKey: '' });

  assert.equal((await service.list()).canSaveSecrets, false);
  await assert.rejects(
    service.update('resend', { values: { apiKey: NEW_KEY }, password: PASSWORD }, ACTOR),
    (err) => {
      assert.equal(err.statusCode, 503);
      assert.equal(err.code, 'VAULT_NOT_READY');
      assert.match(err.message, /SETTINGS_ENCRYPTION_KEY/);
      return true;
    }
  );
  assert.equal(write.mock.callCount(), 0);

  // What is not secret can still be changed.
  await service.update('openai', { values: { userDailyCap: '9' }, password: PASSWORD }, ACTOR);
  assert.equal(write.mock.calls[0].arguments[1].$set['values.userDailyCap'], '9');
});

test('the server that saved a key starts using it at once', async (t) => {
  withEnv(t, { 'email.resendApiKey': 're_server_key_0123456789SRVR' });
  const existing = [];
  world(t, { existing });
  // What the database holds once the save has gone through.
  IntegrationSetting.findOneAndUpdate.mock.mockImplementation(({ key }, change) => {
    const doc = { key, values: {}, secrets: { apiKey: change.$set['secrets.apiKey'] }, hints: {} };
    existing.push(doc);
    return query(doc);
  });

  assert.equal(store.resend().apiKey, 're_server_key_0123456789SRVR');
  await service.update('resend', { values: { apiKey: NEW_KEY }, password: PASSWORD }, ACTOR);
  assert.equal(store.resend().apiKey, NEW_KEY);
});

// ---- Testing without saving -------------------------------------------------

test('"Test connection" asks the provider and stores nothing', async (t) => {
  const existing = [
    stored('r2', {
      values: { accountId: 'a'.repeat(32), bucket: 'splitx-media' },
      secrets: { accessKeyId: 'k'.repeat(32) },
    }),
  ];
  const { write, log, asked } = world(t, {
    existing,
    accepts: { ok: false, message: 'Cloudflare R2 did not accept these keys.' },
  });

  const result = await service.test('r2', { secretAccessKey: 's'.repeat(64) });
  // A refusal is the answer to the question, not an error.
  assert.deepEqual(result, { ok: false, message: 'Cloudflare R2 did not accept these keys.' });
  assert.deepEqual(asked.r2.mock.calls[0].arguments[0], {
    accountId: 'a'.repeat(32),
    accessKeyId: 'k'.repeat(32),
    secretAccessKey: 's'.repeat(64),
    bucket: 'splitx-media',
  });
  assert.equal(write.mock.callCount(), 0);
  assert.equal(log.mock.callCount(), 0);
});

// ---- Resetting --------------------------------------------------------------

test('resetting removes what the panel saved and records what it was', async (t) => {
  withEnv(t, { 'email.resendApiKey': 're_server_key_0123456789SRVR' });
  const existing = [stored('resend', { secrets: { apiKey: NEW_KEY }, values: { from: 'Splix <panel@splix.app>' } })];
  const { remove, log } = world(t, { existing });

  const { integration } = await service.reset('resend', { password: PASSWORD }, ACTOR);
  assert.deepEqual(remove.mock.calls[0].arguments[0], { key: 'resend' });
  assert.equal(integration.isCustomized, false);
  assert.equal(integration.fields.find((f) => f.key === 'apiKey').hint, 'SRVR');
  assert.deepEqual(log.mock.calls[0].arguments[0].fields, ['API key', 'Sender address']);
  assert.equal(log.mock.calls[0].arguments[0].action, 'reset');
});

test('resetting a service that was never changed says so', async (t) => {
  const { log } = world(t);
  await assert.rejects(service.reset('stream', { password: PASSWORD }, ACTOR), refused(400, /already running on the server/));
  assert.equal(log.mock.callCount(), 0);
});

test('a service that does not exist is not found', async (t) => {
  world(t);
  await assert.rejects(service.test('mailchimp', {}), (err) => err.statusCode === 404);
  await assert.rejects(service.update('__proto__', { values: {}, password: PASSWORD }, ACTOR), (err) => err.statusCode === 404);
});
