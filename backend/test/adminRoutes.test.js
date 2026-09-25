require('../testkit/safeEnv');

/**
 * The admin router as the real app mounts it: correct path, guards in front of
 * every endpoint, and the CORS rule that decides which browser origin may hold
 * a session.
 *
 * No database is involved. src/app.js only builds the Express app — connecting
 * is server.js's job — and none of the requests below get past a guard, so none
 * of them reaches a query. That is the point: if any of these ever returns data
 * instead of an error, a guard has gone missing.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const env = require('../src/config/env');
require('../testkit/safeEnv').assertSafe(env);
const app = require('../src/app');

const ADMIN_ORIGIN = 'http://localhost:5173';

const serve = () =>
  new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const base = `http://127.0.0.1:${server.address().port}`;
      resolve({
        call: async (path, init = {}) => {
          const res = await fetch(base + path, init);
          const text = await res.text();
          let body;
          try {
            body = JSON.parse(text);
          } catch {
            body = text;
          }
          return { status: res.status, headers: res.headers, body };
        },
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });

const withApp = async (run) => {
  const api = await serve();
  try {
    await run(api);
  } finally {
    await api.close();
  }
};

test('the admin router is mounted under /api/v1/admin', async () => {
  await withApp(async (api) => {
    // Reached the router and was refused by its guard, rather than falling
    // through to the app's 404 — which is what a wrong mount path would give.
    const guarded = await api.call('/api/v1/admin/users');
    assert.equal(guarded.status, 401);
    assert.equal(guarded.body.success, false);

    // The rest of the API is untouched by any of this.
    const health = await api.call('/api/v1/health');
    assert.equal(health.status, 200);
    assert.equal(health.body.status, 'ok');
  });
});

test('every admin endpoint refuses an anonymous caller', async () => {
  await withApp(async (api) => {
    const attempts = [
      ['GET', '/api/v1/admin/users'],
      ['GET', '/api/v1/admin/users/65a000000000000000000001'],
      ['POST', '/api/v1/admin/users'],
      ['PATCH', '/api/v1/admin/users/65a000000000000000000001'],
      ['PUT', '/api/v1/admin/users/65a000000000000000000001/permissions'],
      ['PATCH', '/api/v1/admin/users/65a000000000000000000001/active'],
      ['DELETE', '/api/v1/admin/users/65a000000000000000000001'],
      ['GET', '/api/v1/admin/auth/me'],
      ['GET', '/api/v1/admin/meta/modules'],
    ];

    for (const [method, path] of attempts) {
      const res = await api.call(path, {
        method,
        // Sent so a 403 here would mean the CSRF check fired first, which would
        // hide whether the session guard is present at all.
        headers: { 'X-Admin-Request': '1' },
      });
      assert.equal(res.status, 401, `${method} ${path} should be 401, got ${res.status}`);
    }
  });
});

test('an anonymous caller cannot tell which admin paths exist', async () => {
  await withApp(async (api) => {
    // The session guard is mounted with router.use, so it runs before routing
    // resolves. A path that exists and one that does not are therefore both
    // 401, and the panel's shape cannot be mapped from outside.
    const real = await api.call('/api/v1/admin/users');
    const fake = await api.call('/api/v1/admin/nope');
    assert.equal(fake.status, 401);
    assert.equal(fake.status, real.status);
    assert.equal(fake.body.message, real.body.message);
    assert.equal(fake.body.success, false);
  });
});

test('only a listed admin origin may carry a session', async () => {
  await withApp(async (api) => {
    const allowed = await api.call('/api/v1/health', { headers: { Origin: ADMIN_ORIGIN } });
    assert.equal(allowed.headers.get('access-control-allow-origin'), ADMIN_ORIGIN);
    assert.equal(allowed.headers.get('access-control-allow-credentials'), 'true');

    // A wildcard cannot be combined with credentials, so an unlisted origin can
    // still read public endpoints but can never attach a cookie to the request.
    const other = await api.call('/api/v1/health', { headers: { Origin: 'http://evil.example' } });
    assert.equal(other.headers.get('access-control-allow-origin'), '*');
    assert.equal(other.headers.get('access-control-allow-credentials'), null);
  });
});

test('the mobile app is unaffected: no Origin, no credentials, still served', async () => {
  await withApp(async (api) => {
    const res = await api.call('/api/v1/health');
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('access-control-allow-credentials'), null);
  });
});
