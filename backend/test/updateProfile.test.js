require('../testkit/safeEnv');

/**
 * PATCH /auth/me — the Complete Profile screen after sign-up, and Edit Profile.
 *
 * The app keeps a new account on Complete Profile until `profileComplete` is
 * true, so the flag and the field rules are part of the contract.
 *
 * No database: User.findById / User.exists are mocked and the "document" is a
 * real (unsaved) User whose save is stubbed.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const env = require('../src/config/env');
require('../testkit/safeEnv').assertSafe(env);
const { errorHandler } = require('../src/middleware/errorHandler');
const User = require('../src/models/User');
const authRoutes = require('../src/routes/auth.routes');

const ID = '65a000000000000000000010';
const token = () => jwt.sign({ sub: ID }, env.jwtSecret, { expiresIn: '5m' });

const freshUser = (fields = {}) => {
  const user = new User({ _id: ID, name: 'New Person', email: 'new@example.com', ...fields });
  user.save = async () => user;
  return user;
};

const patchMe = async (body) => {
  const app = express();
  app.use(express.json());
  app.use('/auth', authRoutes);
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((done) => server.once('listening', done));
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/auth/me`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  } finally {
    await new Promise((done) => server.close(done));
  }
};

test('a new account is not complete until it has a username and a phone', () => {
  assert.equal(freshUser().toJSON().profileComplete, false);
  assert.equal(freshUser({ username: 'jane' }).toJSON().profileComplete, false);
  assert.equal(freshUser({ phone: '+919876543210' }).toJSON().profileComplete, false);
  assert.equal(
    freshUser({ username: 'jane', phone: '+919876543210' }).toJSON().profileComplete,
    true
  );
});

test('filling in the profile completes it; username is stored lowercase, bio optional', async (t) => {
  const user = freshUser();
  t.mock.method(User, 'findById', async () => user);
  t.mock.method(User, 'exists', async () => null);

  const res = await patchMe({ name: 'Jane Doe', username: 'Jane.Doe', phone: '+91 98765 43210' });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.user.username, 'jane.doe');
  assert.equal(res.body.data.user.phone, '+91 98765 43210');
  assert.equal(res.body.data.user.bio, '');
  assert.equal(res.body.data.user.profileComplete, true);
});

test('a username someone else holds is a 409', async (t) => {
  t.mock.method(User, 'findById', async () => freshUser());
  t.mock.method(User, 'exists', async () => ({ _id: 'someone-else' }));
  const res = await patchMe({ username: 'taken', phone: '9876543210' });
  assert.equal(res.status, 409);
  assert.match(res.body.message, /already taken/);
});

test('bad fields are refused before anything is saved', async (t) => {
  const findById = t.mock.method(User, 'findById', async () => freshUser());
  for (const body of [
    { username: 'ab' }, // too short
    { username: 'has space' },
    { phone: '12345' }, // too few digits
    { phone: 'call me' },
    { bio: 'x'.repeat(161) },
    { email: 'other@example.com' }, // not editable here
  ]) {
    const res = await patchMe(body);
    assert.equal(res.status, 400, JSON.stringify(body));
  }
  // Only `protect` loads the user; the service never ran.
  assert.equal(findById.mock.callCount(), 6);
});
