require('../testkit/safeEnv');

/**
 * ai.service against the fake OpenAI server on 127.0.0.1: how answers are read,
 * how failures are classified, retried and billed, and when the breaker opens.
 * No database. The "API key" picks the fake's scenario.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const env = require('../src/config/env');
require('../testkit/safeEnv').assertSafe(env);
const ai = require('../src/services/ai.service');
const AiError = require('../src/utils/AiError');
const fakeOpenai = require('../scripts/fake-openai');

const FACTS = { destination: 'Jaipur, India', days: 2 };
const plan = () => ai.generateItinerary({ facts: FACTS, dayCount: 2, userId: 'user-1' });

let fake;

const failure = async (scenario) => {
  env.openai.apiKey = scenario;
  const err = await plan().then(
    () => assert.fail(`${scenario} should have failed`),
    (caught) => caught
  );
  assert.ok(err instanceof AiError, `${scenario}: ${err.message}`);
  return err;
};

test.before(async () => {
  // Far longer than safeEnv's OPENAI_TIMEOUT_MS (1.5 s), so "fake-slow" always times out.
  fake = await fakeOpenai.start({ slowMs: 8000, fallbackModel: env.openai.fallbackModel });
});
test.after(() => fake.close());

test.beforeEach(() => {
  env.openai.baseUrl = fake.url;
  env.openai.apiKey = 'fake-ok';
  fake.requests.length = 0;
  ai.resetBreaker();
  // Every failure is logged by the service. Expected here.
  test.mock.method(console, 'error', () => {});
  test.mock.method(console, 'warn', () => {});
});
test.afterEach(() => test.mock.restoreAll());

// ---- Reading a 200 ----------------------------------------------------------

test('a reasoning item comes first: the plan is still read, with usage and the model', async () => {
  const result = await plan();
  assert.equal(fake.lastRequest().body.model, env.openai.model);
  assert.equal(result.data.days.length, 2);
  assert.equal(result.billed, true);
  assert.equal(result.aiModel, env.openai.model);
  assert.deepEqual(result.usage, { inputTokens: 900, outputTokens: 3200, reasoningTokens: 600 });
});

test('isConfigured follows the key', () => {
  assert.equal(ai.isConfigured(), true);
  env.openai.apiKey = '';
  assert.equal(ai.isConfigured(), false);
});

for (const [scenario, kind] of [
  ['fake-refusal', 'REFUSED'],
  ['fake-filtered', 'REFUSED'],
  ['fake-truncated', 'TRUNCATED'],
  ['fake-garbage', 'BAD_OUTPUT'],
]) {
  test(`${scenario}: ${kind}, paid for, not retried, breaker untouched`, async () => {
    const err = await failure(scenario);
    assert.equal(err.kind, kind);
    assert.equal(err.billed, true);
    assert.deepEqual(err.usage, { inputTokens: 900, outputTokens: 3200, reasoningTokens: 600 });
    assert.equal(err.aiModel, env.openai.model);
    assert.equal(fake.requests.length, 1);
    assert.equal(ai.isBreakerOpen(), false);
  });
}

// ---- Failures that were not charged -------------------------------------------

for (const [scenario, kind] of [
  ['fake-401', 'AUTH'],
  ['fake-403', 'AUTH'],
  ['fake-quota', 'QUOTA'],
]) {
  test(`${scenario}: ${kind}, unbilled, never retried, opens the breaker`, async () => {
    const err = await failure(scenario);
    assert.equal(err.kind, kind);
    assert.equal(err.billed, false);
    assert.equal(fake.requests.length, 1);
    assert.equal(ai.isBreakerOpen(), true);
    ai.resetBreaker();
    assert.equal(ai.isBreakerOpen(), false);
  });
}

test('a rate-limit 429 is retried once after Retry-After and leaves the breaker closed', async () => {
  const startedAt = Date.now();
  const err = await failure('fake-rate');
  assert.equal(err.kind, 'RATE_LIMIT');
  assert.equal(err.billed, false);
  assert.equal(fake.requests.length, 2);
  assert.ok(Date.now() - startedAt >= 900, 'the retry did not wait for Retry-After: 1');
  assert.equal(ai.isBreakerOpen(), false);
});

test('a 5xx is retried once, and only once', async () => {
  const err = await failure('fake-500');
  assert.equal(err.kind, 'SERVER');
  assert.equal(err.billed, false);
  assert.equal(fake.requests.length, 2);
  assert.equal(ai.isBreakerOpen(), false);
});

test('a 5xx followed by a good answer: the retry delivers the plan', async () => {
  env.openai.apiKey = 'fake-flaky';
  const result = await plan();
  assert.equal(result.data.days.length, 2);
  assert.equal(fake.requests.length, 2);
});

test('nothing listening: NETWORK, unbilled, retried once', async () => {
  const gone = await fakeOpenai.start();
  await gone.close();
  env.openai.baseUrl = gone.url;
  const err = await failure('fake-ok');
  assert.equal(err.kind, 'NETWORK');
  assert.equal(err.billed, false);
  assert.equal(err.retryable, true);
});

test('no answer in time: TIMEOUT, counted as paid, never retried', async () => {
  const err = await failure('fake-slow');
  assert.equal(err.kind, 'TIMEOUT');
  assert.equal(err.billed, true);
  assert.equal(fake.requests.length, 1);
  assert.equal(ai.isBreakerOpen(), false);
});

// ---- Model fallback -----------------------------------------------------------

for (const scenario of ['fake-modelnotfound', 'fake-modelnotfound-403']) {
  test(`${scenario}: the fallback model plans the trip and the breaker stays closed`, async () => {
    env.openai.apiKey = scenario;
    const result = await plan();
    assert.deepEqual(
      fake.requests.map((request) => request.body.model),
      [env.openai.model, env.openai.fallbackModel]
    );
    assert.equal(result.aiModel, env.openai.fallbackModel);
    assert.equal(result.data.days.length, 2);
    assert.equal(ai.isBreakerOpen(), false);
  });
}

test('neither model exists: MODEL_NOT_FOUND after one try each, and the breaker opens', async () => {
  const err = await failure('fake-nomodel');
  assert.equal(err.kind, 'MODEL_NOT_FOUND');
  assert.equal(err.billed, false);
  assert.equal(fake.requests.length, 2);
  assert.equal(ai.isBreakerOpen(), true);
});

// ---- Test-mode guard ----------------------------------------------------------

test('under NODE_ENV=test a base URL that is not this machine is refused before any request', async () => {
  for (const baseUrl of ['https://api.openai.com/v1', 'http://10.0.0.5:4010/v1']) {
    env.openai.baseUrl = baseUrl;
    await assert.rejects(plan(), /Refusing to call/);
  }
  assert.equal(fake.requests.length, 0);
});
