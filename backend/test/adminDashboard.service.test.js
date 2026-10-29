require('../testkit/safeEnv');

/**
 * The arithmetic behind the admin dashboard, without a database.
 *
 * Two things can go quietly wrong here and still produce a plausible screen:
 * a day that is cut at the wrong midnight, and two figures for the same period
 * that were counted separately and so disagree. dayKeys is the calendar, and
 * buildDashboard turns the day buckets MongoDB returns into every number the
 * panel shows, so both are tested with made-up buckets.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const env = require('../src/config/env');
require('../testkit/safeEnv').assertSafe(env);
const { dayKeys, buildDashboard } = require('../src/services/adminDashboard.service');

// 15:30 on 30 September in Kolkata. With seven days the current period is
// 24 to 30 September and the previous one 17 to 23 September.
const NOW = new Date('2026-09-30T10:00:00.000Z');
const CONTEXT = { days: 7, tz: 'Asia/Kolkata', now: NOW };

const FIRST_PREVIOUS = '2026-09-17';
const LAST_PREVIOUS = '2026-09-23';
const FIRST_CURRENT = '2026-09-24';
const TODAY = '2026-09-30';

// What getDashboard hands over when every collection is empty.
const raw = (overrides = {}) => ({
  userDays: [],
  groupDays: [],
  expenseDays: [],
  jobDays: [],
  userSnapshot: undefined,
  counts: { groups: 0, expenses: 0, aiPlans: 0 },
  recentUsers: null,
  ...overrides,
});

const userDay = (day, count) => ({ _id: { day }, count });
const groupDay = (day, type, count) => ({ _id: { day, type }, count });
const expenseDay = (day, category, count) => ({ _id: { day, category }, count });
const jobDay = (day, status, count, { errorCode, ...sums } = {}) => ({
  _id: { day, status, errorCode },
  count,
  durationMs: 0,
  timed: 0,
  inputTokens: 0,
  outputTokens: 0,
  ...sums,
});

const sum = (series, key) => series.reduce((total, point) => total + point[key], 0);

test('dayKeys ends on today in the zone asked for, not on the UTC date', () => {
  // 02:00 UTC on 1 March: already the 1st in Kolkata, still 28 February in
  // Los Angeles.
  const now = new Date('2026-03-01T02:00:00.000Z');

  assert.deepEqual(dayKeys(now, 'Asia/Kolkata', 3), ['2026-02-27', '2026-02-28', '2026-03-01']);
  assert.deepEqual(dayKeys(now, 'America/Los_Angeles', 3), ['2026-02-26', '2026-02-27', '2026-02-28']);
  assert.deepEqual(dayKeys(now, 'UTC', 1), ['2026-03-01']);
});

test('dayKeys neither repeats nor skips a date when the clocks change', () => {
  // 23:30 on 1 November in New York, the day the clocks went back. It lasted 25
  // hours, so 24 hours earlier is still 1 November.
  assert.deepEqual(dayKeys(new Date('2026-11-02T04:30:00.000Z'), 'America/New_York', 5), [
    '2026-10-28',
    '2026-10-29',
    '2026-10-30',
    '2026-10-31',
    '2026-11-01',
  ]);

  // 00:30 on 9 March, the day after they went forward. The 8th lasted 23
  // hours, so 24 hours earlier is already 7 March.
  assert.deepEqual(dayKeys(new Date('2026-03-09T04:30:00.000Z'), 'America/New_York', 4), [
    '2026-03-06',
    '2026-03-07',
    '2026-03-08',
    '2026-03-09',
  ]);
});

test('dayKeys crosses a year end and a leap day on the calendar', () => {
  assert.deepEqual(dayKeys(new Date('2028-03-01T12:00:00.000Z'), 'UTC', 3), [
    '2028-02-28',
    '2028-02-29',
    '2028-03-01',
  ]);
  assert.deepEqual(dayKeys(new Date('2027-01-01T12:00:00.000Z'), 'UTC', 2), ['2026-12-31', '2027-01-01']);
});

test('an empty database is a full chart of zeroes, one entry for every day', () => {
  for (const days of [7, 30, 90]) {
    const data = buildDashboard(raw(), { ...CONTEXT, days });

    assert.equal(data.series.length, days);
    assert.deepEqual(
      data.series.map((point) => point.date),
      dayKeys(NOW, 'Asia/Kolkata', days)
    );
    for (const point of data.series) {
      assert.deepEqual(point, { date: point.date, users: 0, groups: 0, expenses: 0 });
    }
    assert.deepEqual(data.range, {
      days,
      timezone: 'Asia/Kolkata',
      from: data.series[0].date,
      to: TODAY,
    });
  }

  const data = buildDashboard(raw(), CONTEXT);
  const nothing = { total: 0, current: 0, previous: 0 };
  assert.deepEqual(data.totals, { users: nothing, groups: nothing, expenses: nothing, aiPlans: nothing });
  assert.deepEqual(data.users, { total: 0, password: 0, google: 0, unverified: 0, blocked: 0, signedIn: 0 });
  assert.deepEqual(data.ai, {
    runs: 0,
    done: 0,
    failed: 0,
    running: 0,
    averageMs: null,
    inputTokens: 0,
    outputTokens: 0,
    failures: [],
  });
  assert.deepEqual(data.groupTypes, []);
  assert.deepEqual(data.expenseCategories, []);
  assert.equal(data.recentUsers, null);
});

test('the parts arrive in the order the contract lists them', () => {
  assert.deepEqual(Object.keys(buildDashboard(raw(), CONTEXT)), [
    'range',
    'totals',
    'series',
    'users',
    'ai',
    'groupTypes',
    'expenseCategories',
    'recentUsers',
  ]);
});

test('the two periods split between the right two days', () => {
  const data = buildDashboard(
    raw({
      userDays: [
        userDay(FIRST_PREVIOUS, 1),
        userDay(LAST_PREVIOUS, 2),
        userDay(FIRST_CURRENT, 4),
        userDay(TODAY, 8),
      ],
      groupDays: [groupDay(LAST_PREVIOUS, 'trip', 3), groupDay(FIRST_CURRENT, 'trip', 5)],
      expenseDays: [expenseDay(LAST_PREVIOUS, 'food', 7), expenseDay(FIRST_CURRENT, 'food', 11)],
      jobDays: [jobDay(LAST_PREVIOUS, 'done', 13), jobDay(FIRST_CURRENT, 'done', 17)],
    }),
    CONTEXT
  );

  assert.deepEqual(data.totals.users, { total: 0, current: 12, previous: 3 });
  assert.deepEqual(data.totals.groups, { total: 0, current: 5, previous: 3 });
  assert.deepEqual(data.totals.expenses, { total: 0, current: 11, previous: 7 });
  assert.deepEqual(data.totals.aiPlans, { total: 0, current: 17, previous: 13 });

  assert.deepEqual(data.series[0], { date: FIRST_CURRENT, users: 4, groups: 5, expenses: 11 });
  assert.deepEqual(data.series[6], { date: TODAY, users: 8, groups: 0, expenses: 0 });
});

test('buckets on a day in neither period are ignored everywhere', () => {
  // The queries start two days early on purpose, a clock that is ahead can
  // date something tomorrow, and a document with no date comes back as null.
  const outside = ['2026-09-16', '2026-10-01', '2025-09-30', null];

  const data = buildDashboard(
    raw({
      userDays: outside.map((day) => userDay(day, 5)),
      groupDays: outside.map((day) => groupDay(day, 'home', 5)),
      expenseDays: outside.map((day) => expenseDay(day, 'food', 5)),
      jobDays: outside.map((day) =>
        jobDay(day, 'failed', 5, { errorCode: 'AI_BUSY', inputTokens: 100, outputTokens: 100 })
      ),
    }),
    CONTEXT
  );

  for (const key of ['users', 'groups', 'expenses', 'aiPlans']) {
    assert.deepEqual(data.totals[key], { total: 0, current: 0, previous: 0 }, key);
  }
  assert.equal(data.series.length, 7);
  assert.equal(sum(data.series, 'users') + sum(data.series, 'groups') + sum(data.series, 'expenses'), 0);
  assert.deepEqual(data.groupTypes, []);
  assert.deepEqual(data.expenseCategories, []);
  assert.equal(data.ai.runs, 0);
  assert.equal(data.ai.inputTokens, 0);
  assert.deepEqual(data.ai.failures, []);
});

test('every figure for the period agrees with every other', () => {
  const data = buildDashboard(
    raw({
      userDays: [userDay('2026-09-25', 2), userDay('2026-09-29', 3), userDay('2026-09-20', 4)],
      groupDays: [
        groupDay('2026-09-24', 'trip', 2),
        groupDay('2026-09-24', 'home', 1),
        groupDay('2026-09-28', 'trip', 1),
        groupDay('2026-09-18', 'event', 6),
      ],
      expenseDays: [
        expenseDay('2026-09-26', 'food', 4),
        expenseDay('2026-09-26', 'travel', 2),
        expenseDay('2026-09-30', 'food', 3),
        expenseDay('2026-09-22', 'stay', 9),
      ],
      jobDays: [
        jobDay('2026-09-25', 'done', 3, { durationMs: 90000, timed: 3, inputTokens: 300, outputTokens: 900 }),
        jobDay('2026-09-27', 'failed', 2, { errorCode: 'AI_TIMEOUT', inputTokens: 50 }),
        jobDay('2026-09-30', 'running', 1),
        jobDay('2026-09-19', 'done', 5, { durationMs: 999999, timed: 5, inputTokens: 7777, outputTokens: 7777 }),
      ],
      userSnapshot: { total: 14, google: 3, unverified: 1, blocked: 2, signedIn: 4 },
      counts: { groups: 20, expenses: 40, aiPlans: 22 },
    }),
    CONTEXT
  );

  assert.equal(sum(data.series, 'users'), data.totals.users.current);
  assert.equal(sum(data.series, 'groups'), data.totals.groups.current);
  assert.equal(sum(data.series, 'expenses'), data.totals.expenses.current);
  assert.equal(data.range.from, data.series[0].date);
  assert.equal(data.range.to, data.series[data.series.length - 1].date);

  assert.equal(data.ai.runs, data.totals.aiPlans.current);
  assert.equal(data.ai.runs, data.ai.done + data.ai.failed + data.ai.running);

  // The breakdowns are the same buckets again, cut a different way.
  assert.equal(sum(data.groupTypes, 'count'), data.totals.groups.current);
  assert.equal(sum(data.expenseCategories, 'count'), data.totals.expenses.current);

  assert.deepEqual(data.totals, {
    users: { total: 14, current: 5, previous: 4 },
    groups: { total: 20, current: 4, previous: 6 },
    expenses: { total: 40, current: 9, previous: 9 },
    aiPlans: { total: 22, current: 6, previous: 5 },
  });
  // Nothing from the previous period leaks into the current one's detail.
  assert.deepEqual(data.ai, {
    runs: 6,
    done: 3,
    failed: 2,
    running: 1,
    averageMs: 30000,
    inputTokens: 350,
    outputTokens: 900,
    failures: [{ code: 'AI_TIMEOUT', count: 2 }],
  });
  assert.deepEqual(data.groupTypes, [
    { type: 'trip', count: 3 },
    { type: 'home', count: 1 },
  ]);
  assert.deepEqual(data.expenseCategories, [
    { category: 'food', count: 7 },
    { category: 'travel', count: 2 },
  ]);
  assert.deepEqual(data.users, { total: 14, password: 11, google: 3, unverified: 1, blocked: 2, signedIn: 4 });
});

test('a run with no status stored counts as running, so the three still add up', () => {
  const data = buildDashboard(
    raw({ jobDays: [jobDay(TODAY, undefined, 2), jobDay(TODAY, 'done', 1), jobDay(TODAY, 'failed', 1)] }),
    CONTEXT
  );

  assert.equal(data.ai.running, 2);
  assert.equal(data.ai.runs, 4);
  assert.equal(data.ai.runs, data.ai.done + data.ai.failed + data.ai.running);
});

test('the average duration is null until a run has finished, and a whole number after', () => {
  const unfinished = buildDashboard(
    raw({ jobDays: [jobDay(TODAY, 'running', 2), jobDay(TODAY, 'failed', 1), jobDay(TODAY, 'done', 1)] }),
    CONTEXT
  );
  // Null rather than 0: "no plan has finished" is not "plans take no time".
  assert.equal(unfinished.ai.averageMs, null);

  // 1000 ms over 3 runs and 1001 over 3 more: 2001 / 6 = 333.5.
  const finished = buildDashboard(
    raw({
      jobDays: [
        jobDay('2026-09-28', 'done', 3, { durationMs: 1000, timed: 3 }),
        jobDay(TODAY, 'done', 4, { durationMs: 1001, timed: 3 }),
      ],
    }),
    CONTEXT
  );
  assert.equal(finished.ai.averageMs, 334);
  assert.equal(Number.isInteger(finished.ai.averageMs), true);
});

test('failures are listed worst first, equal ones by code, and only the top three', () => {
  const data = buildDashboard(
    raw({
      jobDays: [
        jobDay('2026-09-25', 'failed', 2, { errorCode: 'AI_TIMEOUT' }),
        jobDay('2026-09-26', 'failed', 1, { errorCode: 'AI_TIMEOUT' }),
        jobDay('2026-09-26', 'failed', 3, { errorCode: 'AI_REFUSED' }),
        jobDay('2026-09-27', 'failed', 5, { errorCode: 'AI_BUSY' }),
        jobDay('2026-09-27', 'failed', 1, { errorCode: 'AI_STALE' }),
        // No code for these two: one stored as null, one not stored at all.
        jobDay('2026-09-28', 'failed', 1, { errorCode: null }),
        jobDay('2026-09-29', 'failed', 1),
        // A finished run carries no code either, and is not a failure.
        jobDay('2026-09-29', 'done', 9),
        jobDay(LAST_PREVIOUS, 'failed', 50, { errorCode: 'AI_BAD_OUTPUT' }),
      ],
    }),
    CONTEXT
  );

  assert.equal(data.ai.failed, 14);
  assert.deepEqual(data.ai.failures, [
    { code: 'AI_BUSY', count: 5 },
    { code: 'AI_REFUSED', count: 3 },
    { code: 'AI_TIMEOUT', count: 3 },
  ]);

  const uncoded = buildDashboard(
    raw({ jobDays: [jobDay(TODAY, 'failed', 2, { errorCode: null }), jobDay(TODAY, 'failed', 1)] }),
    CONTEXT
  );
  assert.deepEqual(uncoded.ai.failures, [{ code: 'AI_FAILED', count: 3 }]);
});

test('breakdowns add a type up across days and list the largest first, equal ones by name', () => {
  const data = buildDashboard(
    raw({
      groupDays: [
        groupDay('2026-09-24', 'other', 2),
        groupDay('2026-09-25', 'home', 1),
        groupDay('2026-09-26', 'home', 1),
        groupDay('2026-09-27', 'trip', 3),
        groupDay('2026-09-28', 'couple', 2),
        groupDay(LAST_PREVIOUS, 'event', 40),
      ],
      expenseDays: [
        expenseDay('2026-09-24', 'travel', 5),
        expenseDay('2026-09-25', 'food', 4),
        expenseDay('2026-09-30', 'food', 3),
        expenseDay('2026-09-30', 'general', 5),
        expenseDay(FIRST_PREVIOUS, 'stay', 40),
      ],
    }),
    CONTEXT
  );

  assert.deepEqual(data.groupTypes, [
    { type: 'trip', count: 3 },
    { type: 'couple', count: 2 },
    { type: 'home', count: 2 },
    { type: 'other', count: 2 },
  ]);
  assert.deepEqual(data.expenseCategories, [
    { category: 'food', count: 7 },
    { category: 'general', count: 5 },
    { category: 'travel', count: 5 },
  ]);
});

test('the newest sign-ups are shown as the rest of the API reads an account', () => {
  const createdAt = new Date('2026-09-29T10:00:00.000Z');
  const data = buildDashboard(
    raw({
      recentUsers: [
        // An account from before any of these fields existed.
        { _id: '65a000000000000000000011', name: 'Asha', email: 'asha@example.com', createdAt },
        {
          _id: '65a000000000000000000012',
          name: 'Ben',
          email: 'ben@example.com',
          avatar: 'https://example.com/ben.png',
          googleId: 'google-sub-1234567890',
          emailVerified: false,
          isActive: false,
          createdAt,
        },
        {
          _id: '65a000000000000000000013',
          name: 'Chen',
          email: 'chen@example.com',
          avatar: null,
          googleId: null,
          emailVerified: true,
          isActive: true,
          createdAt,
        },
      ],
    }),
    CONTEXT
  );

  assert.deepEqual(data.recentUsers, [
    {
      id: '65a000000000000000000011',
      name: 'Asha',
      email: 'asha@example.com',
      avatar: null,
      method: 'password',
      emailVerified: true,
      isActive: true,
      createdAt,
    },
    {
      id: '65a000000000000000000012',
      name: 'Ben',
      email: 'ben@example.com',
      avatar: 'https://example.com/ben.png',
      method: 'google',
      emailVerified: false,
      isActive: false,
      createdAt,
    },
    {
      id: '65a000000000000000000013',
      name: 'Chen',
      email: 'chen@example.com',
      avatar: null,
      method: 'password',
      emailVerified: true,
      isActive: true,
      createdAt,
    },
  ]);

  // Which kind of account, never Google's id for the person.
  const sent = JSON.stringify(data);
  assert.ok(!sent.includes('googleId'));
  assert.ok(!sent.includes('google-sub-1234567890'));
  assert.equal(JSON.parse(sent).recentUsers[0].createdAt, '2026-09-29T10:00:00.000Z');
});

test('a withheld list is null, which is not the same as nobody having signed up', () => {
  assert.equal(buildDashboard(raw({ recentUsers: null }), CONTEXT).recentUsers, null);
  assert.deepEqual(buildDashboard(raw({ recentUsers: [] }), CONTEXT).recentUsers, []);
});
