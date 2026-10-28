require('../testkit/safeEnv');

/**
 * The app's name and logo, as the admin panel sets them and the app reads
 * them: what everyone gets with nothing saved, what an owner may change, how
 * an uploaded logo is stored and replaced, and who is allowed to.
 *
 * No database: the branding comes from a mocked Branding model, the admin
 * from a mocked User.findById, and storage is replaced so no file is written.
 * The branding is cached in memory between requests, so each test starts
 * from an empty cache.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const sharp = require('sharp');
const env = require('../src/config/env');
require('../testkit/safeEnv').assertSafe(env);
const app = require('../src/app');
const User = require('../src/models/User');
const Branding = require('../src/models/Branding');
const branding = require('../src/services/branding.service');
const storage = require('../src/storage');
const { ROLES, MODULE_LIST } = require('../src/config/permissions');

const ADMIN_ID = '65a000000000000000000001';
const PUBLIC = '/api/v1/app/branding';
const ADMIN_PATH = '/api/v1/admin/branding';

const query = (result) => {
  const q = {};
  for (const name of ['sort', 'skip', 'limit', 'populate', 'select', 'lean']) q[name] = () => q;
  q.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return q;
};

const admin = (role, permissions = {}) => ({
  _id: ADMIN_ID,
  name: 'Test Admin',
  email: 'admin@example.com',
  role,
  isActive: true,
  permissions: new Map(Object.entries(permissions)),
});

const everyModule = Object.fromEntries(MODULE_LIST.map((key) => [key, 'read_write']));

const SAVED_LOGO = { url: '/uploads/old-logo.png', thumbUrl: '/uploads/old-logo.png', key: 'old-logo.png', provider: 'local' };

const tripMate = (fields = {}) => ({
  key: 'app',
  appName: 'TripMate',
  logo: SAVED_LOGO,
  updatedAt: new Date('2026-10-28T10:00:00.000Z'),
  ...fields,
});

/**
 * Serves the app with `saved` as the branding document (null: never saved)
 * and, when `as` is given, signs that admin in. The mocks record what was
 * written and what storage was asked to do.
 */
