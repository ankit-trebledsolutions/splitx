require('../testkit/safeEnv');

/**
 * Report a Problem and Contact Us, as the real app serves them: what a report
 * must carry, what is refused before anything is stored, how screenshots are
 * handled, and what a person is shown of their own reports.
 *
 * No database: the signed-in person comes from a mocked User.findById, the
 * report queries are mocked, and storage is replaced so no file is written.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const env = require('../src/config/env');
require('../testkit/safeEnv').assertSafe(env);
const app = require('../src/app');
const User = require('../src/models/User');
const SupportReport = require('../src/models/SupportReport');
const storage = require('../src/storage');
const { DAILY_CAP } = require('../src/services/support.service');

const ME = '65a000000000000000000010';
const SOMEONE_ELSE = '65a000000000000000000011';
const REPORT = '65b000000000000000000001';
const BASE = '/api/v1/support';

const person = { _id: ME, name: 'Jane Doe', email: 'jane@example.com', isActive: true, role: 'user' };

// A stand-in for a Mongoose query: every builder method returns the same
// object, and awaiting it yields `result`.
const query = (result) => {
  const q = {};
  for (const name of ['sort', 'skip', 'limit', 'populate', 'select', 'lean']) q[name] = () => q;
  q.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return q;
};

const stored = (name) => ({
  url: `/uploads/${name}`,
  thumbUrl: `/uploads/${name}`,
  key: name,
  provider: 'local',
});

// Signs in as Jane and serves the app. Nothing is stored or uploaded unless a
// test says so; the mocks hand back what they were given so the response can
// be checked.
const serveAs = async (t, run) => {
  t.mock.method(User, 'findById', async () => person);
  const mocks = {
    count: t.mock.method(SupportReport, 'countDocuments', async () => 0),
    create: t.mock.method(SupportReport, 'create', async (fields) => new SupportReport(fields)),
    upload: t.mock.method(storage, 'upload', async (file) => stored(file.originalname)),
    remove: t.mock.method(storage, 'remove', async () => {}),
  };

  const token = jwt.sign({ sub: ME }, env.jwtSecret, { expiresIn: '5m' });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((done) => server.once('listening', done));
  const call = async (method, path, body) => {
    const isForm = body instanceof FormData;
    const res = await fetch(`http://127.0.0.1:${server.address().port}${BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(isForm || body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined || isForm ? body : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };
  try {
    await run(call, mocks);
  } finally {
    await new Promise((done) => server.close(done));
  }
};

const REPORT_BODY = {
  category: 'bug',
  subject: 'Expense total is wrong',
  message: 'After splitting a 90 rupee bill three ways the group shows 100.',
  platform: 'android',
  model: 'Google Pixel 7',
  osVersion: '14 (API 34)',
  appVersion: '1.0.0',
  build: '12',
};

const png = () => new Blob([Buffer.from('89504e470d0a1a0a', 'hex')], { type: 'image/png' });

const form = (files, fields = REPORT_BODY) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  files.forEach((file, index) => data.append('screenshots', file, `shot-${index}.png`));
  return data;
};

test('a report is stored for the signed-in person, with what the phone said about itself', async (t) => {
  await serveAs(t, async (call, mocks) => {
    const res = await call('POST', '/reports', REPORT_BODY);
    assert.equal(res.status, 201);

    const [fields] = mocks.create.mock.calls[0].arguments;
    assert.equal(String(fields.user), ME);
    assert.equal(fields.category, 'bug');
    assert.deepEqual(fields.device, {
      platform: 'android',
      model: 'Google Pixel 7',
      osVersion: '14 (API 34)',
      appVersion: '1.0.0',
      build: '12',
    });
    assert.deepEqual(fields.attachments, []);

    const { report } = res.body.data;
    assert.equal(report.status, 'open');
    assert.equal(report.subject, 'Expense total is wrong');
    assert.deepEqual(report.events, []);
    // The app's view: no priority, no reporter card, no notes.
    assert.equal('priority' in report, false);
    assert.equal('user' in report, false);
  });
});

test('screenshots go to storage under the reporter, and come back without their keys', async (t) => {
  await serveAs(t, async (call, mocks) => {
    const res = await call('POST', '/reports', form([png(), png()]));
    assert.equal(res.status, 201);

    assert.equal(mocks.upload.mock.callCount(), 2);
    const [file, options] = mocks.upload.mock.calls[0].arguments;
    assert.equal(file.mimetype, 'image/png');
    assert.equal(options.folder, `splix/support/${ME}`);

    const { attachments } = res.body.data.report;
    assert.equal(attachments.length, 2);
    for (const attachment of attachments) {
      assert.equal(attachment.mimeType, 'image/png');
      assert.match(attachment.url, /^\/uploads\/shot-/);
      assert.equal('storageKey' in attachment, false);
    }
    // Stored on the row all the same, for the day the account is deleted.
    const [fields] = mocks.create.mock.calls[0].arguments;
    assert.deepEqual(
      fields.attachments.map((a) => a.storageKey),
      ['shot-0.png', 'shot-1.png']
    );
  });
});

test('a fourth screenshot, or a file that is not an image, is refused and nothing is stored', async (t) => {
  await serveAs(t, async (call, mocks) => {
    const tooMany = await call('POST', '/reports', form([png(), png(), png(), png()]));
    assert.equal(tooMany.status, 400);
    assert.match(tooMany.body.message, /Too many files/);

    const notes = new Blob(['dear support'], { type: 'text/plain' });
    const wrongKind = await call('POST', '/reports', form([notes]));
    assert.equal(wrongKind.status, 400);
    assert.match(wrongKind.body.message, /Only image files/);

    assert.equal(mocks.upload.mock.callCount(), 0);
    assert.equal(mocks.create.mock.callCount(), 0);
  });
});

test('when the report cannot be saved, the screenshots already stored are taken out again', async (t) => {
  await serveAs(t, async (call, mocks) => {
    mocks.create.mock.mockImplementation(async () => {
      throw new Error('database away');
    });
    const res = await call('POST', '/reports', form([png()]));
    assert.equal(res.status, 500);
    assert.equal(mocks.remove.mock.callCount(), 1);
    assert.deepEqual(mocks.remove.mock.calls[0].arguments, ['shot-0.png', 'local']);
  });
});

test(`the ${DAILY_CAP + 1}th report in a day is refused, by name`, async (t) => {
  await serveAs(t, async (call, mocks) => {
    mocks.count.mock.mockImplementation(async () => DAILY_CAP);
    const res = await call('POST', '/reports', REPORT_BODY);
    assert.equal(res.status, 429);
    assert.equal(res.body.code, 'SUPPORT_DAILY_CAP');
    assert.equal(mocks.create.mock.callCount(), 0);

    // The count is of this person's reports in the last day, nobody else's.
    const [filter] = mocks.count.mock.calls[0].arguments;
    assert.equal(String(filter.user), ME);
    assert.ok(filter.createdAt.$gte instanceof Date);
  });
});

test('bad fields are refused before anything is stored', async (t) => {
  await serveAs(t, async (call, mocks) => {
    for (const body of [
      { ...REPORT_BODY, category: undefined },
      { ...REPORT_BODY, category: 'complaint' },
      { ...REPORT_BODY, subject: 'Hi' },
      { ...REPORT_BODY, message: 'Broken.' },
      { ...REPORT_BODY, message: 'x'.repeat(2001) },
      { ...REPORT_BODY, appVersion: 'v'.repeat(41) },
    ]) {
      const res = await call('POST', '/reports', body);
      assert.equal(res.status, 400, JSON.stringify(body).slice(0, 80));
    }
    assert.equal(mocks.create.mock.callCount(), 0);
    assert.equal(mocks.upload.mock.callCount(), 0);
  });
});

test('Contact Us still works, as it did for older builds, and becomes a general report', async (t) => {
  await serveAs(t, async (call, mocks) => {
    const res = await call('POST', '/contact', {
      name: 'Jane Doe',
      email: 'jane@example.com',
      subject: 'Hello',
      message: 'Love the app, one question about currencies.',
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.report.category, 'general');

    const [fields] = mocks.create.mock.calls[0].arguments;
    assert.equal(fields.category, 'general');
    assert.equal(String(fields.user), ME);
    // The reporter is the account, not what was typed into the old form.
    assert.equal('name' in fields, false);
    assert.equal('email' in fields, false);
  });
});

const row = (overrides = {}) => ({
  _id: REPORT,
  user: ME,
  category: 'bug',
  subject: 'Expense total is wrong',
  message: 'Details.',
  status: 'in_progress',
  priority: 'high',
  attachments: [{ url: '/uploads/a.png', thumbUrl: '/uploads/a.png', storageKey: 'a.png' }],
  events: [
    { kind: 'note', body: 'Looks like the rounding bug again', byName: 'Admin' },
    { kind: 'priority', priority: 'high', byName: 'Admin' },
    { kind: 'status', status: 'in_progress', byName: 'Admin' },
    { kind: 'reply', body: 'Thanks, we can see it too. Fix is on its way.', byName: 'Admin' },
  ],
  createdAt: new Date('2026-10-01T10:00:00Z'),
  ...overrides,
});

test('a person sees their own reports, with the replies and not the notes', async (t) => {
  await serveAs(t, async (call) => {
    const find = t.mock.method(SupportReport, 'find', () => query([row()]));
    const list = await call('GET', '/reports');
    assert.equal(list.status, 200);
    assert.equal(String(find.mock.calls[0].arguments[0].user), ME);

    const [report] = list.body.data.reports;
    assert.deepEqual(
      report.events.map((event) => event.kind),
      ['status', 'reply']
    );
    assert.equal('priority' in report, false);
    assert.equal('storageKey' in report.attachments[0], false);

    t.mock.method(SupportReport, 'findById', () => query(row()));
    const one = await call('GET', `/reports/${REPORT}`);
    assert.equal(one.status, 200);
    assert.equal(one.body.data.report.subject, 'Expense total is wrong');
  });
});

test("somebody else's report is not found, rather than not allowed", async (t) => {
  await serveAs(t, async (call) => {
    t.mock.method(SupportReport, 'findById', () => query(row({ user: SOMEONE_ELSE })));
    const res = await call('GET', `/reports/${REPORT}`);
    assert.equal(res.status, 404);

    const malformed = await call('GET', '/reports/not-an-id');
    assert.equal(malformed.status, 400);
  });
});
