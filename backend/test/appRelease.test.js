require('../testkit/safeEnv');

/**
 * Force update, as the real app serves it: a build below the lowest one an
 * owner still allows is refused on every request with APP_UPDATE_REQUIRED
 * and the link to the new build, anything that names no build is untouched,
 * and an old build can still ask where the new one is.
 *
 * No database: the release settings come from a mocked AppRelease.findOne,
 * and the admin from a mocked User.findById. The settings are cached in
 * memory between requests, so each test starts from an empty cache.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const env = require('../src/config/env');
require('../testkit/safeEnv').assertSafe(env);
const app = require('../src/app');
const User = require('../src/models/User');
const AppRelease = require('../src/models/AppRelease');
const appRelease = require('../src/services/appRelease.service');
const { ROLES, MODULE_LIST } = require('../src/config/permissions');

const ADMIN_ID = '65a000000000000000000001';

const query = (result) => ({ lean: async () => result });

const android = (fields) => ({
  key: 'app',
  android: { minBuild: 0, latestBuild: 0, latestVersion: '', downloadUrl: '', notes: '', ...fields },
  ios: { minBuild: 0, latestBuild: 0, latestVersion: '', downloadUrl: '', notes: '' },
  updatedAt: new Date('2026-10-28T10:00:00.000Z'),
});

const FORCED = android({
  minBuild: 3,
  latestBuild: 4,
  latestVersion: '1.2.0',
  downloadUrl: 'https://files.example.com/splix-1.2.0.apk',
  notes: 'Face Scan and a light theme.',
});

// Serves the app with `settings` in the database (null: never saved).
const serve = async (t, settings, run) => {
  appRelease.resetCache();
  const reads = t.mock.method(AppRelease, 'findOne', () => query(settings));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((done) => server.once('listening', done));
  const call = async (method, path, { headers = {}, body } = {}) => {
    const res = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method,
      headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };
  try {
    await run(call, reads);
  } finally {
    await new Promise((done) => server.close(done));
    appRelease.resetCache();
  }
};

const from = (platform, build) => ({ 'X-App-Platform': platform, 'X-App-Build': String(build) });

// Something behind the gate: refused by its own guard (401) when the gate
// lets it through, so the two answers cannot be confused.
const BEHIND = '/api/v1/auth/me';

test('a request that names no build passes the gate', async (t) => {
  await serve(t, FORCED, async (call, reads) => {
    assert.equal((await call('GET', '/api/v1/health')).status, 200);
    assert.equal((await call('GET', BEHIND)).status, 401);
    // Nothing to compare, so the settings were never even read.
    assert.equal(reads.mock.callCount(), 0);
  });
});

test('a build below the lowest allowed one is refused everywhere with APP_UPDATE_REQUIRED', async (t) => {
  await serve(t, FORCED, async (call) => {
    const res = await call('GET', BEHIND, { headers: from('android', 2) });
    assert.equal(res.status, 426);
    assert.equal(res.body.success, false);
    // The app branches on the code and opens the link: both are part of the contract.
    assert.equal(res.body.code, 'APP_UPDATE_REQUIRED');
    assert.equal(res.body.downloadUrl, FORCED.android.downloadUrl);
    assert.equal(res.body.minBuild, 3);
    assert.equal(res.body.latestBuild, 4);
    assert.equal(res.body.latestVersion, '1.2.0');
    assert.equal(res.body.notes, FORCED.android.notes);
    assert.equal(res.body.build, 2);
    assert.match(res.body.message, /update/i);

    // Signing in is no way around it.
    const login = await call('POST', '/api/v1/auth/login', {
      headers: from('android', 1),
      body: { email: 'jane@example.com', password: 'secret' },
    });
    assert.equal(login.status, 426);
    assert.equal(login.body.code, 'APP_UPDATE_REQUIRED');
  });
});

test('a build at or above the lowest allowed one passes', async (t) => {
  await serve(t, FORCED, async (call) => {
    assert.equal((await call('GET', BEHIND, { headers: from('android', 3) })).status, 401);
    assert.equal((await call('GET', BEHIND, { headers: from('android', 4) })).status, 401);
    assert.equal((await call('GET', BEHIND, { headers: from('android', 99) })).status, 401);
  });
});

test('with nothing ever saved, nobody is forced', async (t) => {
  await serve(t, null, async (call) => {
    assert.equal((await call('GET', BEHIND, { headers: from('android', 1) })).status, 401);
  });
});

test('each platform is judged by its own numbers', async (t) => {
  await serve(t, FORCED, async (call) => {
    // iOS was never given a minimum, so its build 1 is fine.
    assert.equal((await call('GET', BEHIND, { headers: from('ios', 1) })).status, 401);
    assert.equal((await call('GET', BEHIND, { headers: from('android', 1) })).status, 426);
  });
});

test('a header that is not a build number, or an unknown platform, is ignored', async (t) => {
  await serve(t, FORCED, async (call) => {
    for (const build of ['abc', '0', '-1', '1.2', '', '1e3']) {
      const res = await call('GET', BEHIND, { headers: from('android', build) });
      assert.equal(res.status, 401, `build "${build}" should be ignored, got ${res.status}`);
    }
    assert.equal((await call('GET', BEHIND, { headers: from('web', 1) })).status, 401);
    assert.equal((await call('GET', BEHIND, { headers: { 'X-App-Build': '1' } })).status, 401);
  });
});

test('an old build can still ask where the new one is, and is told what it needs', async (t) => {
  await serve(t, FORCED, async (call) => {
    const old = await call('GET', '/api/v1/app/release', { headers: from('android', 2) });
    assert.equal(old.status, 200);
    assert.deepEqual(old.body.data.release, {
      platform: 'android',
      build: 2,
      minBuild: 3,
      latestBuild: 4,
      latestVersion: '1.2.0',
      downloadUrl: FORCED.android.downloadUrl,
      notes: FORCED.android.notes,
      updateRequired: true,
      updateAvailable: true,
    });

    // Allowed in, but not the newest: an update is on offer, not required.
    const behind = await call('GET', '/api/v1/app/release', { headers: from('android', 3) });
    assert.equal(behind.body.data.release.updateRequired, false);
    assert.equal(behind.body.data.release.updateAvailable, true);

    const newest = await call('GET', '/api/v1/app/release', { headers: from('android', 4) });
    assert.equal(newest.body.data.release.updateRequired, false);
    assert.equal(newest.body.data.release.updateAvailable, false);

    // No build named: nothing is required of nobody. The platform can be asked for.
    const anyone = await call('GET', '/api/v1/app/release?platform=ios');
    assert.equal(anyone.status, 200);
    assert.equal(anyone.body.data.release.platform, 'ios');
    assert.equal(anyone.body.data.release.build, null);
    assert.equal(anyone.body.data.release.updateRequired, false);
    assert.equal(anyone.body.data.release.updateAvailable, false);
  });
});

test('the settings are read once and kept, and a change is seen at once', async (t) => {
  await serve(t, android({ minBuild: 0 }), async (call, reads) => {
    for (let i = 0; i < 5; i += 1) {
      assert.equal((await call('GET', BEHIND, { headers: from('android', 1) })).status, 401);
    }
    assert.equal(reads.mock.callCount(), 1);

    // An owner raises the minimum: the next request in this process sees it
    // without waiting for the cache to run out.
    t.mock.method(AppRelease, 'findOneAndUpdate', (_filter, change) =>
      query({
        key: 'app',
        android: { minBuild: change.$set['android.minBuild'], latestBuild: change.$set['android.latestBuild'], latestVersion: '', downloadUrl: change.$set['android.downloadUrl'], notes: '' },
        ios: { minBuild: 0, latestBuild: 0, latestVersion: '', downloadUrl: '', notes: '' },
      })
    );
    t.mock.method(AppRelease, 'findOne', () =>
      query(android({ minBuild: 2, latestBuild: 2, downloadUrl: 'https://files.example.com/new.apk' }))
    );
    await appRelease.updateRelease(
      {
        android: { minBuild: 2, latestBuild: 2, latestVersion: '', downloadUrl: 'https://files.example.com/new.apk', notes: '' },
        ios: { minBuild: 0, latestBuild: 0, latestVersion: '', downloadUrl: '', notes: '' },
      },
      { _id: ADMIN_ID }
    );
    assert.equal((await call('GET', BEHIND, { headers: from('android', 1) })).status, 426);
    assert.equal((await call('GET', BEHIND, { headers: from('android', 2) })).status, 401);
  });
});

test('when the settings cannot be read, the request goes through to whatever it was for', async (t) => {
  appRelease.resetCache();
  t.mock.method(AppRelease, 'findOne', () => ({
    lean: async () => {
      throw new Error('connection lost');
    },
  }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((done) => server.once('listening', done));
  const quiet = t.mock.method(console, 'error', () => {});
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}${BEHIND}`, {
      headers: from('android', 1),
    });
    assert.equal(res.status, 401);
    assert.equal(quiet.mock.callCount(), 1);
  } finally {
    await new Promise((done) => server.close(done));
    appRelease.resetCache();
  }
});

// --- Admin panel --------------------------------------------------------------

const ADMIN_PATH = '/api/v1/admin/app-release';

const admin = (role, permissions = {}) => ({
  _id: ADMIN_ID,
  name: 'Test Admin',
  email: 'admin@example.com',
  role,
  isActive: true,
  permissions: new Map(Object.entries(permissions)),
});

const everyModule = Object.fromEntries(MODULE_LIST.map((key) => [key, 'read_write']));

const asAdmin = (t, user) => {
  t.mock.method(User, 'findById', async () => user);
  const token = jwt.sign({ sub: ADMIN_ID, scope: 'admin' }, env.jwtSecret, { expiresIn: '5m' });
  return { Authorization: `Bearer ${token}`, 'X-Admin-Request': '1' };
};

const VALID = {
  android: {
    minBuild: 2,
    latestBuild: 3,
    latestVersion: '1.1.0',
    downloadUrl: 'https://files.example.com/splix-1.1.0.apk',
    notes: 'Fixes.',
  },
  ios: { minBuild: 0, latestBuild: 0, latestVersion: '', downloadUrl: '', notes: '' },
};

test('the release settings are owners only, even for a co-admin with every module', async (t) => {
  const headers = asAdmin(t, admin(ROLES.ADMIN, everyModule));
  await serve(t, FORCED, async (call) => {
    assert.equal((await call('GET', ADMIN_PATH, { headers })).status, 403);
    assert.equal((await call('PUT', ADMIN_PATH, { headers, body: VALID })).status, 403);
  });
});

test('an owner reads the settings, with the starting values when nothing was saved', async (t) => {
  const headers = asAdmin(t, admin(ROLES.SUPER_ADMIN));
  await serve(t, null, async (call) => {
    const res = await call('GET', ADMIN_PATH, { headers });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data.settings, {
      android: { minBuild: 0, latestBuild: 0, latestVersion: '', downloadUrl: '', notes: '' },
      ios: { minBuild: 0, latestBuild: 0, latestVersion: '', downloadUrl: '', notes: '' },
      updatedAt: null,
    });
  });
});

test('an owner saves the settings, and the gate uses them straight away', async (t) => {
  const headers = asAdmin(t, admin(ROLES.SUPER_ADMIN));
  await serve(t, null, async (call) => {
    let saved = null;
    const write = t.mock.method(AppRelease, 'findOneAndUpdate', (filter, change, options) => {
      assert.deepEqual(filter, { key: 'app' });
      assert.equal(options.upsert, true);
      saved = {
        key: 'app',
        android: {
          minBuild: change.$set['android.minBuild'],
          latestBuild: change.$set['android.latestBuild'],
          latestVersion: change.$set['android.latestVersion'],
          downloadUrl: change.$set['android.downloadUrl'],
          notes: change.$set['android.notes'],
        },
        ios: {
          minBuild: change.$set['ios.minBuild'],
          latestBuild: change.$set['ios.latestBuild'],
          latestVersion: change.$set['ios.latestVersion'],
          downloadUrl: change.$set['ios.downloadUrl'],
          notes: change.$set['ios.notes'],
        },
        updatedBy: change.$set.updatedBy,
        updatedAt: new Date('2026-10-28T12:00:00.000Z'),
      };
      return query(saved);
    });

    const res = await call('PUT', ADMIN_PATH, { headers, body: VALID });
    assert.equal(res.status, 200);
    assert.equal(write.mock.callCount(), 1);
    assert.equal(saved.updatedBy, ADMIN_ID);
    assert.deepEqual(res.body.data.settings.android, VALID.android);
    assert.deepEqual(res.body.data.settings.ios, VALID.ios);
    assert.equal(res.body.data.settings.updatedAt, '2026-10-28T12:00:00.000Z');

    // From now on the database holds what was saved.
    t.mock.method(AppRelease, 'findOne', () => query(saved));
    assert.equal((await call('GET', BEHIND, { headers: from('android', 1) })).status, 426);
    assert.equal((await call('GET', BEHIND, { headers: from('android', 2) })).status, 401);
  });
});

test('settings that would strand people are refused before anything is saved', async (t) => {
  const headers = asAdmin(t, admin(ROLES.SUPER_ADMIN));
  await serve(t, null, async (call) => {
    const write = t.mock.method(AppRelease, 'findOneAndUpdate', () => query(null));
    const attempt = async (android, expected) => {
      const res = await call('PUT', ADMIN_PATH, { headers, body: { ...VALID, android: { ...VALID.android, ...android } } });
      assert.equal(res.status, 400, JSON.stringify(android));
      assert.match(res.body.message, expected);
    };

    // The minimum above the newest build: no build could ever satisfy it.
    await attempt({ minBuild: 4, latestBuild: 3 }, /lowest allowed build/i);
    // Forcing with nowhere to send people.
    await attempt({ minBuild: 2, downloadUrl: '' }, /download link/i);
    // A plain http link would be blocked on the phone.
    await attempt({ downloadUrl: 'http://files.example.com/splix.apk' }, /https/i);
    await attempt({ minBuild: 1.5 }, /whole number/i);
    await attempt({ minBuild: -1 }, /./);
    await attempt({ latestVersion: 'x'.repeat(33) }, /version label/i);

    assert.equal(write.mock.callCount(), 0);
  });
});
