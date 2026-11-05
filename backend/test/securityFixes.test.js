require('../testkit/safeEnv');

/**
 * Regression tests for the fixes from the November 2026 security audit
 * (SECURITY-AUDIT-2026-11-05.md). Each block names the finding it guards.
 *
 * The limiter and token-rule tests need no database. The rest run against a
 * local MongoDB in a database of their own (splix_test_security, dropped at the
 * end), so they never collide with faceScan.test.js, which empties splix_test.
 * They are skipped when no MongoDB answers on 127.0.0.1:27017.
 */
const fs = require('fs');
const path = require('path');
const dns = require('dns');
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const env = require('../src/config/env');
require('../testkit/safeEnv').assertSafe(env);
const app = require('../src/app');
const User = require('../src/models/User');
const Group = require('../src/models/Group');
const Message = require('../src/models/Message');
const { isAppSession, issuedBeforeReset } = require('../src/utils/sessionToken');
const { buildLoginLimiter, buildInviteLimiter } = require('../src/middleware/guessLimiter');
const { UPLOAD_DIR } = require('../src/storage/local.storage');

const DB_URI = 'mongodb://127.0.0.1:27017/splix_test_security';
const PASSWORD = 'Passw0rd!x';
let db = false;
let server;
let base;

const sign = (payload, options = {}) => jwt.sign(payload, env.jwtSecret, { expiresIn: '1h', ...options });
// A session signed two minutes ago, so a reset made "now" is clearly after it.
const oldSession = (userId) => sign({ sub: String(userId), iat: Math.floor(Date.now() / 1000) - 120 });

const call = async (method, url, { token, body, headers = {} } = {}) => {
  const res = await fetch(base + url, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // not JSON
  }
  return { status: res.status, body: json, headers: res.headers, text };
};

let n = 0;
const makeUser = (fields = {}) => {
  n += 1;
  return User.create({ name: `Person ${n}`, email: `person${n}@example.test`, password: PASSWORD, ...fields });
};

test.before(async () => {
  try {
    await mongoose.connect(DB_URI, { serverSelectionTimeoutMS: 2000 });
    await mongoose.connection.dropDatabase();
    db = true;
  } catch (err) {
    console.log(`securityFixes database tests skipped: no MongoDB at ${DB_URI} (${err.message})`);
  }
  server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  server?.close();
  if (db) {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});

const withDb = (name, run) =>
  test(name, async (t) => {
    if (!db) {
      t.skip('no MongoDB on 127.0.0.1:27017');
      return;
    }
    await run(t);
  });

// --- Token rules (no database) ----------------------------------------------

test('only a plain app session token counts as an app session', () => {
  assert.equal(isAppSession({ sub: 'u' }), true);
  assert.equal(isAppSession({ sub: 'u', purpose: 'password-reset' }), false);
  assert.equal(isAppSession({ sub: 'u', scope: 'admin' }), false);
  assert.equal(isAppSession(null), false);
});

test('a session from before the last password change has ended; one from the same second has not', () => {
  const resetAt = new Date('2026-11-05T10:00:00.700Z');
  const second = Math.floor(resetAt.getTime() / 1000);
  assert.equal(issuedBeforeReset({ iat: second - 1 }, { sessionsResetAt: resetAt }), true);
  assert.equal(issuedBeforeReset({ iat: second }, { sessionsResetAt: resetAt }), false);
  assert.equal(issuedBeforeReset({ iat: second - 1000 }, {}), false);
});

// --- Guessing brakes (no database) -------------------------------------------

const tinyApp = (limiter, { userId } = {}) => {
  const a = express();
  a.use(express.json());
  if (userId) a.use((req, _res, next) => { req.user = { _id: req.get('X-User') || userId }; next(); });
  a.post('/try', limiter, (req, res) => res.status(req.body.ok ? 200 : 401).json({}));
  a.use((err, _req, res, _next) => res.status(err.statusCode || 500).json({ code: err.code }));
  return new Promise((resolve) => {
    const s = a.listen(0, '127.0.0.1', () => resolve(s));
  });
};

const post = (s, body, headers = {}) =>
  fetch(`http://127.0.0.1:${s.address().port}/try`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  }).then((r) => r.status);

