require('../testkit/safeEnv');

/**
 * Regression tests for the low-risk API items left open by the November 2026
 * audit (SECURITY-AUDIT-2026-11-05.md §4.2 N-5 "still recommended", §4.3):
 *  - invite codes for new groups carry 65 bits; old 8-character codes still work;
 *  - an expense amount has an upper bound (and 1e999, JSON's Infinity, is refused);
 *  - the JSON photo add no longer takes an image address;
 *  - POST /conversations answers the same for an unknown id and a stranger.
 *
 * The code-shape tests need no database. The rest run against a local MongoDB
 * in a database of their own (splix_test_lowrisk, dropped at the end) and are
 * skipped when no MongoDB answers on 127.0.0.1:27017.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const env = require('../src/config/env');
require('../testkit/safeEnv').assertSafe(env);
const app = require('../src/app');
const User = require('../src/models/User');
const Group = require('../src/models/Group');
const Photo = require('../src/models/Photo');
const Expense = require('../src/models/Expense');
const Conversation = require('../src/models/Conversation');
const { newInviteCode, INVITE_CODE_PATTERN, INVITE_CODE_LENGTH } = require('../src/utils/inviteCode');

const DB_URI = 'mongodb://127.0.0.1:27017/splix_test_lowrisk';
let db = false;
let server;
let base;

const sign = (userId) => jwt.sign({ sub: String(userId) }, env.jwtSecret, { expiresIn: '1h' });

const call = async (method, url, { token, body, raw } = {}) => {
  const payload = raw ?? (body !== undefined ? JSON.stringify(body) : undefined);
  const res = await fetch(base + url, {
    method,
    headers: {
      ...(payload !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: payload,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // not JSON
  }
  return { status: res.status, body: json, text };
};

let n = 0;
const makeUser = () => {
  n += 1;
  return User.create({ name: `Person ${n}`, email: `lowrisk${n}@example.test`, password: 'Passw0rd!x' });
};

const groupOf = (members, fields = {}) =>
  Group.create({
    name: 'Trip',
    createdBy: members[0]._id,
    admin: members[0]._id,
    members: members.map((m) => m._id),
    ...fields,
  });

test.before(async () => {
  try {
    await mongoose.connect(DB_URI, { serverSelectionTimeoutMS: 2000 });
    await mongoose.connection.dropDatabase();
    db = true;
  } catch (err) {
    console.log(`lowRiskFixes database tests skipped: no MongoDB at ${DB_URI} (${err.message})`);
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

// --- Invite codes (no database) ----------------------------------------------

// The rule app builds already installed use for a code in a link
// (mobile/src/invites/inviteLinks.js). New codes must keep fitting it.
const INSTALLED_APP_LINK_RULE = /(?:^|\/)join\/([A-Za-z0-9]{4,16})(?:[/?#]|$)/;

test('a new invite code is 13 characters of base32 without look-alike letters (65 bits)', () => {
  const codes = new Set();
  for (let i = 0; i < 2000; i += 1) {
    const code = newInviteCode();
    assert.match(code, /^[0-9A-HJKMNP-TV-Z]{13}$/);
    codes.add(code);
  }
  assert.equal(codes.size, 2000);
  assert.ok(INVITE_CODE_LENGTH * Math.log2(32) >= 64);
});

test('a new group gets a long code; a group that has a code keeps it', async () => {
  const fresh = new Group({ name: 'Trip', createdBy: new mongoose.Types.ObjectId(), members: [] });
  await fresh.validate();
  assert.equal(fresh.inviteCode.length, 13);

  const older = new Group({ name: 'Trip', createdBy: new mongoose.Types.ObjectId(), members: [], inviteCode: 'A1B2C3D4' });
  await older.validate();
  assert.equal(older.inviteCode, 'A1B2C3D4');
});

test('old and new codes pass the API rule and the installed app link rule; junk does not', () => {
  const fresh = newInviteCode();
  for (const code of ['A1B2C3D4', 'a1b2c3d4', fresh]) {
    assert.match(code, INVITE_CODE_PATTERN);
  }
  assert.equal(`https://api.example/join/${fresh}`.match(INSTALLED_APP_LINK_RULE)?.[1], fresh);
  for (const junk of ['ABC', 'A1B2C3', 'A'.repeat(17), 'A1B2-C3D4', 'A1B2 C3D4', '../../x']) {
    assert.doesNotMatch(junk, INVITE_CODE_PATTERN);
  }
});

// --- Invite codes (through the API) --------------------------------------------

withDb('an old 8-character code and a new 13-character code both preview and join', async () => {
  const [owner, joiner] = await Promise.all([makeUser(), makeUser()]);
  const oldGroup = await groupOf([owner], { inviteCode: 'C0FFEE42' });
  const newGroup = await groupOf([owner]);
  assert.equal(newGroup.inviteCode.length, 13);
  const token = sign(joiner._id);

  for (const group of [oldGroup, newGroup]) {
    const preview = await call('GET', `/api/v1/groups/invites/${group.inviteCode.toLowerCase()}`, { token });
    assert.equal(preview.status, 200);
    const joined = await call('POST', '/api/v1/groups/join', { token, body: { inviteCode: ` ${group.inviteCode} ` } });
    assert.equal(joined.status, 200, joined.text);
    const after = await Group.findById(group._id);
    assert.ok(after.members.some((m) => m.equals(joiner._id)));
  }

  // The browser page for a link finds both, too.
  for (const group of [oldGroup, newGroup]) {
    const page = await fetch(`${base}/join/${group.inviteCode}`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Trip/);
  }
});

withDb('a code that cannot be one is refused before any lookup', async () => {
  const user = await makeUser();
  const token = sign(user._id);
  for (const bad of ['ABC', 'A1B2C3D', 'A'.repeat(17), 'A1B2-C3D4']) {
    assert.equal((await call('POST', '/api/v1/groups/join', { token, body: { inviteCode: bad } })).status, 400, bad);
    assert.equal((await call('GET', `/api/v1/groups/invites/${encodeURIComponent(bad)}`, { token })).status, 400, bad);
  }
  assert.equal((await call('POST', '/api/v1/groups/join', { token, body: {} })).status, 400);
  // A well-formed code nobody has is still a plain "not found".
  assert.equal((await call('POST', '/api/v1/groups/join', { token, body: { inviteCode: 'ZZZZZZZZZZZZZ' } })).status, 404);
});

// --- Expense amounts ----------------------------------------------------------

withDb('an expense amount over 10,000,000, or 1e999, is refused; 10,000,000 itself is fine', async () => {
  const [alice, bob] = await Promise.all([makeUser(), makeUser()]);
  const group = await groupOf([alice, bob]);
  const token = sign(alice._id);
  const url = `/api/v1/groups/${group._id}/expenses`;
  const people = { paidBy: String(alice._id), participants: [String(alice._id), String(bob._id)] };

  const tooBig = await call('POST', url, { token, body: { description: 'd', amount: 10_000_000.01, ...people } });
  assert.equal(tooBig.status, 400);
  assert.match(tooBig.body.message, /10,000,000/);

  // JSON.parse turns 1e999 into Infinity, which a plain z.number() accepts.
  const infinite = await call('POST', url, {
    token,
    raw: `{"description":"d","amount":1e999,"paidBy":"${alice._id}","participants":["${alice._id}","${bob._id}"]}`,
  });
  assert.equal(infinite.status, 400);

  const splitTooBig = await call('POST', url, {
    token,
    body: {
      description: 'd',
      amount: 10,
      paidBy: String(alice._id),
      splitType: 'exact',
      splits: [
        { user: String(alice._id), amount: 1e300 },
        { user: String(bob._id), amount: 10 },
      ],
    },
  });
  assert.equal(splitTooBig.status, 400);
  assert.equal(await Expense.countDocuments({ group: group._id }), 0);

  const atTheCap = await call('POST', url, { token, body: { description: 'd', amount: 10_000_000, ...people } });
  assert.equal(atTheCap.status, 201, atTheCap.text);
});

// --- Photos -------------------------------------------------------------------

withDb('the JSON photo add refuses any image address; an emoji tile is still added', async () => {
  const alice = await makeUser();
  const group = await groupOf([alice]);
  const token = sign(alice._id);
  const url = `/api/v1/groups/${group._id}/photos`;

  for (const imageUrl of ['https://tracker.example/pixel.gif', '/uploads/somebody-else.jpg', '/media/splix/x.jpg']) {
    const res = await call('POST', url, { token, body: { emoji: '🌄', imageUrl } });
    assert.equal(res.status, 400, imageUrl);
    assert.match(res.body.message, /Upload the picture/);
  }
  assert.equal(await Photo.countDocuments({ group: group._id }), 0);

  const tile = await call('POST', url, { token, body: { emoji: '🌄', color: '#336699', caption: 'Sunrise' } });
  assert.equal(tile.status, 201, tile.text);
  assert.equal(tile.body.data.photo.imageUrl || '', ''); // the model's "no picture"
});

// --- Direct conversations -------------------------------------------------------

withDb('opening a chat answers the same for an id nobody has and for a stranger', async () => {
  const [alice, stranger, friend] = await Promise.all([makeUser(), makeUser(), makeUser()]);
  await groupOf([alice, friend]);
  const token = sign(alice._id);

  const unknown = await call('POST', '/api/v1/conversations', { token, body: { userId: String(new mongoose.Types.ObjectId()) } });
  const notShared = await call('POST', '/api/v1/conversations', { token, body: { userId: String(stranger._id) } });
  assert.equal(unknown.status, 403);
  assert.equal(notShared.status, 403);
  assert.deepEqual(unknown.body, notShared.body);
  assert.equal(await Conversation.countDocuments({}), 0);

  const ok = await call('POST', '/api/v1/conversations', { token, body: { userId: String(friend._id) } });
  assert.equal(ok.status, 200, ok.text);
  assert.equal(await Conversation.countDocuments({}), 1);
});
