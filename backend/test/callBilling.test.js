require('../testkit/safeEnv');

/**
 * Who pays for a group call, minute by minute, as the billing sweep sees it.
 *
 * The rules (callBilling.service): the person who starts a call pays for it
 * while they are in it; joining is free; once the starter has left a call that
 * others stay on, the rest of it is free; and nobody outside the group is ever
 * the payer. Stream is replaced by the list of live calls each sweep is given,
 * and the wallet by a record of what would have been charged.
 *
 * Runs against a local MongoDB in a database of its own (splix_test_calls,
 * dropped at the end). Skipped when no MongoDB answers on 127.0.0.1:27017.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const env = require('../src/config/env');
require('../testkit/safeEnv').assertSafe(env);
const User = require('../src/models/User');
const Group = require('../src/models/Group');
const CallSession = require('../src/models/CallSession');
const walletService = require('../src/services/wallet.service');
const streamService = require('../src/services/stream.service');
const messageService = require('../src/services/message.service');
const callRing = require('../src/services/callRing.service');
const realtime = require('../src/realtime/socket');
const callBilling = require('../src/services/callBilling.service');

const DB_URI = 'mongodb://127.0.0.1:27017/splix_test_calls';
const MINUTE = 60 * 1000;
const BLOCK_MINUTES = 10;

let db = false;

test.before(async () => {
  try {
    await mongoose.connect(DB_URI, { serverSelectionTimeoutMS: 2000 });
    await mongoose.connection.dropDatabase();
    db = true;
  } catch (err) {
    console.log(`callBilling tests skipped: no MongoDB at ${DB_URI} (${err.message})`);
  }
});

test.after(async () => {
  if (db) {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});

let n = 0;
const makeUser = (name) => {
  n += 1;
  return User.create({ name, email: `caller${n}@example.test`, password: 'test-only-password-1' });
};

/**
 * A group of three (Asha, Ben, Cara) and Xavi, who is not in it, with Stream
 * and the wallet replaced. `live` is what the next sweep is told is happening:
 * set it to the people in the group's call, longest in it first.
 */
const setUp = async (t, { credits = Infinity } = {}) => {
  const [asha, ben, cara, xavi] = await Promise.all(['Asha', 'Ben', 'Cara', 'Xavi'].map(makeUser));
  const group = await Group.create({ name: 'Tokyo Trip', createdBy: asha._id, members: [asha._id, ben._id, cara._id] });
  const ids = { asha: String(asha._id), ben: String(ben._id), cara: String(cara._id), xavi: String(xavi._id) };
  const groupId = String(group._id);

  const world = { ids, groupId, charges: [], refunds: [], events: [], callStartedAt: null, people: [] };
  const balances = new Map(Object.values(ids).map((id) => [id, credits]));

  t.mock.method(walletService, 'getSettings', async () => ({
    prices: { callBlock: 1, aiItinerary: 0 },
    callBlockMinutes: BLOCK_MINUTES,
  }));
  t.mock.method(walletService, 'charge', async (userId, { key }) => {
    const who = String(userId);
    // Keyed, like the real one: the same charge twice is charged once.
    if (world.charges.some((c) => c.key === key)) return;
    if (balances.get(who) < 1) throw Object.assign(new Error('Not enough credits'), { code: 'NO_CREDITS' });
    balances.set(who, balances.get(who) - 1);
    world.charges.push({ who, key });
  });
  t.mock.method(walletService, 'balanceOf', async (userId) => balances.get(String(userId)));
  t.mock.method(walletService, 'refundQuietly', async (key) => {
    world.refunds.push(key);
  });
  t.mock.method(streamService, 'isConfigured', () => true);
  t.mock.method(streamService, 'ongoingCalls', async () =>
    world.people.length || world.callStartedAt
      ? [{ groupId, startedAt: world.callStartedAt, participantIds: [...world.people] }]
      : []
  );
  t.mock.method(streamService, 'removeEveryone', async () => []);
  t.mock.method(realtime, 'emitToUser', (to, event) => world.events.push({ to: String(to), event }));
  t.mock.method(realtime, 'emitToGroup', (to, event) => world.events.push({ to: String(to), event }));
  t.mock.method(messageService, 'postSystem', async () => ({}));
  t.mock.method(callRing, 'end', async () => null);

  // Who was charged, by name, in order.
  const nameOf = Object.fromEntries(Object.entries(ids).map(([name, id]) => [id, name]));
  world.paid = () => world.charges.map((c) => nameOf[c.who]);
  world.sessions = () => CallSession.find({ group: groupId }).sort({ startedAt: 1 }).lean();
  return world;
};