test('wrong passwords for one account are limited whatever address they claim to come from', async (t) => {
  const s = await tinyApp(buildLoginLimiter({ limit: 3, skip: () => false }));
  t.after(() => s.close());
  const statuses = [];
  for (let i = 0; i < 4; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    statuses.push(await post(s, { email: 'Victim@Example.com ' }, { 'X-Forwarded-For': `10.0.0.${i}` }));
  }
  assert.deepEqual(statuses, [401, 401, 401, 429]);
  // Another account is untouched, and a right password is never counted.
  assert.equal(await post(s, { email: 'someone@example.com', ok: true }), 200);
  assert.equal(await post(s, { email: 'someone@example.com' }), 401);
});

test('invite codes that do not exist are limited per account', async (t) => {
  const s = await tinyApp(buildInviteLimiter({ limit: 2, skip: () => false }), { userId: 'u1' });
  t.after(() => s.close());
  assert.equal(await post(s, { ok: true }), 200); // a code that works is not counted
  assert.equal(await post(s, {}), 401);
  assert.equal(await post(s, {}), 401);
  assert.equal(await post(s, {}), 429);
  assert.equal(await post(s, {}, { 'X-User': 'u2' }), 401); // someone else's counter
});

// --- Sessions ----------------------------------------------------------------

withDb('a password-reset token and an admin token do not open an app session', async () => {
  const user = await makeUser();
  const reset = sign({ sub: String(user._id), purpose: 'password-reset' }, { expiresIn: '15m' });
  const admin = sign({ sub: String(user._id), scope: 'admin' });
  assert.equal((await call('GET', '/api/v1/auth/me', { token: reset })).status, 401);
  assert.equal((await call('GET', '/api/v1/auth/me', { token: admin })).status, 401);
  assert.equal((await call('GET', '/api/v1/auth/me', { token: sign({ sub: String(user._id) }) })).status, 200);
});

withDb('changing the password ends the sessions signed in before it', async () => {
  const user = await makeUser();
  const before = oldSession(user._id);
  assert.equal((await call('GET', '/api/v1/auth/me', { token: before })).status, 200);

  const loaded = await User.findById(user._id).select('+password');
  loaded.password = 'An0ther!pass';
  await loaded.save();

  assert.equal((await call('GET', '/api/v1/auth/me', { token: before })).status, 401);
  assert.equal((await call('GET', '/api/v1/auth/me', { token: sign({ sub: String(user._id) }) })).status, 200);
});

withDb('a brand-new account and an edit that leaves the password alone end no session', async () => {
  const user = await makeUser();
  assert.equal(user.sessionsResetAt, undefined);
  const before = oldSession(user._id);
  await User.updateOne({ _id: user._id }, { $set: { bio: 'hi' } });
  const loaded = await User.findById(user._id);
  loaded.name = 'Renamed';
  await loaded.save();
  assert.equal((await call('GET', '/api/v1/auth/me', { token: before })).status, 200);
});

// --- Google sign-in onto an account nobody proved they own -------------------

const googleSays = (t, { sub, email }) => {
  if (!env.googleClientIds.includes('test-google-client')) env.googleClientIds.push('test-google-client');
  t.mock.method(OAuth2Client.prototype, 'verifyIdToken', async () => ({
    getPayload: () => ({ sub, email, email_verified: true, name: 'Google Name', picture: null }),
  }));
};

const signsInWithPassword = async (email) =>
  (await call('POST', '/api/v1/auth/login', { body: { email, password: PASSWORD } })).status === 200;

withDb('Google sign-in onto a never-verified account removes its password and ends its sessions', async (t) => {
  const user = await makeUser({ emailVerified: false });
  const earlier = oldSession(user._id);
  googleSays(t, { sub: 'google-unverified', email: user.email });

  const res = await call('POST', '/api/v1/auth/google', { body: { idToken: 'x' } });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.user._id, String(user._id));

  const after = await User.findById(user._id).select('+password');
  assert.equal(after.password, undefined);
  assert.equal(after.emailVerified, true);
  assert.equal(after.googleId, 'google-unverified');
  assert.equal(await signsInWithPassword(user.email), false);
  assert.equal((await call('GET', '/api/v1/auth/me', { token: earlier })).status, 401);
  assert.equal((await call('GET', '/api/v1/auth/me', { token: res.body.data.token })).status, 200);
});

