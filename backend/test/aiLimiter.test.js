require('../testkit/safeEnv');

/**
 * The rate limiter in front of the AI planner must answer in the API's JSON
 * error shape (the library's default is a plain string the app cannot read) and
 * must count per signed-in user, never per IP.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const env = require('../src/config/env');
require('../testkit/safeEnv').assertSafe(env);
const { errorHandler } = require('../src/middleware/errorHandler');
const aiLimiter = require('../src/middleware/aiLimiter');

const { buildAiLimiter } = aiLimiter;

const serve = (limiter) =>
  new Promise((resolve) => {
    const app = express();
    // Stands in for `protect`: the limiter reads the user it leaves on the request.
    app.use((req, _res, next) => {
      req.user = { _id: req.get('x-test-user') };
      next();
    });
    app.post('/generate', limiter, (_req, res) => res.status(202).json({ success: true }));
    app.use(errorHandler);
    const server = app.listen(0, '127.0.0.1', () => {
      const post = async (user) => {
        const res = await fetch(`http://127.0.0.1:${server.address().port}/generate`, {
          method: 'POST',
          headers: { 'x-test-user': user },
        });
        return { status: res.status, type: res.headers.get('content-type'), body: await res.json() };
      };
      resolve({ post, close: () => new Promise((done) => server.close(done)) });
    });
  });

test('the request over the limit answers 429 in the JSON error shape, per user', async () => {
  const api = await serve(buildAiLimiter({ limit: 1, skip: () => false }));
  try {
    assert.equal((await api.post('user-a')).status, 202);

    const limited = await api.post('user-a');
    assert.equal(limited.status, 429);
    assert.match(limited.type, /application\/json/);
    assert.deepEqual(limited.body, {
      success: false,
      message: 'Too many AI requests. Try again in a few minutes.',
      code: 'AI_RATE_LIMITED',
    });

    // Same address, another account: its own counter.
    assert.equal((await api.post('user-b')).status, 202);
  } finally {
    await api.close();
  }
});

test('the app\'s own instance stands aside under NODE_ENV=test, so suites are never throttled', async () => {
  const api = await serve(aiLimiter);
  try {
    for (let i = 0; i < 25; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      assert.equal((await api.post('user-a')).status, 202);
    }
  } finally {
    await api.close();
  }
});