const withDb = (name, run) =>
  test(name, async (t) => {
    if (!db) {
      t.skip('no MongoDB on 127.0.0.1:27017');
      return;
    }
    await run(t);
  });

// Asha starts a call the way the app does: call-start pays the first block,
// then her phone joins.
const ashaStarts = async (world) => {
  const answer = await callBilling.start(world.ids.asha, world.groupId);
  assert.equal(answer.billed, true);
  const [session] = await world.sessions();
  const t0 = new Date(session.startedAt).getTime();
  world.callStartedAt = new Date(t0 + 2000);
  return t0;
};

// ---- The starter leaves -----------------------------------------------------

withDb('once the starter has left, nobody pays for the rest of the call', async (t) => {
  const w = await setUp(t);
  const t0 = await ashaStarts(w);
  const { asha, ben, cara } = w.ids;

  w.people = [asha, ben, cara];
  await callBilling.sweep(t0 + 3 * MINUTE);
  assert.deepEqual(w.paid(), ['asha']);

  // Asha hangs up just before her second block; Ben and Cara talk on.
  w.people = [ben, cara];
  await callBilling.sweep(t0 + 11 * MINUTE);
  assert.deepEqual(w.paid(), ['asha'], 'nothing is charged while she is away');
  await callBilling.sweep(t0 + 12 * MINUTE);
  let [session] = await w.sessions();
  assert.equal(session.status, 'ended');
  assert.equal(session.endReason, 'payer_left');

  // An hour more: still nobody pays, and Ben is never made the payer.
  for (let minute = 13; minute <= 70; minute += 1) {
    // eslint-disable-next-line no-await-in-loop
    await callBilling.sweep(t0 + minute * MINUTE);
  }
  assert.deepEqual(w.paid(), ['asha']);
  const sessions = await w.sessions();
  assert.equal(sessions.length, 1);
  [session] = sessions;
  assert.equal(String(session.startedBy), asha);
});

withDb('a starter whose phone drops off for a moment keeps paying, blocks that came due included', async (t) => {
  const w = await setUp(t);
  const t0 = await ashaStarts(w);
  const { asha, ben } = w.ids;

  w.people = [asha, ben];
  await callBilling.sweep(t0 + 9 * MINUTE);
  // Her phone reconnects just as the second block comes due.
  w.people = [ben];
  await callBilling.sweep(t0 + 10 * MINUTE + 30 * 1000);
  assert.deepEqual(w.paid(), ['asha']);
  w.people = [ben, asha];
  await callBilling.sweep(t0 + 11 * MINUTE + 30 * 1000);

  assert.deepEqual(w.paid(), ['asha', 'asha']);
  const [session] = await w.sessions();
  assert.equal(session.status, 'active');
  assert.equal(session.payerAwaySince, null);
});

withDb('a starter who comes back to their own call pays again from then, not for the time away', async (t) => {
  const w = await setUp(t);
  const t0 = await ashaStarts(w);
  const { asha, ben } = w.ids;

  w.people = [asha, ben];
  await callBilling.sweep(t0 + 3 * MINUTE);
  w.people = [ben];
  await callBilling.sweep(t0 + 4 * MINUTE);
  await callBilling.sweep(t0 + 5 * MINUTE);
  // 25 minutes of Ben alone, free. Then Asha is back.
  w.people = [ben, asha];
  await callBilling.sweep(t0 + 30 * MINUTE);
  await callBilling.sweep(t0 + 31 * MINUTE);

  assert.deepEqual(w.paid(), ['asha', 'asha']);
  const [first, second] = await w.sessions();
  assert.equal(first.endReason, 'payer_left');
  assert.equal(String(second.startedBy), asha);
  assert.equal(new Date(second.startedAt).getTime(), t0 + 30 * MINUTE);
  assert.equal(second.blocksCharged, 1);
});

