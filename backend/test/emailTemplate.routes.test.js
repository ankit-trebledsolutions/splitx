require('../testkit/safeEnv');

/**
 * The email template endpoints as the real app serves them: who may read, who
 * may change, and what is refused before it reaches the service.
 *
 * Editing these changes what every Splix user receives, so write access is
 * checked on each route separately rather than assumed from the first.
 *
 * No database: the admin is looked up through a mocked User.findById, and the
 * template queries are mocked too.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const env = require('../src/config/env');
require('../testkit/safeEnv').assertSafe(env);
const app = require('../src/app');
const User = require('../src/models/User');
const EmailTemplate = require('../src/models/EmailTemplate');
const emailService = require('../src/services/email.service');
const { ROLES, PERMISSIONS, MODULE_LIST } = require('../src/config/permissions');
const { DEFAULTS } = require('../src/emails/defaults');

const ID = '65a000000000000000000001';
const BASE = '/api/v1/admin/email-templates';

const admin = (permissions = {}, overrides = {}) => ({
  _id: ID,
  name: 'Test Admin',
  email: 'admin@example.com',
  role: ROLES.ADMIN,
  isActive: true,
  ...overrides,
  permissions: new Map(Object.entries(permissions)),
});

const query = (result) => ({ lean: async () => result });

// Signs in as `user` and serves the app. Nothing is stored unless a test says so.
const serveAs = async (t, user, run) => {
  t.mock.method(User, 'findById', async () => user);
  t.mock.method(EmailTemplate, 'find', () => query([]));
  t.mock.method(EmailTemplate, 'findOne', () => query(null));
  const write = t.mock.method(EmailTemplate, 'findOneAndUpdate', (filter, change) =>
    query({ ...filter, isActive: true, ...change.$set })
  );

  const token = jwt.sign({ sub: ID, scope: 'admin' }, env.jwtSecret, { expiresIn: '5m' });
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
    await run(call, write);
  } finally {
    await new Promise((done) => server.close(done));
  }
};

const WELCOME = DEFAULTS.welcome.content;

test('email templates are a module of their own in the permission matrix', () => {
  assert.ok(MODULE_LIST.includes(PERMISSIONS.EMAIL_TEMPLATE));
});

test('an admin without the module sees nothing of it', async (t) => {
  await serveAs(t, admin({ [PERMISSIONS.USER_MANAGEMENT]: 'read_write' }), async (call) => {
    assert.equal((await call('GET', '')).status, 403);
    assert.equal((await call('GET', '/welcome')).status, 403);
    assert.equal((await call('POST', '/welcome/preview', {})).status, 403);
    assert.equal((await call('PUT', '/welcome', WELCOME)).status, 403);
  });
});

test('read access shows and previews, and changes nothing', async (t) => {
  const sent = t.mock.method(emailService, 'sendTest', async () => ({ delivered: false }));
  await serveAs(t, admin({ [PERMISSIONS.EMAIL_TEMPLATE]: 'read' }), async (call, write) => {
    const list = await call('GET', '');
    assert.equal(list.status, 200);
    assert.equal(list.body.data.total, 4);

    const one = await call('GET', '/verify_email');
    assert.equal(one.status, 200);
    assert.equal(one.body.data.template.required, true);
    assert.ok(one.body.data.template.blocks.length > 0);

    const preview = await call('POST', '/verify_email/preview', {});
    assert.equal(preview.status, 200);
    assert.match(preview.body.data.html, /482913/);

    for (const [method, path, body] of [
      ['PUT', '/welcome', WELCOME],
      ['PATCH', '/welcome/active', { isActive: false }],
      ['POST', '/welcome/reset', undefined],
      ['POST', '/welcome/test', {}],
    ]) {
      assert.equal((await call(method, path, body)).status, 403, `${method} ${path}`);
    }
    assert.equal(write.mock.callCount(), 0);
    assert.equal(sent.mock.callCount(), 0);
  });
});

test('write access saves an edit', async (t) => {
  await serveAs(t, admin({ [PERMISSIONS.EMAIL_TEMPLATE]: 'read_write' }), async (call, write) => {
    const res = await call('PUT', '/welcome', { ...WELCOME, subject: 'Hello {{first_name}}' });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.template.subject, 'Hello {{first_name}}');
    assert.equal(res.body.data.template.isCustomized, true);
    assert.equal(write.mock.callCount(), 1);
  });
});

test('what is wrong with an edit comes back as a sentence, and nothing is stored', async (t) => {
  await serveAs(t, admin({}, { role: ROLES.SUPER_ADMIN }), async (call, write) => {
    const noCode = await call('PUT', '/verify_email', {
      ...DEFAULTS.verify_email.content,
      body: '<p>Welcome</p>',
    });
    assert.equal(noCode.status, 400);
    assert.match(noCode.body.message, /must contain \{\{code\}\}/);

    const tooLong = await call('PUT', '/welcome', { ...WELCOME, subject: 'x'.repeat(201) });
    assert.equal(tooLong.status, 400);
    assert.match(tooLong.body.message, /subject is too long/);

    const missingPart = await call('PUT', '/welcome', { subject: 'Only a subject' });
    assert.equal(missingPart.status, 400);

    const off = await call('PATCH', '/reset_password/active', { isActive: false });
    assert.equal(off.status, 400);
    assert.match(off.body.message, /cannot be switched off/);

    assert.equal(write.mock.callCount(), 0);
  });
});

test('only the emails that exist can be addressed', async (t) => {
  await serveAs(t, admin({}, { role: ROLES.SUPER_ADMIN }), async (call, write) => {
    for (const key of ['newsletter', '__proto__', 'constructor', '65a000000000000000000001']) {
      const res = await call('PUT', `/${key}`, WELCOME);
      assert.equal(res.status, 400, key);
    }
    assert.equal(write.mock.callCount(), 0);
  });
});

test('a test email goes to the admin who asked, whatever the request says', async (t) => {
  const sent = t.mock.method(emailService, 'sendTest', async () => ({ delivered: true }));
  await serveAs(t, admin({ [PERMISSIONS.EMAIL_TEMPLATE]: 'read_write' }), async (call) => {
    const res = await call('POST', '/welcome/test', {
      to: 'victim@example.com',
      draft: { ...WELCOME, subject: 'Draft for {{first_name}}' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.to, 'admin@example.com');
    assert.equal(res.body.data.delivered, true);

    assert.equal(sent.mock.callCount(), 1);
    const [to, mail] = sent.mock.calls[0].arguments;
    assert.equal(to, 'admin@example.com');
    // The draft in the editor, not the saved version, filled with sample details.
    assert.equal(mail.subject, 'Draft for Alex');
  });
});
