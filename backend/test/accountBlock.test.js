require('../testkit/safeEnv');

/**
 * Blocking an account from the admin panel has to reach the mobile app, not
 * just the panel.
 *
 * The rule that matters: the check runs on EVERY request, not only at sign-in.
 * A blocked person is usually already signed in with a token good for days, so
 * a login-only check would leave them using the app until it expired.
 *
 * No database: User.findById is mocked, which is all `protect` uses.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const env = require('../src/config/env');
require('../testkit/safeEnv').assertSafe(env);
const { errorHandler } = require('../src/middleware/errorHandler');
const User = require('../src/models/User');
const { protect } = require('../src/middleware/auth');

const ID = '65a000000000000000000009';
const appToken = () => jwt.sign({ sub: ID }, env.jwtSecret, { expiresIn: '5m' });

const call = async (middlewares) => {
  const app = express();
  app.get('/thing', ...middlewares, (_req, res) => res.json({ success: true }));
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((done) => server.once('listening', done));
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/thing`, {
      headers: { Authorization: `Bearer ${appToken()}` },
    });
    return { status: res.status, body: await res.json() };
  } finally {
    await new Promise((done) => server.close(done));
  }
};

test('a blocked account is cut off on its next request, token still valid', async (t) => {
  t.mock.method(User, 'findById', async () => ({ _id: ID, name: 'Blocked', isActive: false }));

  const res = await call([protect]);
  assert.equal(res.status, 403);
  // The app branches on the code, so it is part of the contract in a way the
  // wording is not. Renaming it silently breaks sign-out on the phone.
  assert.equal(res.body.code, 'ACCOUNT_SUSPENDED');
  assert.match(res.body.message, /blocked by an administrator/i);
});

test('an active account is unaffected', async (t) => {
  t.mock.method(User, 'findById', async () => ({ _id: ID, name: 'Fine', isActive: true }));
  assert.equal((await call([protect])).status, 200);
});

test('an account predating the field is NOT treated as blocked', async (t) => {
  // Every account created before the admin panel existed has no isActive field.
  // Mongoose fills the default in on read, but a check written as `!user.isActive`
  // would lock all 14 existing users out of the app the moment this shipped.
  // Hence `=== false`, and hence this test.
  let stored = { _id: ID, name: 'Legacy' }; // no isActive key at all
  t.mock.method(User, 'findById', async () => stored);
  assert.equal((await call([protect])).status, 200);

  stored = { _id: ID, name: 'Legacy', isActive: undefined };
  assert.equal((await call([protect])).status, 200);
});
