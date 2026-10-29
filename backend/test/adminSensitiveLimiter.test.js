require('../testkit/safeEnv');

/**
 * The brake on guessing an admin's password through the API key screen.
 *
 * It has to stop a stolen session from trying passwords without end, and it
 * must not get in the way of an admin who is simply having trouble with a key:
 * somebody pasting the wrong thing five times in a row is not attacking
 * anybody.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const env = require('../src/config/env');
require('../testkit/safeEnv').assertSafe(env);
const ApiError = require('../src/utils/ApiError');
const { errorHandler } = require('../src/middleware/errorHandler');
const { buildSensitiveLimiter, markWrongPassword } = require('../src/middleware/adminRateLimit');

// One route that answers however the request asks it to.
const serve = (limiter) =>
  new Promise((resolve) => {
    const app = express();
    // Stands in for adminProtect: the limiter counts per signed-in admin.
    app.use((req, _res, next) => {
      req.user = { _id: req.get('x-test-admin') };
      next();
    });
    app.put('/keys', limiter, (req, res, next) => {
      const outcome = req.get('x-test-outcome');
      if (outcome === 'wrong-password') {
        markWrongPassword(req);
        return next(new ApiError(403, 'That is not your password.', { code: 'WRONG_PASSWORD' }));
      }
      if (outcome === 'refused-key') {
        return next(new ApiError(400, 'Not saved. The provider refused this key.'));
      }
      return res.json({ success: true });
    });
    app.use(errorHandler);
    const server = app.listen(0, '127.0.0.1', () => {
      const put = async (admin, outcome) => {
        const res = await fetch(`http://127.0.0.1:${server.address().port}/keys`, {
          method: 'PUT',
          headers: { 'x-test-admin': admin, 'x-test-outcome': outcome },
        });
        return { status: res.status, body: await res.json() };
      };
      resolve({ put, close: () => new Promise((done) => server.close(done)) });
    });
  });

const withLimiter = async (limiter, run) => {
  const api = await serve(limiter);
  try {
    await run(api);
  } finally {
    await api.close();
  }
};

const withLimit = (limit, run) => withLimiter(buildSensitiveLimiter({ limit, skip: () => false }), run);

test('wrong passwords run out, and the answer is in the JSON error shape', async () => {
  await withLimit(3, async ({ put }) => {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      assert.equal((await put('admin-1', 'wrong-password')).status, 403, `attempt ${attempt}`);
    }
    const blocked = await put('admin-1', 'wrong-password');
    assert.equal(blocked.status, 429);
    assert.equal(blocked.body.success, false);
    assert.equal(blocked.body.code, 'RATE_LIMITED');
    assert.match(blocked.body.message, /wrong passwords/i);

    // Knowing the password does not help once the tries are used up: whoever
    // was guessing may just have guessed it.
    assert.equal((await put('admin-1', 'saved')).status, 429);
  });
});

test('a key the provider refused is not counted, however many times', async () => {
  await withLimit(3, async ({ put }) => {
    for (let attempt = 1; attempt <= 8; attempt += 1) {
      assert.equal((await put('admin-1', 'refused-key')).status, 400, `attempt ${attempt}`);
    }
    assert.equal((await put('admin-1', 'saved')).status, 200);
  });
});

test('saving successfully is not counted either', async () => {
  await withLimit(3, async ({ put }) => {
    for (let attempt = 1; attempt <= 8; attempt += 1) {
      assert.equal((await put('admin-1', 'saved')).status, 200, `attempt ${attempt}`);
    }
  });
});

test('one admin running out does not lock out another', async () => {
  await withLimit(2, async ({ put }) => {
    await put('admin-1', 'wrong-password');
    await put('admin-1', 'wrong-password');
    assert.equal((await put('admin-1', 'wrong-password')).status, 429);
    assert.equal((await put('admin-2', 'saved')).status, 200);
  });
});

test('the limiter stands aside under NODE_ENV=test, so suites are never throttled', async () => {
  await withLimiter(buildSensitiveLimiter({ limit: 1 }), async ({ put }) => {
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      assert.equal((await put('admin-1', 'wrong-password')).status, 403, `attempt ${attempt}`);
    }
  });
});
