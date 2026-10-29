require('../testkit/safeEnv');

/**
 * The server's part at reminder time, with no database and nothing sent.
 *
 * The models are replaced by ones that record what they were asked, so the
 * three things that would hurt if wrong are checked directly: a reminder is
 * handled once, a stale one is closed without telling anyone (the first run
 * after this ships meets every old reminder in the database), and only people
 * whose phone never confirmed the alarm get the backup push.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const env = require('../src/config/env');
require('../testkit/safeEnv').assertSafe(env);
const Reminder = require('../src/models/Reminder');
const Group = require('../src/models/Group');
const User = require('../src/models/User');
const Notification = require('../src/models/Notification');
const pushService = require('../src/services/push.service');
const sweep = require('../src/services/reminderSweep.service');

const ASHA = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const BEN = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const CARA = 'cccccccccccccccccccccccc';
const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const WEEK_MS = 7 * DAY_MS;
const NOW = new Date('2026-12-10T09:00:30.000Z');
const TRIP_START = new Date('2026-12-08T00:00:00.000Z');

const trip = (fields = {}) =>
  new Group({ name: 'Tokyo Trip', createdBy: ASHA, members: [ASHA, BEN, CARA], startDate: TRIP_START, totalDays: 30, ...fields });

const reminder = ({ group = trip(), ...fields } = {}) =>
  new Reminder({
    title: 'Flight to Tokyo',
    remindAt: new Date(NOW.getTime() - 30 * 1000),
    scope: 'group',
    createdBy: new User({ _id: ASHA, name: 'Asha', email: 'asha@example.test' }),
    group,
    ...fields,
  });

// Stands in for the database: `due` is what the query finds, `claim` what the
// one-step claim returns (null when another instance got there first).
const stubModels = (t, { due, claim = due }) => {
  const calls = { find: [], claims: [], updates: [], entries: [], pushes: [] };
  const query = (result) => {
    const chain = { select: () => chain, sort: () => chain, limit: () => chain, lean: async () => result };
    return chain;
  };
  t.mock.method(Reminder, 'find', (filter) => {
    calls.find.push(filter);
    return query(due.map((r) => ({ _id: r._id, remindAt: r.remindAt })));
  });
  t.mock.method(Reminder, 'findOneAndUpdate', (filter, update) => {
    calls.claims.push({ filter, update });
    const found = claim.find((r) => String(r._id) === String(filter._id)) ?? null;
    return { populate: async () => found };
  });
  t.mock.method(Reminder, 'updateOne', async (filter, update) => {
    calls.updates.push({ filter, update });
  });
  t.mock.method(Notification, 'insertMany', async (rows) => {
    calls.entries.push(...rows);
  });
  t.mock.method(pushService, 'sendToUsers', async (userIds, message) => {
    calls.pushes.push({ userIds: userIds.map(String), message });
  });
  return calls;
};

test('the next weekly time is the first one still ahead, and stops with the trip', () => {
  const at = new Date('2026-12-10T09:00:00.000Z');
  assert.equal(sweep.nextWeekly(at, NOW, null).getTime(), at.getTime() + WEEK_MS);
  // Found three weeks late: it does not ring three times to catch up.
  const late = new Date(NOW.getTime() + 20 * DAY_MS);
  assert.equal(sweep.nextWeekly(at, late, null).getTime(), at.getTime() + 3 * WEEK_MS);
  // The trip ends before next week's turn.
  assert.equal(sweep.nextWeekly(at, NOW, new Date(at.getTime() + 3 * DAY_MS)), null);
  assert.equal(sweep.nextWeekly(at, NOW, new Date(at.getTime() + WEEK_MS)).getTime(), at.getTime() + WEEK_MS);
});

test('the backup push goes only to people whose phone never confirmed the alarm', () => {
  const r = reminder({ armedBy: [ASHA], mutedBy: [CARA] });
  assert.deepEqual(sweep.recipientsOf(r), { listed: [ASHA, BEN], pushed: [BEN] });
});

test('a muted group still fills the notification list but gets no push', () => {
  const r = reminder({ group: trip({ mutedBy: [BEN] }) });
  assert.deepEqual(sweep.recipientsOf(r), { listed: [ASHA, BEN, CARA], pushed: [ASHA, CARA] });
});

test('a due reminder is claimed, listed for everyone it is for, and pushed to the unarmed', async (t) => {
  const r = reminder({ armedBy: [ASHA], task: 'dddddddddddddddddddddddd' });
  const calls = stubModels(t, { due: [r] });

  assert.equal(await sweep.sweepOnce(NOW), 1);

  assert.deepEqual(calls.find[0], { enabled: true, firedAt: null, remindAt: { $lte: NOW } });
  // The claim names the time it read, so an edit in between is left alone.
  assert.deepEqual(calls.claims[0].filter, { _id: r._id, enabled: true, firedAt: null, remindAt: r.remindAt });
  assert.deepEqual(calls.claims[0].update, { $set: { firedAt: NOW } });

  assert.deepEqual(calls.entries.map((e) => e.user), [ASHA, BEN, CARA]);
  assert.equal(calls.entries[0].type, 'reminder');
  assert.equal(calls.entries[0].body, '"Flight to Tokyo" is due now.');
  assert.equal(String(calls.entries[0].group), String(r.group._id));
  assert.equal(String(calls.entries[0].entityId), 'dddddddddddddddddddddddd');

  assert.equal(calls.pushes.length, 1);
  assert.deepEqual(calls.pushes[0].userIds, [BEN, CARA]);
  assert.equal(calls.pushes[0].message.body, 'Flight to Tokyo');
  assert.equal(calls.pushes[0].message.data.type, 'reminder');
  assert.equal(calls.pushes[0].message.data.groupId, String(r.group._id));
  // A one-off is finished: nothing moves it on.
  assert.deepEqual(calls.updates, []);
});

test('a reminder another server instance already claimed is left alone', async (t) => {
  const calls = stubModels(t, { due: [reminder()], claim: [] });
  assert.equal(await sweep.sweepOnce(NOW), 0);
  assert.deepEqual(calls.entries, []);
  assert.deepEqual(calls.pushes, []);
});

test('a reminder found long after its time is closed without telling anyone', async (t) => {
  const old = reminder({ remindAt: new Date(NOW.getTime() - sweep.STALE_AFTER_MS - MINUTE_MS) });
  const calls = stubModels(t, { due: [old] });

  assert.equal(await sweep.sweepOnce(NOW), 1);
  assert.equal(calls.claims.length, 1);
  assert.deepEqual(calls.entries, []);
  assert.deepEqual(calls.pushes, []);
});

test('a weekly reminder moves on a week and waits again, keeping who has it set', async (t) => {
  const weekly = reminder({ repeatWeekly: true, armedBy: [ASHA, BEN, CARA] });
  const calls = stubModels(t, { due: [weekly] });

  await sweep.sweepOnce(NOW);
  assert.equal(calls.updates.length, 1);
  assert.deepEqual(calls.updates[0].update, {
    $set: { remindAt: new Date(weekly.remindAt.getTime() + WEEK_MS), firedAt: null },
  });
  // Every phone has it: nobody needs the backup push.
  assert.deepEqual(calls.pushes[0].userIds, []);
});

test('a weekly reminder is not moved past the end of the trip', async (t) => {
  const lastWeek = reminder({ repeatWeekly: true, group: trip({ totalDays: 5 }) });
  const calls = stubModels(t, { due: [lastWeek] });

  await sweep.sweepOnce(NOW);
  assert.deepEqual(calls.updates, []);
});

test('an old weekly reminder is closed quietly but still moved to its next turn', async (t) => {
  const old = reminder({ repeatWeekly: true, remindAt: new Date(NOW.getTime() - 2 * DAY_MS) });
  const calls = stubModels(t, { due: [old] });

  await sweep.sweepOnce(NOW);
  assert.deepEqual(calls.entries, []);
  assert.deepEqual(calls.updates[0].update.$set.remindAt, new Date(old.remindAt.getTime() + WEEK_MS));
});

test('a reminder that cannot be announced does not stop the ones after it', async (t) => {
  const broken = reminder({ title: 'Broken' });
  const fine = reminder({ title: 'Fine' });
  const calls = stubModels(t, { due: [broken, fine] });
  Notification.insertMany.mock.mockImplementationOnce(async () => {
    throw new Error('write failed');
  });
  t.mock.method(console, 'error', () => {});

  // Both were dealt with: the first stays claimed, so nobody is told twice.
  assert.equal(await sweep.sweepOnce(NOW), 2);
  assert.deepEqual(calls.entries.map((e) => e.body), ['"Fine" is due now.', '"Fine" is due now.', '"Fine" is due now.']);
});

test('a weekly reminder that cannot be announced is still moved on a week', async (t) => {
  // Otherwise it would stay claimed and never come round again.
  const weekly = reminder({ repeatWeekly: true });
  const calls = stubModels(t, { due: [weekly] });
  Notification.insertMany.mock.mockImplementationOnce(async () => {
    throw new Error('write failed');
  });
  t.mock.method(console, 'error', () => {});

  await sweep.sweepOnce(NOW);
  assert.deepEqual(calls.updates[0].update, {
    $set: { remindAt: new Date(weekly.remindAt.getTime() + WEEK_MS), firedAt: null },
  });
});

test('a claim that itself fails is reported and the sweep carries on', async (t) => {
  const first = reminder({ title: 'First' });
  const second = reminder({ title: 'Second' });
  const calls = stubModels(t, { due: [first, second] });
  Reminder.findOneAndUpdate.mock.mockImplementationOnce(() => {
    throw new Error('database unreachable');
  });
  t.mock.method(console, 'error', () => {});

  assert.equal(await sweep.sweepOnce(NOW), 1);
  assert.deepEqual(calls.entries.map((e) => e.body), ['"Second" is due now.', '"Second" is due now.', '"Second" is due now.']);
});

test('the sweep is off outside production unless switched on', () => {
  assert.equal(env.reminderSweep, false);
});