const serve = async (t, { saved = null, as = null } = {}, run) => {
  branding.resetCache();
  let current = saved;
  const reads = t.mock.method(Branding, 'findOne', () => query(current));
  const writes = t.mock.method(Branding, 'findOneAndUpdate', (filter, change, options) => {
    assert.deepEqual(filter, { key: 'app' });
    assert.equal(options.upsert, true);
    current = { ...(current ?? { key: 'app', appName: 'Splix', logo: null }), ...change.$set, updatedAt: new Date('2026-10-28T12:00:00.000Z') };
    return query(current);
  });
  const uploads = t.mock.method(storage, 'upload', async (file, options) => ({
    url: `/uploads/new-${file.originalname}`,
    thumbUrl: `/uploads/new-${file.originalname}`,
    key: `${options.folder}/new-${file.originalname}`,
    provider: 'local',
  }));
  const removes = t.mock.method(storage, 'remove', async () => {});

  let headers = {};
  if (as) {
    t.mock.method(User, 'findById', async () => as);
    const token = jwt.sign({ sub: ADMIN_ID, scope: 'admin' }, env.jwtSecret, { expiresIn: '5m' });
    headers = { Authorization: `Bearer ${token}`, 'X-Admin-Request': '1' };
  }

  const server = app.listen(0, '127.0.0.1');
  await new Promise((done) => server.once('listening', done));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, body) => {
    const isForm = body instanceof FormData;
    const res = await fetch(`${origin}${path}`, {
      method,
      headers: { ...headers, ...(isForm || body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined || isForm ? body : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };
  try {
    await run(call, { origin, reads, writes, uploads, removes, saved: () => current });
  } finally {
    await new Promise((done) => server.close(done));
    branding.resetCache();
  }
};

// A real, tiny PNG (4 by 4, transparent), as a browser would upload it.
const tinyPng = () =>
  sharp({ create: { width: 4, height: 4, channels: 4, background: { r: 0, g: 229, b: 160, alpha: 0.5 } } })
    .png()
    .toBuffer();

const formWith = (bytes, type, name = 'logo.png') => {
  const form = new FormData();
  form.append('logo', new Blob([bytes], { type }), name);
  return form;
};

// --- What the app reads -------------------------------------------------------

test('with nothing ever saved, the app is Splix with its own logo', async (t) => {
  await serve(t, {}, async (call, { origin }) => {
    const res = await call('GET', PUBLIC);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data.branding, {
      appName: 'Splix',
      logoUrl: null,
      updatedAt: null,
      // Where invite links point: this server, under /join.
      inviteBaseUrl: `${origin}/join`,
    });
  });
});

test('a saved name and logo reach the app, the logo as a full address', async (t) => {
  await serve(t, { saved: tripMate() }, async (call, { origin, reads }) => {
    const first = await call('GET', PUBLIC);
    assert.equal(first.body.data.branding.appName, 'TripMate');
    assert.equal(first.body.data.branding.logoUrl, `${origin}/uploads/old-logo.png`);
    assert.equal(first.body.data.branding.updatedAt, '2026-10-28T10:00:00.000Z');
    // Read once and kept: every phone asks on every open.
    for (let i = 0; i < 4; i += 1) await call('GET', PUBLIC);
    assert.equal(reads.mock.callCount(), 1);
  });
});

test('a logo already stored at a full address is passed on as it is', async (t) => {
  const inR2 = { ...SAVED_LOGO, url: 'https://media.example.com/splix/branding/logo.png', provider: 'r2' };
  await serve(t, { saved: tripMate({ logo: inR2 }) }, async (call) => {
    assert.equal((await call('GET', PUBLIC)).body.data.branding.logoUrl, inR2.url);
  });
});

// --- Admin panel --------------------------------------------------------------

test('branding is owners only, even for a co-admin with every module', async (t) => {
  await serve(t, { as: admin(ROLES.ADMIN, everyModule) }, async (call, { writes, uploads }) => {
    assert.equal((await call('GET', ADMIN_PATH)).status, 403);
    assert.equal((await call('PUT', ADMIN_PATH, { appName: 'Mine' })).status, 403);
    assert.equal((await call('POST', `${ADMIN_PATH}/logo`, formWith(await tinyPng(), 'image/png'))).status, 403);
    assert.equal((await call('DELETE', `${ADMIN_PATH}/logo`)).status, 403);
    assert.equal(writes.mock.callCount(), 0);
    assert.equal(uploads.mock.callCount(), 0);
  });
});

test('an owner reads the settings, with the starting values when nothing was saved', async (t) => {
  await serve(t, { as: admin(ROLES.SUPER_ADMIN) }, async (call) => {
    const res = await call('GET', ADMIN_PATH);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data.settings, { appName: 'Splix', logoUrl: null, updatedAt: null });
  });
});

test('an owner renames the app, and the app sees the new name at once', async (t) => {
  await serve(t, { as: admin(ROLES.SUPER_ADMIN) }, async (call, { writes }) => {
    assert.equal((await call('GET', PUBLIC)).body.data.branding.appName, 'Splix');
    const res = await call('PUT', ADMIN_PATH, { appName: '  TripMate  ' });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.settings.appName, 'TripMate');
    assert.equal(res.body.data.settings.updatedAt, '2026-10-28T12:00:00.000Z');
    assert.equal(writes.mock.callCount(), 1);
    const change = writes.mock.calls[0].arguments[1].$set;
    assert.equal(change.appName, 'TripMate');
    assert.equal(change.updatedBy, ADMIN_ID);
    // The cache was dropped by the save, not waited out.
    assert.equal((await call('GET', PUBLIC)).body.data.branding.appName, 'TripMate');
  });
});

