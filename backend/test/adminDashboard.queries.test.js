require('../testkit/safeEnv');

/**
 * What the dashboard asks the database, with no database to answer.
 *
 * The sums are tested in adminDashboard.service.test.js from buckets that are
 * handed to them, so nothing there notices a query that does not reach back
 * far enough, cuts its days in the wrong zone or lists the wrong six people.
 * Each of those still produces a plausible screen. Here every model is
 * replaced by one that keeps what it was asked, getDashboard is called with a
 * clock of the test's choosing, and the questions themselves are checked.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const env = require('../src/config/env');
require('../testkit/safeEnv').assertSafe(env);
const User = require('../src/models/User');
const Group = require('../src/models/Group');
const Expense = require('../src/models/Expense');
const ItineraryJob = require('../src/models/ItineraryJob');
const { dayKeys, getDashboard } = require('../src/services/adminDashboard.service');
const { ROLES } = require('../src/config/permissions');

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const OWNER = { role: ROLES.SUPER_ADMIN };
const APP_USERS = { role: { $nin: [ROLES.ADMIN, ROLES.SUPER_ADMIN] } };

// 10:30 UTC on 30 September is half past midnight on 1 October in Kiritimati,
// fourteen hours ahead, and half past eleven at night on 29 September in Pago
// Pago, eleven behind: the two ends of the map, and the two ends of a day. The
// third is 23:30 on 3 November in New York, two days after its clocks went
// back, so the week that ends there holds a day of 25 hours.
//
// firstDay is the first day of the previous period, counted back on a calendar
// by hand: the first of 2 × days dates that end on today in that zone.
const ZONES = [
  {
    tz: 'Pacific/Kiritimati',
    now: new Date('2026-09-30T10:30:00.000Z'),
    firstDay: { 7: '2026-09-18', 30: '2026-08-03', 90: '2026-04-05' },
  },
  {
    tz: 'Pacific/Pago_Pago',
    now: new Date('2026-09-30T10:30:00.000Z'),
    firstDay: { 7: '2026-09-16', 30: '2026-08-01', 90: '2026-04-03' },
  },
  {
    tz: 'America/New_York',
    now: new Date('2026-11-04T04:30:00.000Z'),
    firstDay: { 7: '2026-10-21', 30: '2026-09-05', 90: '2026-05-08' },
  },
];

const localDate = (instant, tz) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);

// The instant a calendar date begins in a zone, found without the service and
// without any arithmetic on offsets: start two days early, which is before the
// date begins anywhere, and walk forward an hour at a time until the zone says
// it is that date. Exact for a zone a whole number of hours from UTC, which
// these three are.
const startOfDay = (date, tz) => {
  const from = Date.parse(`${date}T00:00:00.000Z`) - 2 * DAY_MS;
  for (let hours = 0; hours < 4 * 24; hours += 1) {
    const instant = new Date(from + hours * HOUR_MS);
    if (localDate(instant, tz) === date) return instant;
  }
  throw new Error(`${date} never begins in ${tz}`);
};

// The value of a bound that must be "this or later". Anything else, a bound
// turned the other way included, fails here by name.
const atLeast = (condition, name) => {
  assert.deepEqual(Object.keys(condition ?? {}), ['$gte'], `${name} must be a lower bound`);
  return condition.$gte;
};

// Runs getDashboard over empty collections and returns everything it sent:
// the five pipelines, and the query for the newest people piece by piece.
const ask = async (t, query, now, actor = OWNER) => {
  const sent = {};
  const keep = (name) => async (pipeline) => {
    sent[name] = pipeline;
    return [];
  };

  t.mock.method(User, 'aggregate', async (pipeline) =>
    // The snapshot is the one User pipeline that gathers everybody into one row.
    keep(pipeline[1].$group._id === null ? 'snapshot' : 'userDays')(pipeline)
  );
  t.mock.method(Group, 'aggregate', keep('groupDays'));
  t.mock.method(Expense, 'aggregate', keep('expenseDays'));
  t.mock.method(ItineraryJob, 'aggregate', keep('jobDays'));
  for (const Model of [Group, Expense, ItineraryJob]) {
    t.mock.method(Model, 'estimatedDocumentCount', async () => 0);
  }
  t.mock.method(User, 'find', (filter) => {
    sent.recent = { filter };
    const chain = {
      select: (fields) => ((sent.recent.select = fields), chain),
      sort: (order) => ((sent.recent.sort = order), chain),
      limit: (count) => ((sent.recent.limit = count), chain),
      lean: async () => [],
    };
    return chain;
  });

  await getDashboard(query, actor, now);
  return sent;
};

test('the midnights these tests measure from are the ones worked out by hand', () => {
  assert.equal(startOfDay('2026-09-18', 'Pacific/Kiritimati').toISOString(), '2026-09-17T10:00:00.000Z');
  assert.equal(startOfDay('2026-09-16', 'Pacific/Pago_Pago').toISOString(), '2026-09-16T11:00:00.000Z');
  // Four hours behind UTC while the clocks are forward, five once they are back.
  assert.equal(startOfDay('2026-10-21', 'America/New_York').toISOString(), '2026-10-21T04:00:00.000Z');
  assert.equal(startOfDay('2026-11-03', 'America/New_York').toISOString(), '2026-11-03T05:00:00.000Z');
});

test('every query reaches back to before the previous period begins, and not far beyond', async (t) => {
  for (const { tz, now, firstDay } of ZONES) {
    for (const days of [7, 30, 90]) {
      await t.test(`${tz}, ${days} days`, async (t) => {
        const sent = await ask(t, { days, tz }, now);

        // The date worked out by hand is the one the service counts from too.
        assert.equal(dayKeys(now, tz, 2 * days)[0], firstDay[days]);
        const begins = startOfDay(firstDay[days], tz);

        const floors = {
          'User createdAt': atLeast(sent.userDays[0].$match.createdAt, 'User createdAt'),
          'Group createdAt': atLeast(sent.groupDays[0].$match.createdAt, 'Group createdAt'),
          'ItineraryJob startedAt': atLeast(sent.jobDays[0].$match.startedAt, 'ItineraryJob startedAt'),
          'User _id': atLeast(sent.userDays[0].$match._id, 'User _id').getTimestamp(),
          'Group _id': atLeast(sent.groupDays[0].$match._id, 'Group _id').getTimestamp(),
          'Expense _id': atLeast(sent.expenseDays[0].$match._id, 'Expense _id').getTimestamp(),
        };

        for (const [name, floor] of Object.entries(floors)) {
          const reach = `${name} starts ${floor.toISOString()}, the period begins ${begins.toISOString()}`;
          // Any later and the first day of the previous period is cut short,
          // which shows up as growth that did not happen.
          assert.ok(floor <= begins, `${reach}: too late`);
          // The spare is there for daylight saving and for clocks that
          // disagree, not to read days that nothing will count.
          assert.ok(begins - floor <= 3 * DAY_MS, `${reach}: more than three days early`);
        }
      });
    }
  }
});

test('the collections dated by createdAt are bounded on _id, the one index they all have', async (t) => {
  // A clock with milliseconds on it, which an _id cannot hold.
  const now = new Date('2026-09-30T10:30:00.750Z');
  const sent = await ask(t, { days: 30, tz: 'Pacific/Kiritimati' }, now);

  const floorIds = [
    atLeast(sent.userDays[0].$match._id, 'User _id'),
    atLeast(sent.groupDays[0].$match._id, 'Group _id'),
    atLeast(sent.expenseDays[0].$match._id, 'Expense _id'),
  ];
  for (const floorId of floorIds) assert.ok(floorId instanceof mongoose.Types.ObjectId);
  // One floor for all three, and the lowest _id of its second: nothing made
  // in that second is left out.
  assert.equal(new Set(floorIds.map(String)).size, 1);
  assert.match(String(floorIds[0]), /^[0-9a-f]{8}0{16}$/);

  // User and Group are still held to createdAt as well, the date their days
  // are cut by. ItineraryJob has no createdAt and is held to startedAt.
  const since = atLeast(sent.userDays[0].$match.createdAt, 'User createdAt');
  assert.ok(since instanceof Date);
  assert.deepEqual(atLeast(sent.groupDays[0].$match.createdAt, 'Group createdAt'), since);
  assert.deepEqual(atLeast(sent.jobDays[0].$match.startedAt, 'ItineraryJob startedAt'), since);

  // The _id floor is that same instant with the milliseconds dropped. Rounded
  // up instead, it would turn away what the createdAt bound lets in.
  const floor = floorIds[0].getTimestamp();
  assert.ok(floor <= since);
  assert.ok(since - floor < 1000);
});

test('the days are cut in the zone that was asked for, in all four collections', async (t) => {
  for (const { tz, now } of ZONES) {
    await t.test(tz, async (t) => {
      const sent = await ask(t, { days: 7, tz }, now);
      const dayOf = (field) => ({ $dateToString: { format: '%Y-%m-%d', date: field, timezone: tz } });

      assert.deepEqual(sent.userDays[1].$group._id.day, dayOf('$createdAt'));
      assert.deepEqual(sent.groupDays[1].$group._id.day, dayOf('$createdAt'));
      assert.deepEqual(sent.expenseDays[1].$group._id.day, dayOf('$createdAt'));
      assert.deepEqual(sent.jobDays[1].$group._id.day, dayOf('$startedAt'));
    });
  }
});

test('signed in means within the last `days` times 24 hours, measured from now', async (t) => {
  // In the week New York's clocks went back, where seven calendar days are an
  // hour more than seven times 24.
  const { tz, now } = ZONES[2];

  for (const days of [7, 30, 90]) {
    await t.test(`${days} days`, async (t) => {
      const sent = await ask(t, { days, tz }, now);

      // Everybody, whenever they joined: only the conditions are about time.
      assert.deepEqual(sent.snapshot[0].$match, APP_USERS);
      assert.deepEqual(sent.snapshot[1].$group.signedIn, {
        $sum: { $cond: [{ $gte: ['$lastLoginAt', new Date(now.getTime() - days * DAY_MS)] }, 1, 0] },
      });
    });
  }
});

test('the newest six app users are read in _id order, off the index', async (t) => {
  const { tz, now } = ZONES[0];
  const sent = await ask(t, { days: 7, tz }, now);

  assert.deepEqual(sent.recent.filter, APP_USERS);
  // Newest first by _id, which begins with the second the account was made:
  // the index is already in that order, so the read can end after six.
  assert.deepEqual(sent.recent.sort, { _id: -1 });
  assert.equal(sent.recent.limit, 6);
});
