require('../testkit/safeEnv');

/**
 * The admin panel's connection test for Geoapify: a bad key is never reported
 * as a good one. Nothing leaves the machine.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const env = require('../src/config/env');
require('../testkit/safeEnv').assertSafe(env);
const testers = require('../src/integrations/testers');
const store = require('../src/integrations/store');
const { BY_KEY } = require('../src/integrations/definitions');

const answer = (status, body = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const outsideAnswers = (t, respond) => t.mock.method(testers.outside, 'fetch', async (url, init) => respond(url, init));

const KEY = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4';

test('Geoapify: a key it accepts', async (t) => {
  const asked = outsideAnswers(t, () => answer(200, { results: [{ place_id: 'x' }] }));
  assert.deepEqual(await testers.geoapify({ apiKey: KEY }), { ok: true, message: 'Geoapify accepted the key.' });
  const [url] = asked.mock.calls[0].arguments;
  const parsed = new URL(url);
  assert.equal(parsed.origin, env.geoapify.baseUrl);
  assert.equal(parsed.pathname, '/v1/geocode/search');
  assert.equal(parsed.searchParams.get('apiKey'), KEY);
  assert.equal(parsed.searchParams.get('limit'), '1');
});

test('Geoapify: a refused key, an exhausted key and an outage are all not saved', async (t) => {
  outsideAnswers(t, () => answer(401, { message: 'Invalid apiKey' }));
  let result = await testers.geoapify({ apiKey: KEY });
  assert.equal(result.ok, false);
  assert.match(result.message, /did not accept this key/);

  outsideAnswers(t, () => answer(429, {}));
  result = await testers.geoapify({ apiKey: KEY });
  assert.equal(result.ok, false);
  assert.match(result.message, /allowance for today/);

  outsideAnswers(t, () => answer(503, {}));
  assert.equal((await testers.geoapify({ apiKey: KEY })).ok, false);

  t.mock.method(testers.outside, 'fetch', async () => {
    throw new Error('ECONNRESET');
  });
  result = await testers.geoapify({ apiKey: KEY });
  assert.equal(result.ok, false);
  assert.match(result.message, /could not be reached/);

  assert.equal((await testers.geoapify({ apiKey: '' })).ok, false);
});

test('the panel entry: a secret key, two caps, and values that come from env until saved', () => {
  const integration = BY_KEY.geoapify;
  assert.ok(integration);
  assert.deepEqual(
    integration.fields.map((field) => [field.key, field.type]),
    [
      ['apiKey', 'secret'],
      ['userDailyCap', 'number'],
      ['globalDailyCap', 'number'],
    ]
  );
  assert.ok(integration.fields[0].pattern.test(KEY));
  assert.equal(integration.fields[0].pattern.test('has spaces in it'), false);
  assert.equal(integration.steps.length, 3);

  const values = store.geoapify();
  assert.equal(values.apiKey, 'fake-ok');
  assert.equal(values.userDailyCap, 30);
  assert.equal(values.globalDailyCap, 400);
  // The server's own settings ride along, untouchable from the panel.
  assert.equal(values.baseUrl, env.geoapify.baseUrl);
  assert.equal(values.timeoutMs, 1500);
  assert.equal(values.cacheHours, 24);
});