test('a name that would not fit on the wordmark, or is not one line, is refused', async (t) => {
  await serve(t, { as: admin(ROLES.SUPER_ADMIN) }, async (call, { writes }) => {
    const attempt = async (appName, expected) => {
      const res = await call('PUT', ADMIN_PATH, { appName });
      assert.equal(res.status, 400, JSON.stringify(appName));
      assert.match(res.body.message, expected);
    };
    await attempt('X', /at least 2/);
    await attempt('   ', /at least 2/);
    await attempt('A'.repeat(21), /at most 20/);
    await attempt('Trip\nMate', /single line/);
    await attempt(undefined, /Enter the app name/);
    assert.equal(writes.mock.callCount(), 0);
  });
});

test('an uploaded logo is stored as a small PNG, replaces the old file, and is removed again on request', async (t) => {
  await serve(t, { saved: tripMate(), as: admin(ROLES.SUPER_ADMIN) }, async (call, { origin, uploads, removes, writes }) => {
    // A JPEG that is far bigger than any screen draws a logo.
    const big = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: '#4A8CFF' } }).jpeg().toBuffer();
    const res = await call('POST', `${ADMIN_PATH}/logo`, formWith(big, 'image/jpeg', 'brand.jpg'));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.settings.logoUrl, `${origin}/uploads/new-logo.png`);

    assert.equal(uploads.mock.callCount(), 1);
    const [file, options] = uploads.mock.calls[0].arguments;
    assert.equal(options.folder, 'splix/branding');
    assert.equal(file.mimetype, 'image/png');
    assert.equal(file.originalname, 'logo.png');
    const meta = await sharp(file.buffer).metadata();
    assert.equal(meta.format, 'png');
    assert.equal(meta.width, 512);
    assert.equal(meta.height, 256);

    // The new logo is what was saved; the old file went once it was.
    assert.equal(writes.mock.calls[0].arguments[1].$set.logo.key, 'splix/branding/new-logo.png');
    assert.equal(removes.mock.callCount(), 1);
    assert.deepEqual(removes.mock.calls[0].arguments, ['old-logo.png', 'local']);

    // Back to the built-in mark: the row is cleared and the file goes.
    const cleared = await call('DELETE', `${ADMIN_PATH}/logo`);
    assert.equal(cleared.status, 200);
    assert.equal(cleared.body.data.settings.logoUrl, null);
    assert.equal(cleared.body.data.settings.appName, 'TripMate');
    assert.equal(writes.mock.calls[1].arguments[1].$set.logo, null);
    assert.equal(removes.mock.callCount(), 2);
    assert.deepEqual(removes.mock.calls[1].arguments, ['splix/branding/new-logo.png', 'local']);
    assert.equal((await call('GET', PUBLIC)).body.data.branding.logoUrl, null);
  });
});

test('a small logo is kept at its size, the right way up, with its transparency', async (t) => {
  await serve(t, { as: admin(ROLES.SUPER_ADMIN) }, async (call, { uploads, removes }) => {
    const res = await call('POST', `${ADMIN_PATH}/logo`, formWith(await tinyPng(), 'image/png'));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const meta = await sharp(uploads.mock.calls[0].arguments[0].buffer).metadata();
    assert.equal(meta.width, 4);
    assert.equal(meta.hasAlpha, true);
    // Nothing to replace.
    assert.equal(removes.mock.callCount(), 0);
  });
});

test('anything but a PNG, JPEG or WebP image is refused before it is stored', async (t) => {
  await serve(t, { as: admin(ROLES.SUPER_ADMIN) }, async (call, { uploads, writes }) => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    const refused = await call('POST', `${ADMIN_PATH}/logo`, formWith(svg, 'image/svg+xml', 'logo.svg'));
    assert.equal(refused.status, 400);
    assert.match(refused.body.message, /PNG, JPEG or WebP/);

    // The right label on bytes that are not an image at all.
    const fake = await call('POST', `${ADMIN_PATH}/logo`, formWith(Buffer.from('not an image'), 'image/png'));
    assert.equal(fake.status, 400);
    assert.match(fake.body.message, /could not be read as an image/);

    const none = await call('POST', `${ADMIN_PATH}/logo`, new FormData());
    assert.equal(none.status, 400);
    assert.match(none.body.message, /Choose an image/);

    assert.equal(uploads.mock.callCount(), 0);
    assert.equal(writes.mock.callCount(), 0);
  });
});