withDb('Google sign-in onto an account verified only by an on-screen code does the same', async (t) => {
  const user = await makeUser({ emailVerified: true, emailUnproven: true });
  googleSays(t, { sub: 'google-unproven', email: user.email });
  assert.equal((await call('POST', '/api/v1/auth/google', { body: { idToken: 'x' } })).status, 200);
  const after = await User.findById(user._id).select('+password');
  assert.equal(after.password, undefined);
  assert.equal(after.emailUnproven, undefined);
  assert.equal(await signsInWithPassword(user.email), false);
});

withDb('Google sign-in onto a properly verified account keeps its password', async (t) => {
  const user = await makeUser({ emailVerified: true });
  const earlier = oldSession(user._id);
  googleSays(t, { sub: 'google-verified', email: user.email });
  assert.equal((await call('POST', '/api/v1/auth/google', { body: { idToken: 'x' } })).status, 200);
  assert.equal(await signsInWithPassword(user.email), true);
  assert.equal((await call('GET', '/api/v1/auth/me', { token: earlier })).status, 200);
});

withDb('a sign-up verified with a code shown in the app is marked as not proving the inbox', async (t) => {
  t.mock.method(dns.promises, 'resolveMx', async () => [{ exchange: 'mx.example.com', priority: 10 }]);
  const email = `shown${Date.now()}@example.com`;
  const signedUp = await call('POST', '/api/v1/auth/register', { body: { name: 'Shown Code', email, password: PASSWORD } });
  assert.equal(signedUp.status, 201);
  assert.match(signedUp.body.data.devOtp, /^\d{6}$/); // test sender: the code comes back
  const verified = await call('POST', '/api/v1/auth/verify-email', { body: { email, otp: signedUp.body.data.devOtp } });
  assert.equal(verified.status, 200);
  assert.equal(verified.body.data.user.emailUnproven, undefined); // never sent to the app
  const stored = await User.findOne({ email });
  assert.equal(stored.emailUnproven, true);
});

// --- Group data ---------------------------------------------------------------

const groupOf = async (members) =>
  Group.create({ name: 'Trip', createdBy: members[0]._id, admin: members[0]._id, members: members.map((m) => m._id) });

withDb('a task cannot be assigned, on update, to someone outside the group', async () => {
  const [alice, bob, outsider] = await Promise.all([makeUser(), makeUser(), makeUser()]);
  const group = await groupOf([alice, bob]);
  const created = await call('POST', `/api/v1/groups/${group._id}/tasks`, { token: sign({ sub: String(alice._id) }), body: { title: 'Cabs' } });
  assert.equal(created.status, 201);
  const update = await call('PATCH', `/api/v1/tasks/${created.body.data.task._id}`, {
    token: sign({ sub: String(bob._id) }),
    body: { assignees: [String(outsider._id)] },
  });
  assert.equal(update.status, 400);
  assert.ok(!update.text.includes(outsider.email));
  const ok = await call('PATCH', `/api/v1/tasks/${created.body.data.task._id}`, {
    token: sign({ sub: String(bob._id) }),
    body: { assignees: [String(alice._id)] },
  });
  assert.equal(ok.status, 200);
});

withDb('a task made from a message names that message\'s sender, never someone the request picks', async () => {
  const [alice, bob, outsider] = await Promise.all([makeUser(), makeUser(), makeUser()]);
  const group = await groupOf([alice, bob]);
  const other = await groupOf([outsider]);
  const token = sign({ sub: String(alice._id) });
  const url = `/api/v1/groups/${group._id}/tasks`;

  const named = await call('POST', url, { token, body: { title: 'x', source: { user: String(outsider._id), text: 'hi' } } });
  assert.equal(named.status, 400);
  assert.ok(!named.text.includes(outsider.email));

  const foreign = await Message.create({ group: other._id, sender: outsider._id, text: 'elsewhere' });
  const fromElsewhere = await call('POST', url, { token, body: { title: 'x', source: { message: String(foreign._id) } } });
  assert.equal(fromElsewhere.status, 400);

  const local = await Message.create({ group: group._id, sender: bob._id, text: 'book cabs' });
  const fromHere = await call('POST', url, {
    token,
    body: { title: 'x', source: { message: String(local._id), user: String(outsider._id), text: 'book cabs' } },
  });
  assert.equal(fromHere.status, 201);
  assert.equal(String(fromHere.body.data.task.source.user._id), String(bob._id));
});

