require('../testkit/safeEnv');

/**
 * The admin panel guards. These are the rules that decide whether a request may
 * touch other people's accounts, so each one is checked against a real Express
 * app rather than by calling the middleware directly.
 *
 * The database is never reached: User.findById is mocked, which is all
 * adminProtect uses.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const env = require('../src/config/env');
require('../testkit/safeEnv').assertSafe(env);
const { errorHandler } = require('../src/middleware/errorHandler');
const User = require('../src/models/User');
const {
  ADMIN_COOKIE,
  adminProtect,
  requirePermission,
  requireSuperAdmin,
  requireAdminCsrfHeader,
} = require('../src/middleware/adminAuth');
const { ROLES, PERMISSIONS, ACCESS_LEVEL, satisfies } = require('../src/config/permissions');

const ID = '65a000000000000000000001';

// Mongoose stores `permissions` as a Map and the middleware reads it with
// .get(), so the stand-in must be a Map too — built after the spread, or the
// overrides would put a plain object back in its place.
const fakeUser = (overrides = {}) => ({
  _id: ID,
  name: 'Test Admin',
  role: ROLES.ADMIN,
  isActive: true,
  ...overrides,
  permissions: new Map(Object.entries(overrides.permissions || {})),
});

const tokenFor = (id = ID, claims = { scope: 'admin' }) =>
  jwt.sign({ sub: id, ...claims }, env.jwtSecret, { expiresIn: '5m' });

// Serves one guarded route and returns a caller for it.
const serve = (middlewares) =>
  new Promise((resolve) => {
    const app = express();
    app.get('/thing', ...middlewares, (_req, res) => res.json({ success: true }));
    app.post('/thing', ...middlewares, (_req, res) => res.json({ success: true }));
    app.use(errorHandler);
    const server = app.listen(0, '127.0.0.1', () => {
      const call = async (method = 'GET', headers = {}) => {
        const res = await fetch(`http://127.0.0.1:${server.address().port}/thing`, {
          method,
          headers,
        });
        return { status: res.status, body: await res.json() };
      };
      resolve({ call, close: () => new Promise((done) => server.close(done)) });
    });
  });

const withServer = async (middlewares, run) => {
  const api = await serve(middlewares);
  try {
    await run(api);
  } finally {
    await api.close();
  }
};

// Stands in for adminProtect where only the later guards are under test.
const asUser = (user) => (req, _res, next) => {
  req.user = user;
  next();
};

test('an unknown access level weighs nothing, so a hand-edited permission denies', () => {
  assert.equal(satisfies(ACCESS_LEVEL.READ_WRITE, ACCESS_LEVEL.READ), true);
  assert.equal(satisfies(ACCESS_LEVEL.READ, ACCESS_LEVEL.READ_WRITE), false);
  assert.equal(satisfies('owner', ACCESS_LEVEL.READ), false);
  assert.equal(satisfies(undefined, ACCESS_LEVEL.READ), false);
});

test('no token at all is refused before anything else runs', async () => {
  await withServer([adminProtect], async (api) => {
    const res = await api.call('GET');
    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
  });
});

test('a mobile app token cannot be replayed against the admin API', async (t) => {
  // Same secret, same account, same signature — only the admin scope is absent,
  // which is exactly the token the app hands out.
  t.mock.method(User, 'findById', async () => fakeUser({ role: ROLES.SUPER_ADMIN }));
  await withServer([adminProtect], async (api) => {
    const res = await api.call('GET', { Authorization: `Bearer ${tokenFor(ID, {})}` });
    assert.equal(res.status, 401);
    assert.match(res.body.message, /not valid for the admin panel/i);
  });
});

test('a plain app account with a scoped token is still refused', async (t) => {
  t.mock.method(User, 'findById', async () => fakeUser({ role: ROLES.USER }));
  await withServer([adminProtect], async (api) => {
    const res = await api.call('GET', { Authorization: `Bearer ${tokenFor()}` });
    assert.equal(res.status, 403);
    assert.match(res.body.message, /not an admin/i);
  });
});

test('suspending an account ends its panel session mid-flight', async (t) => {
  t.mock.method(User, 'findById', async () => fakeUser({ isActive: false }));
  await withServer([adminProtect], async (api) => {
    const res = await api.call('GET', { Authorization: `Bearer ${tokenFor()}` });
    assert.equal(res.status, 403);
    assert.match(res.body.message, /suspended/i);
  });
});

test('the session cookie is accepted, and a damaged one does not throw', async (t) => {
  t.mock.method(User, 'findById', async () => fakeUser());
  await withServer([adminProtect], async (api) => {
    const good = await api.call('GET', { Cookie: `${ADMIN_COOKIE}=${tokenFor()}` });
    assert.equal(good.status, 200);

    // A truncated percent-escape would throw out of decodeURIComponent.
    const damaged = await api.call('GET', { Cookie: `${ADMIN_COOKIE}=%E0%A4%A` });
    assert.equal(damaged.status, 401);
  });
});

test('an expired session answers 401 rather than crashing the request', async (t) => {
  t.mock.method(User, 'findById', async () => fakeUser());
  const expired = jwt.sign({ sub: ID, scope: 'admin' }, env.jwtSecret, { expiresIn: -10 });
  await withServer([adminProtect], async (api) => {
    const res = await api.call('GET', { Authorization: `Bearer ${expired}` });
    assert.equal(res.status, 401);
    assert.match(res.body.message, /invalid or expired/i);
  });
});

test('read access does not grant write access', async () => {
  const reader = asUser(fakeUser({ permissions: { [PERMISSIONS.USER_MANAGEMENT]: 'read' } }));
  const needsWrite = requirePermission(PERMISSIONS.USER_MANAGEMENT, ACCESS_LEVEL.READ_WRITE);
  const needsRead = requirePermission(PERMISSIONS.USER_MANAGEMENT, ACCESS_LEVEL.READ);

  await withServer([reader, needsWrite], async (api) => {
    assert.equal((await api.call('GET')).status, 403);
  });
  await withServer([reader, needsRead], async (api) => {
    assert.equal((await api.call('GET')).status, 200);
  });
});

test('a module the admin holds nothing for is refused', async () => {
  const noGrant = asUser(fakeUser({ permissions: {} }));
  const guard = requirePermission(PERMISSIONS.USER_MANAGEMENT, ACCESS_LEVEL.READ);
  await withServer([noGrant, guard], async (api) => {
    assert.equal((await api.call('GET')).status, 403);
  });
});

test('a super admin bypasses the permission map entirely', async () => {
  const owner = asUser(fakeUser({ role: ROLES.SUPER_ADMIN, permissions: {} }));
  const guard = requirePermission(PERMISSIONS.USER_MANAGEMENT, ACCESS_LEVEL.READ_WRITE);
  await withServer([owner, guard], async (api) => {
    assert.equal((await api.call('GET')).status, 200);
  });
  await withServer([owner, requireSuperAdmin], async (api) => {
    assert.equal((await api.call('GET')).status, 200);
  });
});

test('an admin cannot reach a super-admin-only action', async () => {
  const admin = asUser(fakeUser({ permissions: { [PERMISSIONS.USER_MANAGEMENT]: 'read_write' } }));
  await withServer([admin, requireSuperAdmin], async (api) => {
    assert.equal((await api.call('GET')).status, 403);
  });
});

test('a cookie-authenticated write needs the header a forged request cannot set', async () => {
  await withServer([requireAdminCsrfHeader], async (api) => {
    // What a cross-site form post looks like: cookie rides along, no header.
    assert.equal((await api.call('POST')).status, 403);
    assert.equal((await api.call('POST', { 'X-Admin-Request': '1' })).status, 200);
    // Reads are never state-changing, so they are left alone.
    assert.equal((await api.call('GET')).status, 200);
    // A Bearer caller is not a browser and attaches nothing on its own.
    assert.equal((await api.call('POST', { Authorization: 'Bearer x' })).status, 200);
  });
});
