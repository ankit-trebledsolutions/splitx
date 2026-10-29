require('../testkit/safeEnv');

/**
 * The support queue as the admin panel reaches it: who may see it, who may
 * act on it, and what each action records and announces.
 *
 * Answering a report speaks for Splix and reaches a phone, so write access is
 * checked on every mutating route separately, and whether the reporter is
 * told is checked for every action, not only the ones that should tell them.
 *
 * No database: the admin is looked up through a mocked User.findById, the
 * report is a real (unsaved) document whose save is stubbed, and the
 * notification service is replaced so no push is sent.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const env = require('../src/config/env');
require('../testkit/safeEnv').assertSafe(env);
const app = require('../src/app');
const User = require('../src/models/User');
const SupportReport = require('../src/models/SupportReport');
const notificationService = require('../src/services/notification.service');
const { ROLES, PERMISSIONS, MODULE_LIST } = require('../src/config/permissions');

const ADMIN = '65a000000000000000000001';
const REPORTER = '65a000000000000000000010';
const REPORT = '65b000000000000000000001';
const BASE = '/api/v1/admin/support';

const admin = (permissions = {}, overrides = {}) => ({
  _id: ADMIN,
  name: 'Test Admin',
  email: 'admin@example.com',
  role: ROLES.ADMIN,
  isActive: true,
  ...overrides,
  permissions: new Map(Object.entries(permissions)),
});

// A stand-in for a Mongoose query: every builder method returns the same
// object, and awaiting it yields `result`.
const query = (result) => {
  const q = {};
  for (const name of ['sort', 'skip', 'limit', 'populate', 'select', 'lean']) q[name] = () => q;
  q.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return q;
};

// A report as the mutations find it: a document that remembers whether it was
// saved, with the reporter's id in place of a populated person.
const freshReport = (fields = {}) => {
  const report = new SupportReport({
    _id: REPORT,
    user: REPORTER,
    category: 'bug',
    subject: 'Expense total is wrong',
    message: 'After splitting a bill three ways the group shows a different total.',
    status: 'open',
    ...fields,
  });
  report.saved = 0;
  report.save = async () => {
    report.saved += 1;
    return report;
  };
  return report;
};

// Signs in as `user` and serves the app with `report` in the database.
// `people` is who a search for a reporter's name or email finds.
const serveAs = async (t, user, report, run, { people = [] } = {}) => {
  t.mock.method(User, 'findById', async () => user);
  t.mock.method(User, 'find', () => query(people));
  t.mock.method(SupportReport, 'findById', () => query(report));
  t.mock.method(SupportReport, 'find', () => query([report]));
  t.mock.method(SupportReport, 'countDocuments', async () => 1);
  const told = t.mock.method(notificationService, 'notifyUser', async () => {});

  const token = jwt.sign({ sub: ADMIN, scope: 'admin' }, env.jwtSecret, { expiresIn: '5m' });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((done) => server.once('listening', done));
  const call = async (method, path, body) => {
    const res = await fetch(`http://127.0.0.1:${server.address().port}${BASE}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };
  try {
    await run(call, told);
  } finally {
    await new Promise((done) => server.close(done));
  }
};

const reader = admin({ [PERMISSIONS.SUPPORT]: 'read' });
const writer = admin({ [PERMISSIONS.SUPPORT]: 'read_write' });

test('support is a module of its own in the permission matrix', () => {
  assert.ok(MODULE_LIST.includes(PERMISSIONS.SUPPORT));
});

test('an admin without the module sees nothing of it', async (t) => {
  const everythingElse = admin({
    [PERMISSIONS.USER_MANAGEMENT]: 'read_write',
    [PERMISSIONS.EMAIL_TEMPLATE]: 'read_write',
  });
  await serveAs(t, everythingElse, freshReport(), async (call) => {
    for (const [method, path, body] of [
      ['GET', '/summary'],
      ['GET', '/reports'],
      ['GET', `/reports/${REPORT}`],
      ['PATCH', `/reports/${REPORT}/status`, { status: 'resolved' }],
      ['PATCH', `/reports/${REPORT}/priority`, { priority: 'high' }],
      ['POST', `/reports/${REPORT}/replies`, { body: 'Hello' }],
    ]) {
      assert.equal((await call(method, path, body)).status, 403, `${method} ${path}`);
    }
  });
});

test('read access shows the queue, the counts and a report, and changes nothing', async (t) => {
  const report = freshReport({
    priority: 'high',
    events: [{ kind: 'note', body: 'Rounding again?', byName: 'Other Admin' }],
  });
  t.mock.method(SupportReport, 'aggregate', async () => [
    { _id: 'open', count: 2 },
    { _id: 'resolved', count: 1 },
    // A row from before statuses were stored on every report.
    { _id: null, count: 1 },
  ]);

  await serveAs(t, reader, report, async (call, told) => {
    const summary = await call('GET', '/summary');
    assert.equal(summary.status, 200);
    assert.deepEqual(summary.body.data, {
      open: 3,
      in_progress: 0,
      resolved: 1,
      closed: 0,
      pending: 3,
      total: 4,
    });

    const list = await call('GET', '/reports?status=open&category=bug&search=expense');
    assert.equal(list.status, 200);
    assert.equal(list.body.data.total, 1);
    const [row] = list.body.data.reports;
    // The panel's view: the priority and the notes are there.
    assert.equal(row.priority, 'high');
    assert.equal(row.notes, 1);
    assert.equal(row.replies, 0);

    const one = await call('GET', `/reports/${REPORT}`);
    assert.equal(one.status, 200);
    assert.equal(one.body.data.report.events[0].kind, 'note');

    for (const [method, path, body] of [
      ['PATCH', `/reports/${REPORT}/status`, { status: 'resolved' }],
      ['PATCH', `/reports/${REPORT}/priority`, { priority: 'low' }],
      ['POST', `/reports/${REPORT}/replies`, { body: 'Hello' }],
    ]) {
      assert.equal((await call(method, path, body)).status, 403, `${method} ${path}`);
    }
    assert.equal(report.saved, 0);
    assert.equal(told.mock.callCount(), 0);
  });
});

test('the queue is searched by title and by who sent it', async (t) => {
  const people = [{ _id: REPORTER }, { _id: '65a000000000000000000012' }];
  await serveAs(
    t,
    reader,
    freshReport(),
    async (call) => {
      const res = await call('GET', '/reports?search=jane%20(');
      assert.equal(res.status, 200);

      // The people whose name or email matched...
      const [personFilter] = User.find.mock.calls[0].arguments;
      assert.equal(personFilter.$or.length, 2);
      assert.ok(personFilter.$or[0].name instanceof RegExp);
      // ...and then reports by them, or with the words in the title. The "("
      // is an ordinary character here, not an unclosed group.
      const [filter] = SupportReport.find.mock.calls[0].arguments;
      assert.equal(filter.$or.length, 2);
      assert.ok(filter.$or[0].subject.test('Jane ( said'));
      assert.equal(filter.$or[1].user.$in.length, 2);
    },
    { people }
  );
});

test('an unknown status, category or priority is a 400, not an empty page', async (t) => {
  await serveAs(t, writer, freshReport(), async (call) => {
    assert.equal((await call('GET', '/reports?status=done')).status, 400);
    assert.equal((await call('GET', '/reports?category=complaint')).status, 400);
    assert.equal((await call('PATCH', `/reports/${REPORT}/status`, { status: 'done' })).status, 400);
    assert.equal(
      (await call('PATCH', `/reports/${REPORT}/priority`, { priority: 'urgent' })).status,
      400
    );
    assert.equal((await call('POST', `/reports/${REPORT}/replies`, { body: '   ' })).status, 400);
    assert.equal((await call('GET', '/reports/not-an-id')).status, 400);
  });
});

test('a reply goes on the timeline, picks the report up, and tells the reporter', async (t) => {
  const report = freshReport();
  await serveAs(t, writer, report, async (call, told) => {
    const res = await call('POST', `/reports/${REPORT}/replies`, {
      body: 'Thanks, we can see it too. A fix is on its way.',
    });
    assert.equal(res.status, 201);
    assert.equal(report.saved, 1);

    const { report: shown } = res.body.data;
    assert.equal(shown.status, 'in_progress');
    assert.deepEqual(
      shown.events.map((event) => event.kind),
      ['reply', 'status']
    );
    assert.equal(shown.events[0].byName, 'Test Admin');
    assert.equal(String(shown.events[0].by), ADMIN);
    assert.equal(shown.events[1].status, 'in_progress');

    assert.equal(told.mock.callCount(), 1);
    const [notice] = told.mock.calls[0].arguments;
    assert.equal(String(notice.userId), REPORTER);
    assert.equal(notice.type, 'support');
    assert.equal(String(notice.entityId), REPORT);
    assert.match(notice.title, /^Reply to "Expense total is wrong"/);
    assert.match(notice.body, /^Thanks, we can see it too/);
  });
});

test('a note between admins moves nothing and tells nobody', async (t) => {
  const report = freshReport();
  await serveAs(t, writer, report, async (call, told) => {
    const res = await call('POST', `/reports/${REPORT}/replies`, {
      body: 'Same as #42, rounding in the split.',
      internal: true,
    });
    assert.equal(res.status, 201);
    assert.equal(report.saved, 1);
    assert.equal(res.body.data.report.status, 'open');
    assert.deepEqual(
      res.body.data.report.events.map((event) => event.kind),
      ['note']
    );
    assert.equal(told.mock.callCount(), 0);
  });
});

test('a reply to a report that is already being handled leaves its status alone', async (t) => {
  const report = freshReport({ status: 'resolved' });
  await serveAs(t, writer, report, async (call, told) => {
    const res = await call('POST', `/reports/${REPORT}/replies`, { body: 'Shipped in 1.0.1.' });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.report.status, 'resolved');
    assert.deepEqual(
      res.body.data.report.events.map((event) => event.kind),
      ['reply']
    );
    assert.equal(told.mock.callCount(), 1);
  });
});

test('a status the report already has changes nothing; a new one is recorded and announced', async (t) => {
  const report = freshReport();
  await serveAs(t, writer, report, async (call, told) => {
    const same = await call('PATCH', `/reports/${REPORT}/status`, { status: 'open' });
    assert.equal(same.status, 200);
    assert.equal(report.saved, 0);
    assert.equal(told.mock.callCount(), 0);

    const resolved = await call('PATCH', `/reports/${REPORT}/status`, { status: 'resolved' });
    assert.equal(resolved.status, 200);
    assert.equal(report.saved, 1);
    assert.equal(resolved.body.data.report.status, 'resolved');
    assert.deepEqual(resolved.body.data.report.events.map((event) => event.kind), ['status']);
    assert.equal(resolved.body.data.report.events[0].status, 'resolved');

    assert.equal(told.mock.callCount(), 1);
    const [notice] = told.mock.calls[0].arguments;
    assert.equal(notice.type, 'support');
    assert.match(notice.title, /resolved/);
    assert.match(notice.body, /Expense total is wrong/);
    assert.equal(String(notice.entityId), REPORT);
  });
});

test('priority is recorded for the team and the reporter is not told', async (t) => {
  const report = freshReport();
  await serveAs(t, writer, report, async (call, told) => {
    const res = await call('PATCH', `/reports/${REPORT}/priority`, { priority: 'high' });
    assert.equal(res.status, 200);
    assert.equal(report.saved, 1);
    assert.equal(res.body.data.report.priority, 'high');
    assert.deepEqual(res.body.data.report.events.map((event) => event.kind), ['priority']);
    assert.equal(told.mock.callCount(), 0);

    const again = await call('PATCH', `/reports/${REPORT}/priority`, { priority: 'high' });
    assert.equal(again.status, 200);
    assert.equal(report.saved, 1);
  });
});

test('a report that does not exist is a 404 for every action', async (t) => {
  await serveAs(t, writer, null, async (call, told) => {
    assert.equal((await call('GET', `/reports/${REPORT}`)).status, 404);
    assert.equal((await call('PATCH', `/reports/${REPORT}/status`, { status: 'closed' })).status, 404);
    assert.equal((await call('POST', `/reports/${REPORT}/replies`, { body: 'Hi' })).status, 404);
    assert.equal(told.mock.callCount(), 0);
  });
});

test('a super admin needs no permission entry', async (t) => {
  const owner = admin({}, { role: ROLES.SUPER_ADMIN });
  t.mock.method(SupportReport, 'aggregate', async () => []);
  await serveAs(t, owner, freshReport(), async (call) => {
    assert.equal((await call('GET', '/summary')).status, 200);
    assert.equal((await call('GET', '/reports')).status, 200);
    assert.equal((await call('POST', `/reports/${REPORT}/replies`, { body: 'Hi there' })).status, 201);
  });
});
