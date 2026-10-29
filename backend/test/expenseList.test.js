require('../testkit/safeEnv');

/**
 * A group's Expenses list, its pages and their totals, and the Balances and
 * Contributions built from the same expenses.
 *
 * The list is read as plain documents with each person looked up once, so a
 * long-running group no longer ties up the server. What the app receives must
 * not change: every expense with its payer's and each share's name and email,
 * newest first, and the whole list for app versions that do not ask for pages.
 *
 * No database: the queries are mocked and hand back what a test gives them.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const env = require('../src/config/env');
require('../testkit/safeEnv').assertSafe(env);
const app = require('../src/app');
const User = require('../src/models/User');
const Group = require('../src/models/Group');
const Expense = require('../src/models/Expense');
const Task = require('../src/models/Task');

const id = (n) => new mongoose.Types.ObjectId(`65a0000000000000000000${String(n).padStart(2, '0')}`);
const ME = id(10);
const ALI = id(11);
const BEA = id(12);
const GONE = id(13); // left the group since
const GROUP = id(50);

// People as a query selecting only some fields hands them back: no other
// defaults filled in, so their JSON is exactly what the app has always had.
const NAMES = [[ME, 'Jane'], [ALI, 'Ali'], [BEA, 'Bea'], [GONE, 'Gus']];
const selected = (fields) => ([userId, name]) => {
  const all = { _id: userId, name, email: `${name.toLowerCase()}@example.com`, lastSeenAt: null };
  return User.hydrate(Object.fromEntries(['_id', ...fields].map((k) => [k, all[k]])), Object.fromEntries(['_id', ...fields].map((k) => [k, 1])));
};
const PEOPLE = NAMES.map(selected(['name', 'email']));

// A stand-in for a Mongoose query: builder methods record their arguments and
// return the same object; awaiting it yields `result` (or what it makes of them).
const query = (result, calls = {}) => {
  const q = {};
  for (const name of ['sort', 'skip', 'limit', 'populate', 'select', 'lean']) {
    q[name] = (...args) => {
      calls[name] = args;
      return q;
    };
  }
  q.then = (resolve, reject) =>
    Promise.resolve(typeof result === 'function' ? result(calls) : result).then(resolve, reject);
  return q;
};

const expense = (n, paidBy, splits, extra = {}) => ({
  _id: id(70 + n),
  group: GROUP,
  description: `Expense ${n}`,
  amount: splits.reduce((sum, [, amount]) => sum + amount, 0),
  paidBy,
  splits: splits.map(([user, amount, settled]) => ({ user, amount, settled })),
  category: 'food',
  date: new Date(`2026-10-0${n}T10:00:00Z`),
  createdBy: paidBy,
  createdAt: new Date(`2026-10-0${n}T10:00:00Z`),
  updatedAt: new Date(`2026-10-0${n}T10:00:00Z`),
  __v: 0,
  ...extra,
});

// Newest first, as the list query sorts them.
const EXPENSES = [
  expense(3, ME, [[ME, 10, false], [ALI, 10, false], [BEA, 10, true]]),
  expense(2, ALI, [[ME, 25.5, false], [ALI, 25.5, false]]),
  // Older documents can predate a field; the list fills in what Mongoose would.
  expense(1, GONE, [[GONE, 5], [ME, 5]], { category: undefined }),
];

// The group's members, as getGroupForMember populates them.
const members = () => NAMES.slice(0, 3).map(selected(['name', 'email', 'lastSeenAt']));

// Signs in as Jane, a member of GROUP, and serves the app.
const serveAs = async (t, { expenses = EXPENSES, totals, tasks = [] } = {}, run) => {
  t.mock.method(User, 'findById', async () => ({ _id: ME, isActive: true, role: 'user' }));
  t.mock.method(Group, 'findById', () => query({ _id: GROUP, members: members() }));
  const calls = {};
  const find = t.mock.method(Expense, 'find', () => {
    for (const key of Object.keys(calls)) delete calls[key];
    return query((c) => {
      const from = c.skip?.[0] ?? 0;
      return expenses.slice(from, c.limit ? from + c.limit[0] : undefined);
    }, calls);
  });
  const aggregate = t.mock.method(Expense, 'aggregate', async () => [
    totals ?? { spent: [{ sum: 91, count: 3 }], open: [{ youOwe: 30.5, owedYou: 10 }] },
  ]);
  const people = t.mock.method(User, 'find', (filter) => {
    const wanted = new Set(filter._id.$in.map(String));
    return query(PEOPLE.filter((p) => wanted.has(String(p._id))));
  });
  t.mock.method(Task, 'find', () => query(tasks));

  const token = jwt.sign({ sub: String(ME) }, env.jwtSecret, { expiresIn: '5m' });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((done) => server.once('listening', done));
  const get = async (path) => {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/v1${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return { status: res.status, body: await res.json() };
  };
  try {
    await run(get, { calls, find, aggregate, people });
  } finally {
    await new Promise((done) => server.close(done));
  }
};

const BASE = `/groups/${GROUP}/expenses`;
const JANE = { _id: String(ME), name: 'Jane', email: 'jane@example.com', emailVerified: true, profileComplete: false };

test('without paging, the whole list comes back as before: people filled in, newest first', async (t) => {
  await serveAs(t, {}, async (get, { calls, aggregate, people }) => {
    const { status, body } = await get(BASE);
    assert.equal(status, 200);
    assert.deepEqual(Object.keys(body.data), ['expenses']);
    const [newest, , oldest] = body.data.expenses;
    assert.deepEqual(
      body.data.expenses.map((e) => e.description),
      ['Expense 3', 'Expense 2', 'Expense 1']
    );
    // The same person JSON a populate gave (User#toJSON), password left out.
    assert.deepEqual(newest.paidBy, JANE);
    assert.deepEqual(newest.splits[1].user.name, 'Ali');
    assert.equal(newest.splits[2].settled, true);
    // Someone no longer in the group is still shown on their old expenses.
    assert.equal(oldest.paidBy.name, 'Gus');
    // Defaults a lean read skips.
    assert.equal(oldest.category, 'general');
    assert.equal(oldest.splits[0].settled, false);
    assert.equal(oldest.splits[0].settledAt, null);
    assert.deepEqual(calls.sort, [{ date: -1, createdAt: -1, _id: -1 }]);
    assert.equal(calls.limit, undefined);
    // Totals only come with pages, and each person is looked up once.
    assert.equal(aggregate.mock.callCount(), 0);
    assert.equal(people.mock.callCount(), 1);
    assert.equal(people.mock.calls[0].arguments[0]._id.$in.length, 4);
  });
});

test('an account that is gone comes out as null, as populate gave', async (t) => {
  const orphan = [expense(4, id(99), [[id(99), 4], [ME, 4]])];
  await serveAs(t, { expenses: orphan }, async (get) => {
    const { body } = await get(BASE);
    assert.equal(body.data.expenses[0].paidBy, null);
    assert.equal(body.data.expenses[0].splits[0].user, null);
    assert.equal(body.data.expenses[0].splits[1].user.name, 'Jane');
  });
});

test('the first page carries hasMore and the group-wide totals', async (t) => {
  await serveAs(t, {}, async (get, { calls, aggregate }) => {
    const { status, body } = await get(`${BASE}?limit=2`);
    assert.equal(status, 200);
    assert.equal(body.data.expenses.length, 2);
    assert.equal(body.data.hasMore, true);
    assert.deepEqual(body.data.totals, { count: 3, spent: 91, youOwe: 30.5, owedYou: 10 });
    // One extra is read to know whether there is a next page.
    assert.deepEqual(calls.skip, [0]);
    assert.deepEqual(calls.limit, [3]);
    // The sums are for Jane, over this group.
    const pipeline = aggregate.mock.calls[0].arguments[0];
    assert.equal(String(pipeline[0].$match.group), String(GROUP));
  });
});

test('later pages leave the totals out, and the last one says there is no more', async (t) => {
  await serveAs(t, {}, async (get, { calls, aggregate }) => {
    const { body } = await get(`${BASE}?limit=2&offset=2`);
    assert.deepEqual(
      body.data.expenses.map((e) => e.description),
      ['Expense 1']
    );
    assert.equal(body.data.hasMore, false);
    assert.equal('totals' in body.data, false);
    assert.deepEqual(calls.skip, [2]);
    assert.equal(aggregate.mock.callCount(), 0);
  });
});

test('an empty group has zero totals', async (t) => {
  await serveAs(t, { expenses: [], totals: { spent: [], open: [] } }, async (get) => {
    const { body } = await get(`${BASE}?limit=50`);
    assert.deepEqual(body.data, {
      expenses: [],
      hasMore: false,
      totals: { count: 0, spent: 0, youOwe: 0, owedYou: 0 },
    });
  });
});

test('page sizes are capped at 100, and nonsense means the whole list', async (t) => {
  await serveAs(t, {}, async (get, { calls }) => {
    await get(`${BASE}?limit=500`);
    assert.deepEqual(calls.limit, [101]);
  });
  for (const q of ['limit=abc', 'limit=0', 'limit=-3']) {
    await t.test(q, async (st) => {
      await serveAs(st, {}, async (get, { calls }) => {
        const { body } = await get(`${BASE}?${q}`);
        assert.equal(calls.limit, undefined);
        assert.equal(body.data.expenses.length, 3);
      });
    });
  }
});

test('a negative offset starts from the beginning', async (t) => {
  await serveAs(t, {}, async (get, { calls }) => {
    await get(`${BASE}?limit=2&offset=-5`);
    assert.deepEqual(calls.skip, [0]);
  });
});

test('someone outside the group is refused', async (t) => {
  t.mock.method(User, 'findById', async () => ({ _id: id(40), isActive: true, role: 'user' }));
  t.mock.method(Group, 'findById', () => query({ _id: GROUP, members: members() }));
  const find = t.mock.method(Expense, 'find', () => query([]));
  const token = jwt.sign({ sub: String(id(40)) }, env.jwtSecret, { expiresIn: '5m' });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((done) => server.once('listening', done));
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/v1${BASE}?limit=10`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 403);
    assert.equal(find.mock.callCount(), 0);
  } finally {
    await new Promise((done) => server.close(done));
  }
});

test('balances use the members already loaded and look up only former members', async (t) => {
  await serveAs(t, {}, async (get, { people }) => {
    const { status, body } = await get(`/groups/${GROUP}/balances`);
    assert.equal(status, 200);
    // In order of first appearance, as before: Jane paid 30, owes 10 + 25.5 + 5.
    assert.deepEqual(
      body.data.balances.map((b) => [b.user.name, b.net]),
      [['Jane', -10.5], ['Ali', 15.5], ['Bea', -10], ['Gus', 5]]
    );
    assert.deepEqual(body.data.balances[0].user, { ...JANE, lastSeenAt: null });
    assert.deepEqual(
      people.mock.calls.map((c) => c.arguments[0]._id.$in.map(String)),
      [[String(GONE)]]
    );
    const sent = body.data.settlements.reduce((sum, s) => sum + s.amount, 0);
    assert.equal(Math.round(sent * 100) / 100, 20.5);
  });
});

test('contributions count paid and fair share per member from plain documents', async (t) => {
  const tasks = [
    { assignees: [ALI], createdBy: ME, status: 'done' },
    // Older tasks may have no assignees field at all: they count for their creator.
    { createdBy: ME, status: 'open' },
  ];
  await serveAs(t, { tasks }, async (get) => {
    const { status, body } = await get(`/groups/${GROUP}/contributions`);
    assert.equal(status, 200);
    assert.equal(body.data.totalExpenses, 91);
    const byName = Object.fromEntries(body.data.members.map((m) => [m.user.name, m]));
    assert.equal(byName.Jane.expensesPaid, 30);
    assert.equal(byName.Jane.fairShare, 40.5);
    assert.equal(byName.Ali.expensesPaid, 51);
    assert.equal(byName.Ali.tasksDone, 1);
    assert.equal(byName.Jane.tasksAssigned, 1);
    assert.equal(body.data.tasksCompleted, 1);
  });
});

test('a password saved by the old bcryptjs library still signs in', async () => {
  // Made with bcryptjs 2.4.3 at cost 12, as every existing account's was.
  const hash = '$2a$12$7N6qQnlHKSA8jH8L8fgEhes3ZBwJfrPGVJomgVWe3Bht5aHxCsOvS';
  const user = new User({ name: 'Old', email: 'old@example.com', password: hash });
  assert.equal(await user.comparePassword('old-password-1'), true);
  assert.equal(await user.comparePassword('wrong-password'), false);
});
