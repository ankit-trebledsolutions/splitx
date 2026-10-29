require('../testkit/safeEnv');

/**
 * Asking a provider whether it accepts a set of keys.
 *
 * This is what stands between a typing mistake and a feature being down for
 * everyone, so what matters is that a bad key is never reported as a good one —
 * including when the provider cannot be reached to ask.
 *
 * Nothing leaves the machine: every outside call is replaced.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const env = require('../src/config/env');
require('../testkit/safeEnv').assertSafe(env);
const testers = require('../src/integrations/testers');

const answer = (status, body = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

// Replaces the outside world with `respond(url, init)` and records what was asked.
const outsideAnswers = (t, respond) => t.mock.method(testers.outside, 'fetch', async (url, init) => respond(url, init));

const RESEND = { apiKey: 're_a_key_0123456789', from: 'Splix <noreply@splix.app>' };
const OPENAI = { apiKey: 'sk-a-key-0123456789abcdef', model: 'gpt-main', fallbackModel: 'gpt-small' };
const R2 = { accountId: 'a'.repeat(32), accessKeyId: 'k'.repeat(32), secretAccessKey: 's'.repeat(64), bucket: 'splitx-media' };
const STREAM = { apiKey: 'abcdef123456', apiSecret: 'a'.repeat(64) };

test('in tests, a call that was not replaced is refused rather than sent', async () => {
  await assert.rejects(async () => testers.outside.fetch('https://api.resend.com/domains'), /No outside calls in tests/);
  await assert.rejects(async () => testers.outside.streamApp('key', 'secret'), /No outside calls in tests/);
  await assert.rejects(async () => testers.outside.r2PutAndRemove(R2), /No outside calls in tests/);
});

// ---- Resend -----------------------------------------------------------------

test('Resend: a key it accepts, sending from a verified domain', async (t) => {
  const asked = outsideAnswers(t, () =>
    answer(200, { data: [{ name: 'splix.app', status: 'verified' }, { name: 'old.example', status: 'pending' }] })
  );
  const result = await testers.resend(RESEND);
  assert.deepEqual(result, { ok: true, message: 'Resend accepted the key, and splix.app is verified.' });

  const [url, init] = asked.mock.calls[0].arguments;
  assert.equal(url, 'https://api.resend.com/domains');
  assert.equal(init.headers.Authorization, `Bearer ${RESEND.apiKey}`);
});

test('Resend: a key it refuses is not saved', async (t) => {
  outsideAnswers(t, () => answer(403, { name: 'invalid_api_key', message: 'API key is invalid' }));
  const result = await testers.resend(RESEND);
  assert.equal(result.ok, false);
  assert.match(result.message, /did not accept this key/);
});

test('Resend: a good key with a sender address the account cannot send from is not saved', async (t) => {
  // Saved like this, every sign-up email would be refused by Resend.
  outsideAnswers(t, () => answer(200, { data: [{ name: 'other.example', status: 'verified' }] }));
  const result = await testers.resend(RESEND);
  assert.equal(result.ok, false);
  assert.match(result.message, /splix\.app is not a verified domain/);
  assert.match(result.message, /other\.example/);

  // A domain that was added but never verified does not count.
  outsideAnswers(t, () => answer(200, { data: [{ name: 'splix.app', status: 'pending' }] }));
  assert.equal((await testers.resend(RESEND)).ok, false);
});

test('Resend: a subdomain of a verified domain is fine, a lookalike is not', async (t) => {
  outsideAnswers(t, () => answer(200, { data: [{ name: 'splix.app', status: 'verified' }] }));
  assert.equal((await testers.resend({ ...RESEND, from: 'Splix <hi@mail.splix.app>' })).ok, true);
  assert.equal((await testers.resend({ ...RESEND, from: 'hi@splix.app' })).ok, true);
  assert.equal((await testers.resend({ ...RESEND, from: 'Splix <hi@notsplix.app>' })).ok, false);
  assert.equal((await testers.resend({ ...RESEND, from: 'Splix <hi@splix.app.evil.example>' })).ok, false);
});

test('Resend: a send-only key is accepted, and says what could not be checked', async (t) => {
  outsideAnswers(t, () => answer(401, { name: 'restricted_api_key' }));
  const result = await testers.resend(RESEND);
  assert.equal(result.ok, true);
  assert.match(result.note, /sender address could not be checked/);
});

test('Resend: the test sender is accepted with a warning about who it reaches', async (t) => {
  outsideAnswers(t, () => answer(200, { data: [] }));
  const result = await testers.resend({ ...RESEND, from: 'Splix <onboarding@resend.dev>' });
  assert.equal(result.ok, true);
  assert.match(result.note, /only delivers to the inbox of the Resend account owner/);
});

// ---- OpenAI -----------------------------------------------------------------

test('OpenAI: a key it accepts, with a model it can use', async (t) => {
  const asked = outsideAnswers(t, () => answer(200, { id: 'gpt-main' }));
  const result = await testers.openai(OPENAI);
  assert.deepEqual(result, { ok: true, message: 'OpenAI accepted the key, and it can use the model "gpt-main".' });
  assert.equal(asked.mock.calls[0].arguments[0], `${env.openai.baseUrl}/models/gpt-main`);
});

test('OpenAI: a key it refuses is not saved', async (t) => {
  outsideAnswers(t, () => answer(401, { error: { code: 'invalid_api_key' } }));
  const result = await testers.openai(OPENAI);
  assert.equal(result.ok, false);
  assert.match(result.message, /did not accept this key/);
});

test('OpenAI: a model name it does not know is caught before a plan is ever asked for', async (t) => {
  outsideAnswers(t, (url) => answer(url.endsWith('/gpt-small') ? 200 : 404));
  const usesFallback = await testers.openai(OPENAI);
  assert.equal(usesFallback.ok, true);
  assert.match(usesFallback.note, /written by the fallback "gpt-small"/);

  outsideAnswers(t, () => answer(404));
  const neither = await testers.openai(OPENAI);
  assert.equal(neither.ok, false);
  assert.match(neither.message, /no access to the model "gpt-main" or to the fallback "gpt-small"/);
});

// ---- Cloudflare R2 ----------------------------------------------------------

// What the S3 client throws when R2 answers with an error.
const r2Error = (name, status) => Object.assign(new Error(name), { name, $metadata: { httpStatusCode: status } });
const r2Answers = (t, respond) => t.mock.method(testers.outside, 'r2PutAndRemove', async (keys) => respond(keys));

test('R2: keys that can store a file in the bucket', async (t) => {
  const asked = r2Answers(t, () => undefined);
  assert.deepEqual(await testers.r2(R2), {
    ok: true,
    message: 'Cloudflare R2 accepted the keys, and files can be stored in the bucket.',
  });
  assert.deepEqual(asked.mock.calls[0].arguments[0], R2);
});

test('R2: keys it refuses, or a token without access to the bucket, are not saved', async (t) => {
  for (const refusal of [r2Error('InvalidAccessKeyId', 403), r2Error('SignatureDoesNotMatch', 403), r2Error('AccessDenied', 403)]) {
    r2Answers(t, () => {
      throw refusal;
    });
    const result = await testers.r2(R2);
    assert.equal(result.ok, false, refusal.name);
    assert.match(result.message, /did not accept these keys/, refusal.name);
  }
});

test('R2: a bucket that does not exist is named in the answer', async (t) => {
  r2Answers(t, () => {
    throw r2Error('NoSuchBucket', 404);
  });
  assert.deepEqual(await testers.r2(R2), {
    ok: false,
    message: 'Cloudflare R2 has no bucket called "splitx-media" in this account.',
  });
});

test('R2: part of the set is refused without asking anybody', async (t) => {
  const asked = r2Answers(t, () => undefined);
  for (const field of Object.keys(R2)) {
    assert.equal((await testers.r2({ ...R2, [field]: '' })).ok, false, field);
  }
  assert.equal(asked.mock.callCount(), 0);
});

test('R2: the account ID cannot steer the keys to another address', async (t) => {
  // definitions.js refuses such an ID before it gets here; this is the second lock.
  const asked = r2Answers(t, () => undefined);
  const result = await testers.r2({ ...R2, accountId: 'evil.example.com/x?' });
  assert.equal(result.ok, false);
  assert.equal(asked.mock.callCount(), 0);
});

// ---- Stream -----------------------------------------------------------------

test('Stream: a key and secret it accepts', async (t) => {
  const asked = t.mock.method(testers.outside, 'streamApp', async () => ({ app: {} }));
  assert.deepEqual(await testers.stream(STREAM), { ok: true, message: 'Stream accepted the key and the secret.' });
  assert.deepEqual(asked.mock.calls[0].arguments, [STREAM.apiKey, STREAM.apiSecret]);
});

test('Stream: a secret it refuses is not saved', async (t) => {
  t.mock.method(testers.outside, 'streamApp', async () => {
    throw Object.assign(new Error('Stream error code 5: signature is not valid'), {
      metadata: { responseCode: 401 },
    });
  });
  const result = await testers.stream(STREAM);
  assert.equal(result.ok, false);
  assert.match(result.message, /did not accept this key and secret/);
});

// ---- Every provider ---------------------------------------------------------

test('a provider that cannot be reached is a failed check, not a passed one', async (t) => {
  outsideAnswers(t, () => {
    throw new Error('getaddrinfo ENOTFOUND');
  });
  t.mock.method(testers.outside, 'streamApp', async () => {
    throw new Error('fetch failed');
  });
  r2Answers(t, () => {
    throw new Error('getaddrinfo ENOTFOUND');
  });

  for (const [name, run] of [
    ['Resend', () => testers.resend(RESEND)],
    ['OpenAI', () => testers.openai(OPENAI)],
    ['Cloudflare R2', () => testers.r2(R2)],
    ['Stream', () => testers.stream(STREAM)],
  ]) {
    const result = await run();
    assert.equal(result.ok, false, name);
    assert.match(result.message, new RegExp(`${name} could not be reached`), name);
  }
});

test('a provider having a bad day is a failed check too', async (t) => {
  outsideAnswers(t, () => answer(503));
  r2Answers(t, () => {
    throw r2Error('InternalError', 503);
  });
  assert.equal((await testers.resend(RESEND)).ok, false);
  assert.equal((await testers.openai(OPENAI)).ok, false);
  const r2 = await testers.r2(R2);
  assert.equal(r2.ok, false);
  assert.match(r2.message, /answered with an error \(503\)/);
});

test('no answer ever repeats the key it was asked about', async (t) => {
  for (const status of [200, 401, 403, 404, 500]) {
    outsideAnswers(t, () => answer(status, { data: [], name: 'invalid_api_key' }));
    r2Answers(t, () => {
      if (status !== 200) throw r2Error('AccessDenied', status);
    });
    const results = [await testers.resend(RESEND), await testers.openai(OPENAI), await testers.r2(R2)];
    for (const result of results) {
      const said = `${result.message} ${result.note || ''}`;
      for (const secret of [RESEND.apiKey, OPENAI.apiKey, R2.accessKeyId, R2.secretAccessKey]) {
        assert.ok(!said.includes(secret), `${status}: ${said}`);
      }
    }
  }
});

test('Google: nothing to ask, so it says what cannot be proven from here', async () => {
  const result = await testers.google({ webClientId: '1-a.apps.googleusercontent.com', iosClientId: '', androidClientId: '' });
  assert.equal(result.ok, true);
  assert.match(result.note, /only be proven by signing in/);
  assert.equal((await testers.google({ webClientId: '', iosClientId: '', androidClientId: '' })).ok, false);
});