withDb('a payer taken out of the group stops paying, even while still in the call', async (t) => {
  const w = await setUp(t);
  const t0 = await ashaStarts(w);
  const { asha, ben } = w.ids;

  w.people = [asha, ben];
  await callBilling.sweep(t0 + 3 * MINUTE);
  await Group.updateOne({ _id: w.groupId }, { $pull: { members: asha } });
  await callBilling.sweep(t0 + 9 * MINUTE);
  await callBilling.sweep(t0 + 10 * MINUTE);

  assert.deepEqual(w.paid(), ['asha']);
  const [session] = await w.sessions();
  assert.equal(session.endReason, 'payer_left');
});

withDb('a starter still joining is not taken for gone', async (t) => {
  const w = await setUp(t);
  const t0 = await ashaStarts(w);

  // Stream shows the call before her phone is in it.
  w.people = [];
  w.callStartedAt = new Date(t0);
  await callBilling.sweep(t0 + 30 * 1000);

  const [session] = await w.sessions();
  assert.equal(session.status, 'active');
  assert.equal(session.payerAwaySince, null);
});

// ---- Never a non-member -----------------------------------------------------

withDb('a call started by someone outside the group is paid by the member in it longest', async (t) => {
  const w = await setUp(t);
  const { ben, cara, xavi } = w.ids;
  const now = Date.now();

  // Nobody announced it: no call-start. Xavi has been in it longest.
  w.callStartedAt = new Date(now - 30 * 1000);
  w.people = [xavi, ben, cara];
  await callBilling.sweep(now);

  assert.deepEqual(w.paid(), ['ben']);
  const [session] = await w.sessions();
  assert.equal(String(session.startedBy), ben);
});

withDb('a call with nobody from the group in it is billed to nobody', async (t) => {
  const w = await setUp(t);
  const now = Date.now();

  w.callStartedAt = new Date(now - 30 * 1000);
  w.people = [w.ids.xavi];
  await callBilling.sweep(now);

  assert.deepEqual(w.paid(), []);
  assert.deepEqual(await w.sessions(), []);
});

withDb('a call that was running before anyone billed it is billed from now, not from its start', async (t) => {
  const w = await setUp(t);
  const now = Date.now();

  // Calls were free until a moment ago, and this one has been on for 30 minutes.
  w.callStartedAt = new Date(now - 30 * MINUTE);
  w.people = [w.ids.ben];
  await callBilling.sweep(now);

  assert.deepEqual(w.paid(), ['ben'], 'one block, not the three already past');
});

withDb('a bill picked up again in the same call starts where the last one stopped', async (t) => {
  const w = await setUp(t);
  const { asha, ben } = w.ids;
  const t0 = Date.now();

  // Asha's bill ended 20 minutes into this call (she ran out of credits, and
  // everyone was taken out). Ben is back in it first, with Asha after him.
  w.callStartedAt = new Date(t0);
  await CallSession.create({
    group: w.groupId,
    startedBy: asha,
    startedAt: new Date(t0),
    status: 'ended',
    endedAt: new Date(t0 + 20 * MINUTE),
    endReason: 'no_credits',
    blocksCharged: 2,
    seenLive: true,
  });
  w.people = [ben, asha];
  await callBilling.sweep(t0 + 21 * MINUTE);
  await callBilling.sweep(t0 + 29.5 * MINUTE);

  const sessions = await w.sessions();
  assert.equal(sessions.length, 2);
  assert.equal(String(sessions[1].startedBy), ben);
  assert.equal(new Date(sessions[1].startedAt).getTime(), t0 + 20 * MINUTE);
  // One block of his own: nothing from the 20 minutes Asha paid for.
  assert.deepEqual(w.paid(), ['ben']);
});
