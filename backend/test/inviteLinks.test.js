require('../testkit/safeEnv');

/**
 * Group invite links, as the real app serves them: the preview the Join
 * screen shows before anyone joins, the page a link opens in a browser on a
 * phone without the app, and the file Android reads to let the app open the
 * links itself.
 *
 * No database: the signed-in person comes from a mocked User.findById, the
 * group from a mocked Group.findOne, and the branding and release settings
 * from their mocked models. Those two are cached in memory between requests,
 * so each test starts from an empty cache.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const env = require('../src/config/env');
require('../testkit/safeEnv').assertSafe(env);
const app = require('../src/app');
const User = require('../src/models/User');
const Group = require('../src/models/Group');
const Branding = require('../src/models/Branding');
const AppRelease = require('../src/models/AppRelease');
const branding = require('../src/services/branding.service');
const appRelease = require('../src/services/appRelease.service');
const { assetLinks } = require('../src/routes/join.routes');

const ME = '65a000000000000000000010';
const ADMIN = '65a000000000000000000011';
const OTHER = '65a000000000000000000012';
const GROUP = '65b000000000000000000001';
const CODE = 'A1B2C3D4';

const me = { _id: ME, name: 'Jane Doe', email: 'jane@example.com', isActive: true, role: 'user' };

// A stand-in for a Mongoose query: every builder method returns the same
// object, and awaiting it yields `result`.
const query = (result) => {
  const q = {};
  for (const name of ['sort', 'skip', 'limit', 'populate', 'select', 'lean']) q[name] = () => q;
  q.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return q;
};

// The group as findOne(...).populate(...).lean() would hand it back.
const goaTrip = (members) => ({
  _id: GROUP,
  name: 'Goa & Co <2026>',
  description: 'Five days by the sea',
  groupType: 'trip',
  location: 'Goa',
  startDate: new Date('2026-12-20T00:00:00.000Z'),
  totalDays: 5,
  inviteCode: CODE,
  createdBy: { _id: ADMIN, name: 'Alex Admin' },
  admin: { _id: ADMIN, name: 'Alex Admin' },
  members,
});

const alexAndSam = [
  { _id: ADMIN, name: 'Alex Admin', avatar: null },
  { _id: OTHER, name: 'Sam Other', avatar: 'https://files.example.com/sam.jpg' },
];

const release = (downloadUrl) => ({
  key: 'app',
  android: { minBuild: 0, latestBuild: 3, latestVersion: '1.2.0', downloadUrl, notes: '' },
  ios: { minBuild: 0, latestBuild: 0, latestVersion: '', downloadUrl: '', notes: '' },
});

// Serves the app with `group` as the only group (null: no group has that
// code), `brand` saved as the branding and `releaseDoc` as the app release.
const serve = async (t, { group = null, brand = null, releaseDoc = null } = {}, run) => {
  branding.resetCache();
  appRelease.resetCache();
  t.mock.method(User, 'findById', async () => me);
  const groupReads = t.mock.method(Group, 'findOne', (filter) =>
    query(group && filter.inviteCode === group.inviteCode ? group : null)
  );
  t.mock.method(Branding, 'findOne', () => query(brand));
  t.mock.method(AppRelease, 'findOne', () => query(releaseDoc));
  const token = jwt.sign({ sub: ME }, env.jwtSecret, { expiresIn: '5m' });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((done) => server.once('listening', done));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, { auth = true } = {}) => {
    const res = await fetch(`${origin}${path}`, {
      headers: auth ? { Authorization: `Bearer ${token}` } : {},
      redirect: 'manual',
    });
    const type = res.headers.get('content-type') || '';
    return {
      status: res.status,
      type,
      headers: res.headers,
      body: type.includes('application/json') ? await res.json() : await res.text(),
    };
  };
  try {
    await run(call, { origin, groupReads });
  } finally {
    await new Promise((done) => server.close(done));
    branding.resetCache();
    appRelease.resetCache();
  }
};

// --- The preview the Join screen shows ----------------------------------------

test('the invite preview names the group, who runs it and who is in it, without joining', async (t) => {
  await serve(t, { group: goaTrip(alexAndSam) }, async (call, { groupReads }) => {
    const res = await call(`/api/v1/groups/invites/${CODE}`);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data.invite, {
      code: CODE,
      group: {
        _id: GROUP,
        name: 'Goa & Co <2026>',
        description: 'Five days by the sea',
        groupType: 'trip',
        location: 'Goa',
        startDate: '2026-12-20T00:00:00.000Z',
        totalDays: 5,
        memberCount: 2,
        members: [
          { _id: ADMIN, name: 'Alex Admin', avatar: null },
          { _id: OTHER, name: 'Sam Other', avatar: 'https://files.example.com/sam.jpg' },
        ],
      },
      invitedBy: { _id: ADMIN, name: 'Alex Admin' },
      alreadyMember: false,
    });
    // Looked up, never written: the only call to the model was the read.
    assert.equal(groupReads.mock.callCount(), 1);
    // The code is matched the way it is stored, whatever case it was typed in.
    assert.equal(groupReads.mock.calls[0].arguments[0].inviteCode, CODE);
    assert.equal((await call(`/api/v1/groups/invites/${CODE.toLowerCase()}`)).status, 200);
  });
});

test('someone already in the group is told so, and only a few members are named', async (t) => {
  const crowd = Array.from({ length: 9 }, (_, i) => ({
    _id: `65c00000000000000000000${i}`,
    name: `Member ${i}`,
    avatar: null,
  }));
  await serve(t, { group: goaTrip([...crowd, { _id: ME, name: 'Jane Doe', avatar: null }]) }, async (call) => {
    const { invite } = (await call(`/api/v1/groups/invites/${CODE}`)).body.data;
    assert.equal(invite.alreadyMember, true);
    assert.equal(invite.group.memberCount, 10);
    assert.equal(invite.group.members.length, 6);
  });
});

test('an unknown code is a 404 the app can branch on, and the preview needs a sign-in', async (t) => {
  await serve(t, { group: goaTrip(alexAndSam) }, async (call) => {
    const missing = await call('/api/v1/groups/invites/ZZZZZZZZ');
    assert.equal(missing.status, 404);
    assert.equal(missing.body.code, 'INVITE_NOT_FOUND');
    assert.equal((await call('/api/v1/groups/invites/ABC')).status, 400);
    assert.equal((await call(`/api/v1/groups/invites/${CODE}`, { auth: false })).status, 401);
  });
});

// --- The page a link opens in a browser --------------------------------------

test('the invite page shows the group, escaped, with a way into the app and to the APK', async (t) => {
  const apk = 'https://files.example.com/splix-1.2.0.apk';
  await serve(t, { group: goaTrip(alexAndSam), releaseDoc: release(apk) }, async (call, { origin }) => {
    const res = await call(`/join/${CODE}`, { auth: false });
    assert.equal(res.status, 200);
    assert.match(res.type, /text\/html/);
    const html = res.body;
    // The group's name as typed, with its markup characters made harmless.
    assert.ok(html.includes('Goa &amp; Co &lt;2026&gt;'), 'group name is escaped');
    assert.ok(!html.includes('<2026>'), 'nothing of the name is left as markup');
    assert.ok(html.includes('Alex Admin invited you'));
    assert.ok(html.includes('2 members · Goa'));
    assert.ok(html.includes('Five days by the sea'));
    // The Android intent link: the app on its Join screen when installed,
    // the APK otherwise. The page's own title names the app by its name.
    assert.ok(
      html.includes(
        `intent://join/${CODE}#Intent;scheme=splix;package=com.splity.app;S.browser_fallback_url=${encodeURIComponent(apk)};end`
      ),
      'intent link'
    );
    assert.ok(html.includes(`href="${apk}"`), 'download link');
    assert.ok(html.includes(`<title>Join “Goa &amp; Co &lt;2026&gt;” on Splix</title>`));
    assert.ok(html.includes(`<b>${CODE}</b>`), 'the code, for typing into the app');
    // Only the page's own script may run, and nothing is cached.
    const csp = res.headers.get('content-security-policy');
    assert.match(csp, /script-src 'nonce-[A-Za-z0-9+/=]+'/);
    assert.match(csp, /default-src 'none'/);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.ok(!html.includes(origin), 'the page does not need to know its own address');
  });
});

test('with no APK link set, the page still opens the app and says how to join by code', async (t) => {
  await serve(t, { group: goaTrip(alexAndSam) }, async (call, { origin }) => {
    const html = (await call(`/join/${CODE}`, { auth: false })).body;
    assert.ok(!html.includes('id="get"'), 'no download button without a link');
    // The intent link falls back to this very page.
    assert.ok(html.includes(`S.browser_fallback_url=${encodeURIComponent(`${origin}/join/${CODE}`)};end`));
    assert.ok(html.includes(`<b>${CODE}</b>`));
  });
});

test('the page carries the admin-set name and logo', async (t) => {
  const brand = { key: 'app', appName: 'TripMate', logo: { url: '/uploads/logo.png', key: 'logo.png', provider: 'local' } };
  await serve(t, { group: goaTrip(alexAndSam), brand }, async (call, { origin }) => {
    const html = (await call(`/join/${CODE}`, { auth: false })).body;
    assert.ok(html.includes('Open in TripMate'));
    assert.ok(html.includes(`<img src="${origin}/uploads/logo.png"`));
    assert.ok(html.includes('on TripMate</title>'));
  });
});

test('an unknown or malformed code gets a 404 page that reflects nothing back', async (t) => {
  await serve(t, { group: goaTrip(alexAndSam) }, async (call, { groupReads }) => {
    const missing = await call('/join/ZZZZZZZZ', { auth: false });
    assert.equal(missing.status, 404);
    assert.match(missing.type, /text\/html/);
    assert.ok(missing.body.includes('This invite isn’t valid'));

    const reads = groupReads.mock.callCount();
    const nasty = await call(`/join/${encodeURIComponent('<script>alert(1)</script>')}`, { auth: false });
    assert.equal(nasty.status, 404);
    assert.ok(!nasty.body.includes('<script>alert'), 'the code is never written into the page');
    // Not even looked up: it cannot be a code.
    assert.equal(groupReads.mock.callCount(), reads);
  });
});

// --- Android App Links -------------------------------------------------------

test('assetlinks.json names the app and the signing certificate, as plain JSON', async (t) => {
  await serve(t, {}, async (call) => {
    const res = await call('/.well-known/assetlinks.json', { auth: false });
    assert.equal(res.status, 200);
    assert.match(res.type, /^application\/json/);
    assert.deepEqual(res.body, [
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: 'com.splity.app',
          sha256_cert_fingerprints: env.android.certFingerprints,
        },
      },
    ]);
    // Unset in tests, so this is the stock debug keystore local builds sign with.
    assert.equal(env.android.certFingerprints.length, 1);
    assert.match(env.android.certFingerprints[0], /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
    assert.deepEqual(assetLinks(), res.body);
  });
});
