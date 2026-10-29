require('../testkit/safeEnv');

/**
 * Who a reminder rings for, and what each person is shown of it.
 *
 * These rules decide whose phone goes off, so they are checked on their own,
 * from reminders built in memory: no database, nothing sent.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const env = require('../src/config/env');
require('../testkit/safeEnv').assertSafe(env);
const Reminder = require('../src/models/Reminder');
const Group = require('../src/models/Group');
const User = require('../src/models/User');
const {
  audienceOf,
  ringsFor,
  ringersOf,
  alarmOf,
  present,
  repeatUntilFor,
} = require('../src/services/reminder.service');

const ASHA = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const BEN = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const CARA = 'cccccccccccccccccccccccc';
const DAY_MS = 24 * 60 * 60 * 1000;
const START = new Date('2026-12-10T00:00:00.000Z');

const trip = (fields = {}) =>
  new Group({
    name: 'Tokyo Trip',
    createdBy: ASHA,
    members: [ASHA, BEN, CARA],
    startDate: START,
    totalDays: 5,
    ...fields,
  });

// A reminder as the service loads it: creator and group filled in.
const reminder = ({ group = trip(), ...fields } = {}) =>
  new Reminder({
    title: 'Flight to Tokyo',
    subtitle: 'Terminal 3',
    remindAt: new Date('2026-12-10T00:30:00.000Z'),
    scope: 'group',
    createdBy: new User({ _id: ASHA, name: 'Asha', email: 'asha@example.test' }),
    group,
    ...fields,
  });

test('a shared reminder is for every member, a private one only for its creator', () => {
  assert.deepEqual(audienceOf(reminder()), [ASHA, BEN, CARA]);
  assert.deepEqual(audienceOf(reminder({ scope: 'me' })), [ASHA]);
});

test('a personal reminder has no group and is for its creator alone', async () => {
  const personal = reminder({ group: null });
  // Whatever was asked for, a reminder without a group cannot be shared.
  await personal.validate();
  assert.equal(personal.scope, 'me');
  assert.deepEqual(audienceOf(personal), [ASHA]);
  assert.deepEqual(ringersOf(personal), [ASHA]);
});

test('it rings for everyone until somebody switches it off for themselves', () => {
  const r = reminder({ mutedBy: [BEN] });
  assert.equal(ringsFor(r, ASHA), true);
  assert.equal(ringsFor(r, BEN), false);
  assert.equal(ringsFor(r, CARA), true);
  assert.deepEqual(ringersOf(r), [ASHA, CARA]);
});

test('turned off for everybody, it rings for nobody', () => {
  assert.deepEqual(ringersOf(reminder({ enabled: false })), []);
});

test('a muted group does not ring, except for the person who set the reminder', () => {
  const r = reminder({ group: trip({ mutedBy: [ASHA, CARA] }) });
  // Asha muted the group but set this one herself.
  assert.equal(ringsFor(r, ASHA), true);
  assert.equal(ringsFor(r, CARA), false);
  assert.deepEqual(ringersOf(r), [ASHA, BEN]);
});

test('each person is shown their own switch, never the lists behind it', () => {
  const r = reminder({ mutedBy: [BEN], armedBy: [ASHA], group: trip({ mutedBy: [CARA] }) });

  const forBen = present(r, BEN);
  assert.equal(forBen.muted, true);
  assert.equal(forBen.rings, false);
  assert.equal('mutedBy' in forBen, false);
  assert.equal('armedBy' in forBen, false);

  const forCara = present(r, CARA);
  // Not muted by her, but her group is: the app can say why it stays quiet.
  assert.equal(forCara.muted, false);
  assert.equal(forCara.rings, false);

  const forAsha = present(r, ASHA);
  assert.equal(forAsha.rings, true);
  assert.equal(forAsha.groupName, 'Tokyo Trip');
  assert.equal(String(forAsha.group), String(r.group._id));
  assert.equal(forAsha.createdBy.name, 'Asha');
});

test('a weekly reminder repeats until the end of the trip’s last day', () => {
  assert.equal(repeatUntilFor(trip()).getTime(), START.getTime() + 5 * DAY_MS);
  // No dates (a home or couple group) and no group at all: no end.
  assert.equal(repeatUntilFor(trip({ startDate: null })), null);
  assert.equal(repeatUntilFor(null), null);

  assert.equal(present(reminder({ repeatWeekly: true }), ASHA).repeatUntil.getTime(), START.getTime() + 5 * DAY_MS);
  assert.equal(present(reminder(), ASHA).repeatUntil, null);
});

test('what is sent to a phone is enough to set the alarm and nothing about other members', () => {
  const r = reminder({ repeatWeekly: true, mutedBy: [BEN], armedBy: [CARA], task: 'dddddddddddddddddddddddd' });
  assert.deepEqual(alarmOf(r), {
    _id: String(r._id),
    title: 'Flight to Tokyo',
    subtitle: 'Terminal 3',
    remindAt: r.remindAt,
    group: String(r.group._id),
    groupName: 'Tokyo Trip',
    task: 'dddddddddddddddddddddddd',
    repeatWeekly: true,
    repeatUntil: new Date(START.getTime() + 5 * DAY_MS),
  });
  assert.deepEqual(alarmOf(reminder({ group: null })).group, null);
});
