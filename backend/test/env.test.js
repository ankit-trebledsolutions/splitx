require('../testkit/safeEnv');

/**
 * The OpenAI block of config/env. Only env.js is loaded here, several times
 * over with different variables; nothing that could connect anywhere is.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const ENV_PATH = require.resolve('../src/config/env');
const AI_KEYS = [
  'OPENAI_API_KEY',
  'OPENAI_MODEL',
  'OPENAI_FALLBACK_MODEL',
  'OPENAI_TIMEOUT_MS',
  'OPENAI_BASE_URL',
  'AI_ITINERARY_USER_DAILY_CAP',
  'AI_ITINERARY_GROUP_DAILY_CAP',
  'AI_ITINERARY_GLOBAL_DAILY_CAP',
];

// Loads a fresh copy of env.js under `overrides`, then puts the variables back.
const loadEnv = (overrides) => {
  const touched = [...AI_KEYS, 'NODE_ENV'];
  const saved = touched.map((key) => [key, process.env[key]]);
  for (const key of AI_KEYS) delete process.env[key];
  Object.assign(process.env, overrides);
  delete require.cache[ENV_PATH];
  try {
    return require(ENV_PATH);
  } finally {
    delete require.cache[ENV_PATH];
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

// Production mode warns about every optional service that is not set up. Expected here.
test.beforeEach(() => test.mock.method(console, 'warn', () => {}));
test.afterEach(() => test.mock.restoreAll());

test('no OpenAI variables at all: the config loads, with the documented defaults', () => {
  const { openai } = loadEnv({});
  assert.deepEqual(openai, {
    apiKey: '',
    model: 'gpt-5.6-luna',
    fallbackModel: 'gpt-5.4-mini',
    timeoutMs: 90000,
    baseUrl: 'https://api.openai.com/v1',
    userDailyCap: 5,
    groupDailyCap: 3,
    globalDailyCap: 200,
  });
});

test('production without a key still boots, and says so once', () => {
  const { openai, nodeEnv } = loadEnv({ NODE_ENV: 'production' });
  assert.equal(nodeEnv, 'production');
  assert.equal(openai.apiKey, '');
  const warnings = console.warn.mock.calls.map((call) => String(call.arguments[0]));
  assert.equal(warnings.filter((line) => line.includes('OPENAI_API_KEY is not set')).length, 1);
});

test('production ignores OPENAI_BASE_URL, so the key can only ever go to OpenAI', () => {
  const override = { OPENAI_API_KEY: 'fake-ok', OPENAI_BASE_URL: 'http://127.0.0.1:4010/v1' };
  assert.equal(loadEnv({ ...override, NODE_ENV: 'production' }).openai.baseUrl, 'https://api.openai.com/v1');
  assert.equal(loadEnv({ ...override, NODE_ENV: 'development' }).openai.baseUrl, 'http://127.0.0.1:4010/v1');
});

test('a number that is not a number falls back to its default instead of switching a cap off', () => {
  const { openai } = loadEnv({
    OPENAI_TIMEOUT_MS: 'ninety seconds',
    AI_ITINERARY_USER_DAILY_CAP: 'five',
    AI_ITINERARY_GROUP_DAILY_CAP: '',
    AI_ITINERARY_GLOBAL_DAILY_CAP: '0',
  });
  assert.equal(openai.timeoutMs, 90000);
  assert.equal(openai.userDailyCap, 5);
  assert.equal(openai.groupDailyCap, 3);
  // Zero is a real choice: it turns the planner off without removing the key.
  assert.equal(openai.globalDailyCap, 0);
});