withDb('task links must be web links', async () => {
  const [alice] = await Promise.all([makeUser()]);
  const group = await groupOf([alice]);
  const token = sign({ sub: String(alice._id) });
  const bad = await call('POST', `/api/v1/groups/${group._id}/tasks`, { token, body: { title: 'x', links: [{ url: 'upi://pay?pa=x' }] } });
  assert.equal(bad.status, 400);
  const good = await call('POST', `/api/v1/groups/${group._id}/tasks`, { token, body: { title: 'x', links: [{ url: 'https://example.com/a' }] } });
  assert.equal(good.status, 201);
});

withDb('an expense cannot list the same person twice', async () => {
  const [alice, bob] = await Promise.all([makeUser(), makeUser()]);
  const group = await groupOf([alice, bob]);
  const token = sign({ sub: String(alice._id) });
  const url = `/api/v1/groups/${group._id}/expenses`;
  const equal = await call('POST', url, { token, body: { description: 'd', amount: 10, paidBy: String(alice._id), participants: [String(bob._id), String(bob._id)] } });
  assert.equal(equal.status, 400);
  const exact = await call('POST', url, {
    token,
    body: { description: 'd', amount: 10, paidBy: String(alice._id), splitType: 'exact', splits: [{ user: String(bob._id), amount: 5 }, { user: String(bob._id), amount: 5 }] },
  });
  assert.equal(exact.status, 400);
  const fine = await call('POST', url, { token, body: { description: 'd', amount: 10, paidBy: String(alice._id), participants: [String(alice._id), String(bob._id)] } });
  assert.equal(fine.status, 201);
});

// --- Admin sign-in ------------------------------------------------------------

withDb('admin sign-in hands the token to scripts but never to a browser page', async () => {
  const staff = await makeUser({ role: 'super_admin', emailVerified: true });
  const body = { email: staff.email, password: PASSWORD };
  const fromScript = await call('POST', '/api/v1/admin/auth/login', { body });
  assert.equal(fromScript.status, 200);
  assert.ok(fromScript.body.data.token);
  const fromPanel = await call('POST', '/api/v1/admin/auth/login', { body, headers: { Origin: 'http://localhost:5173' } });
  assert.equal(fromPanel.status, 200);
  assert.equal(fromPanel.body.data.token, undefined);
  assert.match(fromPanel.headers.get('set-cookie') || '', /splitx_admin_token=/);
});

withDb('an admin session from before the password changed has ended', async () => {
  const staff = await makeUser({ role: 'super_admin', emailVerified: true });
  const earlier = sign({ sub: String(staff._id), scope: 'admin', iat: Math.floor(Date.now() / 1000) - 120 });
  assert.equal((await call('GET', '/api/v1/admin/auth/me', { token: earlier })).status, 200);
  const loaded = await User.findById(staff._id).select('+password');
  loaded.password = 'An0ther!pass';
  await loaded.save();
  assert.equal((await call('GET', '/api/v1/admin/auth/me', { token: earlier })).status, 401);
});

// --- Files in the local uploads folder ----------------------------------------

test('a page-like file in /uploads is a sandboxed download; a picture is shown', async (t) => {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const name = `audit-test-${Date.now()}`;
  const html = path.join(UPLOAD_DIR, `${name}.html`);
  const svg = path.join(UPLOAD_DIR, `${name}.svg`);
  const jpg = path.join(UPLOAD_DIR, `${name}.jpg`);
  fs.writeFileSync(html, '<script>1</script>');
  fs.writeFileSync(svg, '<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>');
  fs.writeFileSync(jpg, Buffer.from([0xff, 0xd8, 0xff]));
  t.after(() => [html, svg, jpg].forEach((f) => fs.rmSync(f, { force: true })));

  for (const file of [`${name}.html`, `${name}.svg`]) {
    // eslint-disable-next-line no-await-in-loop
    const res = await call('GET', `/uploads/${file}`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-disposition'), 'attachment');
    assert.match(res.headers.get('content-security-policy'), /^sandbox/);
  }
  const picture = await call('GET', `/uploads/${name}.jpg`);
  assert.equal(picture.headers.get('content-disposition'), null);
});
