require('../testkit/safeEnv');

/**
 * How codes reach people, and what happens when they can't.
 *
 * Test mode: Resend's onboarding@resend.dev sender only delivers to the Resend
 * account owner, so while it is the sender a sign-up code comes back to the
 * app, which shows it on the code screen. A password reset code never does.
 *
 * Any other sender: codes are emailed. A refused email used to surface as a
 * plain Error, which the production error handler turns into "Internal server
 * error", and the failed attempt still started the resend cooldown and used up
 * a place in the hourly cap.
 *
 * No database and no network: User reads and writes, the DNS check and the
 * emails themselves are mocked.
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

const TEST_SENDER = 'Splix <onboarding@resend.dev>';
const OWN_DOMAIN_SENDER = 'Splix <no-reply@splix-mail.example>';

const RESEND_REFUSAL = new Error(
  'Resend responded 403: {"statusCode":403,"name":"validation_error","message":"You can only send testing emails to your own email address"}'
);

// The live server runs in production mode, where a 500 loses its message and
// the no-provider development code is never handed out.
const asProduction = (t) => {
  const before = env.nodeEnv;
  env.nodeEnv = 'production';
  t.after(() => {
    env.nodeEnv = before;
  });
};

// The sender as the server was set up with; nothing is saved in the panel here.
const withSender = (t, from) => {
  const before = env.email.from;
  env.email.from = from;
  t.after(() => {
    env.email.from = before;
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

// User.findOne(...).select(...) resolves to whatever `lookup()` returns then.
const findsUser = (t, lookup) => t.mock.method(User, 'findOne', () => ({ select: async () => lookup() }));

const quietly = (t) => {
  t.mock.method(console, 'error', () => {});
  t.mock.method(console, 'warn', () => {});
  t.mock.method(User.prototype, 'save', async function save() {
    return this;
  });
};

// Sign-up as the app does it: the DNS check passes, no account exists yet.
const signsUpFresh = (t) => {
  t.mock.method(dns, 'resolveMx', async () => [{ exchange: 'mx.example.test', priority: 10 }]);
  const state = { user: null };
  findsUser(t, () => state.user);
  t.mock.method(User, 'create', async (fields) => {
    state.user = new User(fields);
    return state.user;
  });
  return state;
};

const NEW_PERSON = { name: 'New Person', email: 'new.person@example.com', password: 'long-enough-1' };

const unverifiedAccount = (otp) =>
  new User({ name: 'Waiting', email: 'waiting@example.com', emailVerified: false, otp });

test('the test sender is recognised however it is written', (t) => {
  withSender(t, '');
  const usesTestSender = (from) => {
    env.email.from = from;
    return emailService.usesTestSender();
  };
  for (const from of [TEST_SENDER, 'onboarding@resend.dev', ' Splix <ONBOARDING@Resend.dev> ']) {
    assert.equal(usesTestSender(from), true, from);
  }
  for (const from of [OWN_DOMAIN_SENDER, 'no-reply@splix.app', 'Splix <x@notresend.dev>', 'Splix <x@resend.dev.example>']) {
    assert.equal(usesTestSender(from), false, from);
  }
});

test('test mode: a sign-up code is shown in the app, not emailed, and signs the person in', async (t) => {
  asProduction(t);
  withSender(t, TEST_SENDER);
  quietly(t);
  const state = signsUpFresh(t);
  const send = t.mock.method(emailService, 'sendVerificationCode', async () => ({ delivered: true }));
  t.mock.method(emailService, 'sendWelcome', () => {});

  const signedUp = await post('/register', NEW_PERSON);
  assert.equal(signedUp.status, 201);
  assert.equal(signedUp.body.data.verificationRequired, true);
  assert.match(signedUp.body.data.devOtp, /^\d{6}$/);
  assert.equal(send.mock.callCount(), 0);

  const verified = await post('/verify-email', { email: NEW_PERSON.email, otp: signedUp.body.data.devOtp });
  assert.equal(verified.status, 200);
  assert.ok(verified.body.data.token);
  assert.equal(state.user.emailVerified, true);
});

test('test mode: an unverified account signing in gets its code on screen', async (t) => {
  asProduction(t);
  withSender(t, TEST_SENDER);
  quietly(t);
  const user = unverifiedAccount(undefined);
  user.password = 'stored-hash';
  findsUser(t, () => user);
  t.mock.method(User.prototype, 'comparePassword', async () => true);

  const res = await post('/login', { email: user.email, password: 'long-enough-1' });
  assert.equal(res.status, 403);
  assert.equal(res.body.code, 'EMAIL_NOT_VERIFIED');
  assert.match(res.body.devOtp, /^\d{6}$/);
});

test('test mode never shows a password reset code', async (t) => {
  asProduction(t);
  withSender(t, TEST_SENDER);
  quietly(t);
  const user = new User({ name: 'Verified', email: 'verified@example.com', emailVerified: true });
  findsUser(t, () => user);
  const send = t.mock.method(emailService, 'sendPasswordResetCode', async () => {
    throw RESEND_REFUSAL;
  });

  const refused = await post('/forgot-password', { email: user.email });
  assert.equal(send.mock.callCount(), 1);
  assert.equal(refused.status, 503);
  assert.equal(refused.body.devOtp, undefined);

  // Even when Resend does deliver it (the account owner's own inbox).
  send.mock.mockImplementation(async () => ({ delivered: true }));
  const sent = await post('/forgot-password', { email: user.email });
  assert.equal(sent.status, 200);
  assert.equal(sent.body.data.devOtp, undefined);
});

test('a sign-up whose code email is refused says so, not "Internal server error"', async (t) => {
  asProduction(t);
  withSender(t, OWN_DOMAIN_SENDER);
  quietly(t);
  const state = signsUpFresh(t);
  t.mock.method(emailService, 'sendVerificationCode', async () => {
    throw RESEND_REFUSAL;
  });

  const res = await post('/register', NEW_PERSON);

  assert.equal(res.status, 503);
  assert.equal(res.body.code, 'EMAIL_NOT_SENT');
  assert.match(res.body.message, /couldn't send the email with your code/i);
  assert.equal(res.body.devOtp, undefined);
  // No code went out, so none is left on the account to wait out.
  assert.equal(state.user.otp, undefined);
});

test('a refused resend starts no cooldown and keeps the earlier code', async (t) => {
  asProduction(t);
  withSender(t, OWN_DOMAIN_SENDER);
  quietly(t);
  const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
  const user = unverifiedAccount({
    hash: 'earlier-code-hash',
    purpose: 'verify-email',
    expiresAt: new Date(Date.now() + 8 * 60 * 1000),
    attempts: 0,
    lastSentAt: twoMinutesAgo,
    windowStart: twoMinutesAgo,
    sentInWindow: 1,
  });
  findsUser(t, () => user);
  const send = t.mock.method(emailService, 'sendVerificationCode', async () => {
    throw RESEND_REFUSAL;
  });

  const refused = await post('/resend-code', { email: user.email, purpose: 'verify-email' });
  assert.equal(refused.status, 503);
  assert.equal(refused.body.code, 'EMAIL_NOT_SENT');
  assert.equal(user.otp.hash, 'earlier-code-hash');
  assert.equal(user.otp.sentInWindow, 1);
  assert.deepEqual(user.otp.lastSentAt, twoMinutesAgo);

  // Once mail goes through, asking again straight away works: no 429, and the
  // code went by email, not back to the app.
  send.mock.mockImplementation(async () => ({ delivered: true }));
  const sent = await post('/resend-code', { email: user.email, purpose: 'verify-email' });
  assert.equal(sent.status, 200);
  assert.equal(sent.body.data.sent, true);
  assert.equal(sent.body.data.devOtp, undefined);
  assert.equal(user.otp.sentInWindow, 2);
  assert.notEqual(user.otp.hash, 'earlier-code-hash');
});
