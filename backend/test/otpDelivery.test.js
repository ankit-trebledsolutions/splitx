require('../testkit/safeEnv');

/**
 * When the email with a code cannot be sent.
 *
 * Resend's onboarding@resend.dev sender only delivers to the Resend account
 * owner, so on a server still using it every other sign-up was refused by
 * Resend. That surfaced as a plain Error, which the production error handler
 * turns into "Internal server error", and the failed attempt still started the
 * resend cooldown and used up a place in the hourly cap.
 *
 * No database and no network: User reads and writes, the DNS check and the
 * email itself are mocked.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const dns = require('dns').promises;
const express = require('express');
const env = require('../src/config/env');
require('../testkit/safeEnv').assertSafe(env);
const { errorHandler } = require('../src/middleware/errorHandler');
const User = require('../src/models/User');
const emailService = require('../src/services/email.service');
const authRoutes = require('../src/routes/auth.routes');

const RESEND_REFUSAL = new Error(
  'Resend responded 403: {"statusCode":403,"name":"validation_error","message":"You can only send testing emails to your own email address"}'
);

// The live server runs in production mode, where a 500 loses its message.
const asProduction = (t) => {
  const before = env.nodeEnv;
  env.nodeEnv = 'production';
  t.after(() => {
    env.nodeEnv = before;
  });
};

const post = async (path, body) => {
  const app = express();
  app.use(express.json());
  app.use('/auth', authRoutes);
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((done) => server.once('listening', done));
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/auth${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  } finally {
    await new Promise((done) => server.close(done));
  }
};

// User.findOne(...).select('+otp') resolves to `doc`.
const findsUser = (t, doc) => t.mock.method(User, 'findOne', () => ({ select: async () => doc }));

const quietly = (t) => {
  t.mock.method(console, 'error', () => {});
  t.mock.method(User.prototype, 'save', async function save() {
    return this;
  });
};

test('a sign-up whose code email is refused says so, not "Internal server error"', async (t) => {
  asProduction(t);
  quietly(t);
  t.mock.method(dns, 'resolveMx', async () => [{ exchange: 'mx.example.test', priority: 10 }]);
  findsUser(t, null);
  let created;
  t.mock.method(User, 'create', async (fields) => {
    created = new User(fields);
    return created;
  });
  t.mock.method(emailService, 'sendVerificationCode', async () => {
    throw RESEND_REFUSAL;
  });

  const res = await post('/register', {
    name: 'New Person',
    email: 'new.person@example.com',
    password: 'long-enough-1',
  });

  assert.equal(res.status, 503);
  assert.equal(res.body.code, 'EMAIL_NOT_SENT');
  assert.match(res.body.message, /couldn't send the email with your code/i);
  // No code went out, so none is left on the account to wait out.
  assert.equal(created.otp, undefined);
});

test('a refused resend starts no cooldown and keeps the earlier code', async (t) => {
  asProduction(t);
  quietly(t);
  const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
  const user = new User({
    name: 'Waiting',
    email: 'waiting@example.com',
    emailVerified: false,
    otp: {
      hash: 'earlier-code-hash',
      purpose: 'verify-email',
      expiresAt: new Date(Date.now() + 8 * 60 * 1000),
      attempts: 0,
      lastSentAt: twoMinutesAgo,
      windowStart: twoMinutesAgo,
      sentInWindow: 1,
    },
  });
  findsUser(t, user);
  const send = t.mock.method(emailService, 'sendVerificationCode', async () => {
    throw RESEND_REFUSAL;
  });

  const refused = await post('/resend-code', { email: user.email, purpose: 'verify-email' });
  assert.equal(refused.status, 503);
  assert.equal(refused.body.code, 'EMAIL_NOT_SENT');
  assert.equal(user.otp.hash, 'earlier-code-hash');
  assert.equal(user.otp.sentInWindow, 1);
  assert.deepEqual(user.otp.lastSentAt, twoMinutesAgo);

  // Once mail goes through, asking again straight away works: no 429.
  send.mock.mockImplementation(async () => ({ delivered: true }));
  const sent = await post('/resend-code', { email: user.email, purpose: 'verify-email' });
  assert.equal(sent.status, 200);
  assert.equal(sent.body.data.sent, true);
  assert.equal(user.otp.sentInWindow, 2);
  assert.notEqual(user.otp.hash, 'earlier-code-hash');
});
