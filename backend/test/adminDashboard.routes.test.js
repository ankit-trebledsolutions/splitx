require('../testkit/safeEnv');

/**
 * The dashboard endpoint as the real app serves it.
 *
 * Every admin may open it, which is unlike every other screen in the panel, so
 * what matters here is what it gives to whom: counts to any staff account, and
 * the list of newest sign-ups only to someone who could open the Users screen.
 * For anyone else that list is not merely left out of the answer, it is never
 * read from the database.
 *
 * No database: the admin is looked up through a mocked User.findById and every
 * query the service makes is replaced. The sums themselves are tested in
 * adminDashboard.service.test.js.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const env = require('../src/config/env');
require('../testkit/safeEnv').assertSafe(env);
const app = require('../src/app');
const User = require('../src/models/User');
const Group = require('../src/models/Group');
const Expense = require('../src/models/Expense');
const ItineraryJob = require('../src/models/ItineraryJob');
const { dayKeys } = require('../src/services/adminDashboard.service');
const { ROLES, PERMISSIONS } = require('../src/config/permissions');

const ID = '65a000000000000000000001';
const BASE = '/api/v1/admin/dashboard';
const TZ = 'Asia/Kolkata';
const APP_USERS = { role: { $nin: [ROLES.ADMIN, ROLES.SUPER_ADMIN] } };

const account = (role, permissions = {}) => ({
  _id: ID,
  name: 'Test Admin',
  email: 'admin@example.com',
  role,
  isActive: true,
  permissions: new Map(Object.entries(permissions)),
});

const adminToken = () => jwt.sign({ sub: ID, scope: 'admin' }, env.jwtSecret, { expiresIn: '5m' });

// Days that are in the same period whether or not midnight passes in Kolkata
// between building these rows and the request being answered: two and three
// days ago for the current week, nine days ago for the one before.
const keys = dayKeys(new Date(), TZ, 14);
const [EARLIER, RECENT, LAST_WEEK] = [keys[10], keys[11], keys[4]];

const NEWEST = [
  {
    _id: '65a000000000000000000011',
    name: 'Asha',
    email: 'asha@example.com',
    avatar: null,
    googleId: 'google-sub-1234567890',
    emailVerified: true,
    isActive: true,
    createdAt: new Date('2026-09-29T10:00:00.000Z'),
  },
  // An account from before verification, suspension and avatars existed.
  {
    _id: '65a000000000000000000012',
    name: 'Ben',
    email: 'ben@example.com',
    createdAt: new Date('2026-09-28T10:00:00.000Z'),
  },
];

const STORED = {
  userDays: [
    { _id: { day: RECENT }, count: 3 },
    { _id: { day: EARLIER }, count: 2 },
    { _id: { day: LAST_WEEK }, count: 2 },
  ],
  userSnapshot: [{ _id: null, total: 14, google: 3, unverified: 1, blocked: 0, signedIn: 4 }],
  groupDays: [
    { _id: { day: RECENT, type: 'trip' }, count: 2 },
    { _id: { day: EARLIER, type: 'home' }, count: 1 },
    { _id: { day: LAST_WEEK, type: 'trip' }, count: 1 },
  ],
  expenseDays: [
    { _id: { day: RECENT, category: 'food' }, count: 7 },
    { _id: { day: EARLIER, category: 'travel' }, count: 5 },
    { _id: { day: LAST_WEEK, category: 'food' }, count: 9 },
  ],
  jobDays: [
    { _id: { day: RECENT, status: 'done', errorCode: null }, count: 6, durationMs: 246000, timed: 6, inputTokens: 1000, outputTokens: 5000 },
    { _id: { day: RECENT, status: 'failed', errorCode: 'AI_TIMEOUT' }, count: 1, durationMs: 0, timed: 0, inputTokens: 234, outputTokens: 678 },
    { _id: { day: EARLIER, status: 'running', errorCode: null }, count: 1, durationMs: 0, timed: 0, inputTokens: 0, outputTokens: 0 },
    { _id: { day: LAST_WEEK, status: 'done', errorCode: null }, count: 3, durationMs: 90000, timed: 3, inputTokens: 1, outputTokens: 1 },
  ],
  counts: { groups: 9, expenses: 40, aiPlans: 22 },
};

// Signs in as `user` and serves the app with every dashboard query replaced.
// `run` gets the mocks as well, to see which queries were made and with what.
const serveAs = async (t, user, run) => {
  t.mock.method(User, 'findById', async () => user);

  const mocks = {
    // The snapshot is the one User pipeline that gathers everybody into one row.
    userAggregate: t.mock.method(User, 'aggregate', async (pipeline) =>
      pipeline[1].$group._id === null ? STORED.userSnapshot : STORED.userDays
    ),
    groupAggregate: t.mock.method(Group, 'aggregate', async () => STORED.groupDays),
    expenseAggregate: t.mock.method(Expense, 'aggregate', async () => STORED.expenseDays),
    jobAggregate: t.mock.method(ItineraryJob, 'aggregate', async () => STORED.jobDays),
    select: t.mock.fn(),
    limit: t.mock.fn(),
  };
  t.mock.method(Group, 'estimatedDocumentCount', async () => STORED.counts.groups);
  t.mock.method(Expense, 'estimatedDocumentCount', async () => STORED.counts.expenses);
  t.mock.method(ItineraryJob, 'estimatedDocumentCount', async () => STORED.counts.aiPlans);
  mocks.find = t.mock.method(User, 'find', () => {
    const query = {
      select: (fields) => (mocks.select(fields), query),
      sort: () => query,
      limit: (count) => (mocks.limit(count), query),
      lean: async () => NEWEST,
    };
    return query;
  });

  const server = app.listen(0, '127.0.0.1');
  await new Promise((done) => server.once('listening', done));
  const call = async (search = '', token = adminToken()) => {
    const res = await fetch(`http://127.0.0.1:${server.address().port}${BASE}${search}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    return { status: res.status, body: await res.json() };
  };
  try {
    await run(call, mocks);
  } finally {
    await new Promise((done) => server.close(done));
  }
};

const queriesMade = (mocks) =>
  mocks.userAggregate.mock.callCount() +
  mocks.groupAggregate.mock.callCount() +
  mocks.expenseAggregate.mock.callCount() +
  mocks.jobAggregate.mock.callCount() +
  mocks.find.mock.callCount();

test('an anonymous caller is refused before anything is counted', async (t) => {
  await serveAs(t, account(ROLES.SUPER_ADMIN), async (call, mocks) => {
    const res = await call('', null);
    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
    assert.equal(queriesMade(mocks), 0);
  });
});

test('a token from the mobile app is refused', async (t) => {
  // What the app is given at sign-in carries no admin scope, whoever it is for.
  await serveAs(t, account(ROLES.USER), async (call, mocks) => {
    const appToken = jwt.sign({ sub: ID }, env.jwtSecret, { expiresIn: '5m' });
    const res = await call('', appToken);
    assert.equal(res.status, 401);
    assert.match(res.body.message, /not valid for the admin panel/);
    assert.equal(queriesMade(mocks), 0);
  });
});

test('an app user is refused even with a token that says admin', async (t) => {
  await serveAs(t, account(ROLES.USER), async (call, mocks) => {
    const res = await call();
    assert.equal(res.status, 403);
    assert.match(res.body.message, /Not an admin account/);
    assert.equal(queriesMade(mocks), 0);
  });
});

test('only the three ranges the panel offers are accepted', async (t) => {
  await serveAs(t, account(ROLES.SUPER_ADMIN), async (call, mocks) => {
    for (const days of ['5', '0', '-7', '31', '7.5', '100000', 'week', '', '7&days=30']) {
      const res = await call(`?days=${days}`);
      assert.equal(res.status, 400, `days=${days}`);
      assert.equal(res.body.success, false, `days=${days}`);
    }
    assert.match((await call('?days=5')).body.message, /days must be 7, 30 or 90/);
    assert.equal(queriesMade(mocks), 0);

    for (const days of [7, 30, 90]) {
      const res = await call(`?days=${days}`);
      assert.equal(res.status, 200, `days=${days}`);
      assert.equal(res.body.data.range.days, days);
      assert.equal(res.body.data.series.length, days);
    }
  });
});

test('a time zone nobody has heard of is refused', async (t) => {
  await serveAs(t, account(ROLES.SUPER_ADMIN), async (call, mocks) => {
    for (const tz of ['Not/AZone', 'Mars/Olympus_Mons', '', 'x'.repeat(65), 'UTC&tz=Asia/Kolkata']) {
      const res = await call(`?tz=${tz}`);
      assert.equal(res.status, 400, `tz=${tz.slice(0, 20)}`);
    }
    assert.match((await call('?tz=Not/AZone')).body.message, /Unknown time zone/);
    assert.equal(queriesMade(mocks), 0);
  });
});

test('a zone the server knows and the database does not is a 400, not a crash', async (t) => {
  await serveAs(t, account(ROLES.SUPER_ADMIN), async (call, mocks) => {
    // MongoDB answers with this code when $dateToString is given a zone that
    // is not on its own list, which is stricter than JavaScript's.
    mocks.groupAggregate.mock.mockImplementation(async () => {
      throw Object.assign(new Error('unrecognized time zone identifier: "asia/kolkata"'), { code: 40485 });
    });
    const res = await call('?tz=asia/kolkata');
    assert.equal(res.status, 400);
    assert.match(res.body.message, /Unknown time zone/);
  });
});

test('with no query it is the last 30 days in UTC', async (t) => {
  await serveAs(t, account(ROLES.SUPER_ADMIN), async (call) => {
    const res = await call();
    assert.equal(res.status, 200);
    assert.equal(res.body.data.range.days, 30);
    assert.equal(res.body.data.range.timezone, 'UTC');
    assert.equal(res.body.data.series.length, 30);
  });
});

test('an owner gets the whole dashboard', async (t) => {
  await serveAs(t, account(ROLES.SUPER_ADMIN), async (call, mocks) => {
    const res = await call(`?days=7&tz=${TZ}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);

    const { data } = res.body;
    assert.deepEqual(Object.keys(data), [
      'range',
      'totals',
      'series',
      'users',
      'ai',
      'groupTypes',
      'expenseCategories',
      'recentUsers',
    ]);

    assert.deepEqual(Object.keys(data.range), ['days', 'timezone', 'from', 'to']);
    assert.equal(data.range.days, 7);
    assert.equal(data.range.timezone, TZ);
    assert.equal(data.series.length, 7);
    assert.equal(data.range.from, data.series[0].date);
    assert.equal(data.range.to, data.series[6].date);
    for (const point of data.series) {
      assert.deepEqual(Object.keys(point), ['date', 'users', 'groups', 'expenses']);
      assert.match(point.date, /^\d{4}-\d{2}-\d{2}$/);
    }
    assert.deepEqual(
      data.series.find((point) => point.date === RECENT),
      { date: RECENT, users: 3, groups: 2, expenses: 7 }
    );

    assert.deepEqual(data.totals, {
      users: { total: 14, current: 5, previous: 2 },
      groups: { total: 9, current: 3, previous: 1 },
      expenses: { total: 40, current: 12, previous: 9 },
      aiPlans: { total: 22, current: 8, previous: 3 },
    });
    assert.deepEqual(data.users, { total: 14, password: 11, google: 3, unverified: 1, blocked: 0, signedIn: 4 });
    assert.deepEqual(data.ai, {
      runs: 8,
      done: 6,
      failed: 1,
      running: 1,
      averageMs: 41000,
      inputTokens: 1234,
      outputTokens: 5678,
      failures: [{ code: 'AI_TIMEOUT', count: 1 }],
    });
    assert.deepEqual(data.groupTypes, [
      { type: 'trip', count: 2 },
      { type: 'home', count: 1 },
    ]);
    assert.deepEqual(data.expenseCategories, [
      { category: 'food', count: 7 },
      { category: 'travel', count: 5 },
    ]);
    assert.deepEqual(data.recentUsers, [
      {
        id: '65a000000000000000000011',
        name: 'Asha',
        email: 'asha@example.com',
        avatar: null,
        method: 'google',
        emailVerified: true,
        isActive: true,
        createdAt: '2026-09-29T10:00:00.000Z',
      },
      {
        id: '65a000000000000000000012',
        name: 'Ben',
        email: 'ben@example.com',
        avatar: null,
        method: 'password',
        emailVerified: true,
        isActive: true,
        createdAt: '2026-09-28T10:00:00.000Z',
      },
    ]);
    // Which kind of account, never Google's id for the person.
    assert.ok(!JSON.stringify(res.body).includes('google-sub-1234567890'));

    assert.equal(mocks.find.mock.callCount(), 1);
  });
});

test('people are counted and listed by exclusion, and amounts are never added up', async (t) => {
  await serveAs(t, account(ROLES.SUPER_ADMIN), async (call, mocks) => {
    assert.equal((await call(`?days=7&tz=${TZ}`)).status, 200);

    // { role: 'user' } would match none of the accounts that predate `role`,
    // and leaving the filter out would count the staff.
    assert.equal(mocks.userAggregate.mock.callCount(), 2);
    for (const { arguments: [pipeline] } of mocks.userAggregate.mock.calls) {
      assert.deepEqual(pipeline[0].$match.role, APP_USERS.role);
    }
    // The same filter is what keeps an owner out of the list of newest people.
    assert.deepEqual(mocks.find.mock.calls[0].arguments[0], APP_USERS);
    assert.equal(
      mocks.select.mock.calls[0].arguments[0],
      'name email avatar googleId emailVerified isActive createdAt'
    );
    assert.equal(mocks.limit.mock.calls[0].arguments[0], 6);

    // No currency is stored anywhere, so a total of amounts would mean nothing.
    const expensePipeline = JSON.stringify(mocks.expenseAggregate.mock.calls[0].arguments[0]);
    assert.ok(!expensePipeline.includes('amount'));

    // The days are cut in the admin's zone, by the database.
    for (const mock of [mocks.groupAggregate, mocks.expenseAggregate, mocks.jobAggregate]) {
      const [pipeline] = mock.mock.calls[0].arguments;
      assert.equal(pipeline[1].$group._id.day.$dateToString.timezone, TZ);
    }
  });
});

// Each case is a subtest so that it installs, and takes away, its own mocks.
test('a co-admin without user management gets the counts and no people', async (t) => {
  const cases = {
    'no permissions at all': {},
    'user management set to none': { [PERMISSIONS.USER_MANAGEMENT]: 'none' },
    'every other module': {
      [PERMISSIONS.EMAIL_TEMPLATE]: 'read_write',
      [PERMISSIONS.GENERAL_SETTINGS]: 'read_write',
    },
  };

  for (const [name, permissions] of Object.entries(cases)) {
    await t.test(name, async (t) => {
      await serveAs(t, account(ROLES.ADMIN, permissions), async (call, mocks) => {
        const res = await call(`?days=7&tz=${TZ}`);
        assert.equal(res.status, 200);
        // Null, not an empty list: the panel has to tell "not yours to see"
        // from "nobody has signed up".
        assert.equal(res.body.data.recentUsers, null);
        assert.ok('recentUsers' in res.body.data);
        // Not fetched and then dropped: never asked for.
        assert.equal(mocks.find.mock.callCount(), 0);

        assert.equal(res.body.data.totals.users.total, 14);
        assert.equal(res.body.data.series.length, 7);
        assert.ok(!JSON.stringify(res.body).includes('asha@example.com'));
      });
    });
  }
});

test('a co-admin who may read users gets the newest of them', async (t) => {
  for (const level of ['read', 'read_write']) {
    await t.test(level, async (t) => {
      await serveAs(t, account(ROLES.ADMIN, { [PERMISSIONS.USER_MANAGEMENT]: level }), async (call, mocks) => {
        const res = await call(`?days=7&tz=${TZ}`);
        assert.equal(res.status, 200);
        assert.equal(mocks.find.mock.callCount(), 1);
        assert.deepEqual(
          res.body.data.recentUsers.map((user) => user.email),
          ['asha@example.com', 'ben@example.com']
        );
      });
    });
  }
});
