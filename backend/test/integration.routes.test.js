require('../testkit/safeEnv');

/**
 * The Third-Party APIs endpoints as the real app serves them.
 *
 * These hold the keys to every email Splix sends and every file it stores, so
 * they are for owners only: there is no module permission that opens them, and
 * the point of this file is that a co-admin cannot reach one whatever they
 * have been granted.
 *
 * No database and no outside calls: the models and the providers are replaced.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const env = require('../src/config/env');
require('../testkit/safeEnv').assertSafe(env);
const app = require('../src/app');
const User = require('../src/models/User');
const IntegrationSetting = require('../src/models/IntegrationSetting');
const IntegrationChange = require('../src/models/IntegrationChange');
const testers = require('../src/integrations/testers');
const store = require('../src/integrations/store');
const { ROLES, MODULE_LIST } = require('../src/config/permissions');

const ID = '65a000000000000000000001';
const BASE = '/api/v1/admin/integrations';
const PASSWORD = 'the-right-password';
const NEW_KEY = 're_new_key_0123456789abWXYZ';

const account = (role, permissions = {}) => ({
  _id: ID,
  name: 'Test Admin',
  email: 'admin@example.com',
  role,
  isActive: true,
  permissions: new Map(Object.entries(permissions)),
  comparePassword: async (given) => given === PASSWORD,
});

const query = (result) => ({ lean: async () => result });

const serveAs = async (t, user, run) => {
  t.mock.method(console, 'error', () => {});
  // adminProtect awaits the query itself; the service asks for the password too.
  t.mock.method(User, 'findById', () => {
    const found = Promise.resolve(user);
    found.select = async () => user;
    return found;
  });
  t.mock.method(IntegrationSetting, 'find', () => query([]));
  t.mock.method(IntegrationSetting, 'findOne', () => query(null));
  const write = t.mock.method(IntegrationSetting, 'findOneAndUpdate', (filter, change) =>
    query({
      ...filter,
      values: {},
      secrets: { apiKey: change.$set['secrets.apiKey'] },
      hints: { apiKey: change.$set['hints.apiKey'] },
    })
  );
  const remove = t.mock.method(IntegrationSetting, 'findOneAndDelete', () => query(null));
  t.mock.method(IntegrationChange, 'create', async (entry) => entry);
  t.mock.method(IntegrationChange, 'find', () => ({
    sort: () => ({ limit: () => query([]) }),
  }));
  const asked = t.mock.method(testers, 'resend', async () => ({ ok: true, message: 'Resend accepted the key.' }));
  t.after(() => store.apply([]));

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
    await run(call, { write, remove, asked });
  } finally {
    await new Promise((done) => server.close(done));
  }
};

const EVERY_ROUTE = [
  ['GET', '', undefined],
  ['GET', '/changes', undefined],
  ['POST', '/resend/test', { values: { apiKey: NEW_KEY } }],
  ['PUT', '/resend', { values: { apiKey: NEW_KEY }, password: PASSWORD }],
  ['POST', '/resend/reset', { password: PASSWORD }],
];

test('a co-admin cannot reach the keys, whatever they have been granted', async (t) => {
  // Every module there is, at the highest level there is.
  const everything = Object.fromEntries(MODULE_LIST.map((module) => [module, 'read_write']));

  await serveAs(t, account(ROLES.ADMIN, everything), async (call, { write, remove, asked }) => {
    for (const [method, path, body] of EVERY_ROUTE) {
      const res = await call(method, path, body);
      assert.equal(res.status, 403, `${method} ${path}`);
      assert.match(res.body.message, /Only a super admin/, `${method} ${path}`);
    }
    assert.equal(write.mock.callCount(), 0);
    assert.equal(remove.mock.callCount(), 0);
    // Not even shown to the provider.
    assert.equal(asked.mock.callCount(), 0);
  });
});

test('an owner sees every service, its steps and its fields', async (t) => {
  await serveAs(t, account(ROLES.SUPER_ADMIN), async (call) => {
    const res = await call('GET', '');
    assert.equal(res.status, 200);
    assert.deepEqual(
      res.body.data.integrations.map((entry) => entry.name),
      ['Resend', 'OpenAI', 'Cloudinary', 'Stream', 'Google Sign-In']
    );
    assert.equal(res.body.data.canSaveSecrets, true);
    // The checks that make up a field's rules stay on the server.
    assert.ok(!JSON.stringify(res.body).includes('pattern'));

    const changes = await call('GET', '/changes');
    assert.equal(changes.status, 200);
    assert.deepEqual(changes.body.data.changes, []);
  });
});

test('an owner saves a key with their password, and gets back no more than its last four characters', async (t) => {
  await serveAs(t, account(ROLES.SUPER_ADMIN), async (call, { write }) => {
    const res = await call('PUT', '/resend', { values: { apiKey: NEW_KEY }, password: PASSWORD });
    assert.equal(res.status, 200);
    assert.equal(write.mock.callCount(), 1);
    assert.equal(res.body.data.test.ok, true);
    assert.equal(res.body.data.integration.fields.find((f) => f.key === 'apiKey').hint, 'WXYZ');
    assert.ok(!JSON.stringify(res.body).includes(NEW_KEY));
  });
});

test('saving and resetting both need the password', async (t) => {
  await serveAs(t, account(ROLES.SUPER_ADMIN), async (call, { write, remove }) => {
    for (const [method, path, body] of [
      ['PUT', '/resend', { values: { apiKey: NEW_KEY } }],
      ['PUT', '/resend', { values: { apiKey: NEW_KEY }, password: '' }],
      ['POST', '/resend/reset', {}],
    ]) {
      const res = await call(method, path, body);
      assert.equal(res.status, 400, `${method} ${path}`);
      assert.match(res.body.message, /Enter your password/, `${method} ${path}`);
    }

    const wrong = await call('PUT', '/resend', { values: { apiKey: NEW_KEY }, password: 'a-guess' });
    assert.equal(wrong.status, 403);
    assert.equal(wrong.body.code, 'WRONG_PASSWORD');

    assert.equal(write.mock.callCount(), 0);
    assert.equal(remove.mock.callCount(), 0);
  });
});

test('"Test connection" needs no password and stores nothing', async (t) => {
  await serveAs(t, account(ROLES.SUPER_ADMIN), async (call, { write, asked }) => {
    const res = await call('POST', '/resend/test', { values: { apiKey: NEW_KEY, from: 'Splix <hi@splix.app>' } });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data.test, { ok: true, message: 'Resend accepted the key.' });
    assert.deepEqual(asked.mock.calls[0].arguments[0], { apiKey: NEW_KEY, from: 'Splix <hi@splix.app>' });
    assert.equal(write.mock.callCount(), 0);
  });
});

test('only the services that exist can be addressed', async (t) => {
  await serveAs(t, account(ROLES.SUPER_ADMIN), async (call, { write }) => {
    for (const key of ['mailchimp', '__proto__', 'constructor', 'changes']) {
      const res = await call('PUT', `/${key}`, { values: { apiKey: NEW_KEY }, password: PASSWORD });
      assert.equal(res.status, 400, key);
    }
    assert.equal(write.mock.callCount(), 0);
  });
});

test('values that are not text are refused', async (t) => {
  await serveAs(t, account(ROLES.SUPER_ADMIN), async (call, { write, asked }) => {
    for (const values of [{ apiKey: { $ne: null } }, { apiKey: ['a', 'b'] }, { apiKey: 'x'.repeat(501) }, 'a string']) {
      const res = await call('PUT', '/resend', { values, password: PASSWORD });
      assert.equal(res.status, 400, JSON.stringify(values).slice(0, 40));
    }
    assert.equal(write.mock.callCount(), 0);
    assert.equal(asked.mock.callCount(), 0);
  });
});
