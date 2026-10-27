require('../testkit/safeEnv');

/**
 * Face Scan end to end: the worker fingerprinting uploads through the face
 * service, a scan finding the photos a face is in, the refusals, and faces
 * going with their photos.
 *
 * Runs against a local MongoDB (safeEnv's splix_test database, whose
 * collections are emptied first) and the fake face service
 * (scripts/fake-face.js), which answers with whatever faces the "picture"
 * describes. Every test here is skipped when no MongoDB answers on
 * 127.0.0.1:27017; the other test files need none.
 *
 * The tests build on one another in order: the worker fills the group, the
 * scans read it, then photos are deleted.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const env = require('../src/config/env');
require('../testkit/safeEnv').assertSafe(env);
const app = require('../src/app');
const User = require('../src/models/User');
const Group = require('../src/models/Group');
const Photo = require('../src/models/Photo');
const Face = require('../src/models/Face');
const Message = require('../src/models/Message');
const storage = require('../src/storage');
const photoService = require('../src/services/photo.service');
const faceScanService = require('../src/services/faceScan.service');
const faceScanWorker = require('../src/services/faceScan.worker');
const fakeFace = require('../scripts/fake-face');

const BASE = '/api/v1/groups';

// People, as the fake service reports them: vectors at right angles never
// match, and STRANGER sits at a similarity of 0.3 to ALICE, under the threshold.
const ALICE = [1, 0, 0];
const BOB = [0, 1, 0];
const STRANGER = [0.3, 0, 0.954];

// What each stored "photo" contains, by its storage key.
const PICTURES = {
  'sunset.jpg': { faces: [] },
  'beach.jpg': { faces: [{ embedding: ALICE }, { embedding: BOB }] },
  'dinner.jpg': { faces: [{ embedding: ALICE }] },
  'old.jpg': { faces: [{ embedding: BOB }] },
};

let fake;
let db = false;
let server;
let alice;
let bob;
let carol;
let group;
let photos = {};

const tokenFor = (user) => jwt.sign({ sub: String(user._id) }, env.jwtSecret, { expiresIn: '5m' });

const call = async (path, { method = 'GET', body, as } = {}) => {
  const res = await fetch(`http://127.0.0.1:${server.address().port}${BASE}${path}`, {
    method,
    body,
    headers: { Authorization: `Bearer ${tokenFor(as)}` },
  });
  return { status: res.status, body: await res.json() };
};

// A "picture" for the scan: the multipart field a phone sends, holding the
// faces the fake service should see in it.
const pictureOf = (faces) => {
  const form = new FormData();
  form.append('photo', new Blob([JSON.stringify({ faces })], { type: 'image/jpeg' }), 'selfie.jpg');
  return form;
};

const addPhoto = (key, extra = {}) =>
  Photo.create({
    group: group._id,
    emoji: '📷',
    imageUrl: `/uploads/${key}`,
    thumbUrl: `/uploads/${key}`,
    storageProvider: 'local',
    storageKey: key,
    uploadedBy: alice._id,
    ...extra,
  });

const ids = (matches) => new Set(matches.map((m) => m.photo._id));

test.before(async () => {
  fake = await fakeFace.start();
  env.faceScan.serviceUrl = fake.url;
  try {
    await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 2000 });
    db = true;
  } catch (err) {
    console.log(`faceScan tests skipped: no MongoDB at ${env.mongoUri} (${err.message})`);
    return;
  }
  await Promise.all([User, Group, Photo, Face, Message].map((Model) => Model.deleteMany({})));
  [alice, bob, carol] = await User.create([
    { name: 'Alice', email: 'alice@example.test', password: 'Passw0rd!x' },
    { name: 'Bob', email: 'bob@example.test', password: 'Passw0rd!x' },
    { name: 'Carol', email: 'carol@example.test', password: 'Passw0rd!x' },
  ]);
  group = await Group.create({
    name: 'Goa trip',
    createdBy: alice._id,
    admin: alice._id,
    members: [alice._id, bob._id],
  });
  // Oldest first, so "newest first" has something to be checked against.
  photos.sunset = await addPhoto('sunset.jpg');
  photos.beach = await addPhoto('beach.jpg');
  photos.dinner = await addPhoto('dinner.jpg');
  photos.video = await addPhoto('clip.mp4', { mediaType: 'video', faceScan: { status: 'skipped' } });
  // A row from before Face Scan existed: no faceScan field at all.
  const old = await Photo.collection.insertOne({
    group: group._id,
    emoji: '📷',
    imageUrl: '/uploads/old.jpg',
    thumbUrl: '/uploads/old.jpg',
    storageProvider: 'local',
    storageKey: 'old.jpg',
    uploadedBy: alice._id,
    mediaType: 'image',
    taggedMembers: [],
    createdAt: new Date(Date.now() - 86400000),
    updatedAt: new Date(Date.now() - 86400000),
  });
  photos.old = { _id: old.insertedId };
  server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
});

test.after(async () => {
  server?.close();
  await fake.close();
  if (db) await mongoose.disconnect();
});

const withDb = (name, run) =>
  test(name, async (t) => {
    if (!db) {
      t.skip('no MongoDB on 127.0.0.1:27017');
      return;
    }
    await run(t);
  });

test('a fingerprint survives the trip through a Buffer, and only like compares with like', () => {
  const vector = faceScanService.toVector(faceScanService.toBuffer(STRANGER));
  assert.equal(vector.length, 3);
  assert.ok(Math.abs(vector[0] - 0.3) < 1e-6 && Math.abs(vector[2] - 0.954) < 1e-6);
  assert.ok(Math.abs(faceScanService.similarity(Float32Array.from(ALICE), vector) - 0.3) < 1e-6);
  assert.equal(faceScanService.similarity(Float32Array.from(ALICE), Float32Array.from([1, 0])), -1);
  assert.equal(faceScanService.toVector(Buffer.from([1, 2, 3])), null);
});

withDb('the worker adopts old rows and fingerprints every waiting image, newest first', async (t) => {
  t.mock.method(storage, 'read', async (key, provider) => {
    assert.equal(provider, 'local');
    return Buffer.from(JSON.stringify(PICTURES[key]));
  });

  await faceScanWorker.adoptOld();
  assert.equal((await Photo.findById(photos.old._id)).faceScan.status, 'pending');
  assert.equal((await Photo.findById(photos.video._id)).faceScan.status, 'skipped');

  const outcomes = [];
  for (let i = 0; i < 10; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const outcome = await faceScanWorker.runOnce();
    if (outcome === 'idle') break;
    outcomes.push(outcome);
  }
  assert.deepEqual(outcomes, ['next', 'next', 'next', 'next']);

  // Newest first: dinner, beach, sunset, then the adopted old row. The fake
  // only sees bytes, so the order shows in the size of each "picture".
  const size = (key) => Buffer.byteLength(JSON.stringify(PICTURES[key]));
  assert.deepEqual(
    fake.requests.map((r) => r.bytes),
    ['dinner.jpg', 'beach.jpg', 'sunset.jpg', 'old.jpg'].map(size)
  );
  assert.ok(fake.requests.every((r) => r.det === env.faceScan.indexDetSize));
  assert.ok(fake.requests.every((r) => r.limit === faceScanService.INDEX_MAX_FACES));

  for (const [key, count] of [['beach', 2], ['dinner', 1], ['sunset', 0], ['old', 1]]) {
    // eslint-disable-next-line no-await-in-loop
    const photo = await Photo.findById(photos[key]._id);
    assert.equal(photo.faceScan.status, 'done', key);
    assert.equal(photo.faceScan.faces, count, key);
    assert.equal(photo.faceScan.attempts, 1, key);
    assert.ok(photo.faceScan.scannedAt, key);
    // eslint-disable-next-line no-await-in-loop
    assert.equal(await Face.countDocuments({ photo: photo._id }), count, key);
  }

  // A lean read hands the fingerprint over as the driver's Binary; toVector
  // takes that as well as a Buffer.
  const beachFaces = await Face.find({ photo: photos.beach._id }).lean();
  assert.ok(beachFaces.every((f) => f.model === 'fake'));
  const vectors = beachFaces.map((f) => faceScanService.toVector(f.embedding));
  assert.ok(vectors.every((v) => v && v.length === fakeFace.EMBEDDING_SIZE));
  assert.ok(vectors.some((v) => Math.abs(v[0] - 1) < 1e-6) && vectors.some((v) => Math.abs(v[1] - 1) < 1e-6));
  assert.ok(beachFaces.every((f) => String(f.group) === String(group._id)));
});

withDb('a scan finds the photos the person is in, best match first', async () => {
  fake.requests.length = 0;
  const { status, body } = await call(`/${group._id}/face-scan`, {
    method: 'POST',
    body: pictureOf([{ embedding: ALICE }]),
    as: alice,
  });
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.data.faces.length, 1);
  const [face] = body.data.faces;
  assert.deepEqual(face.box.length, 4);
  assert.deepEqual(ids(face.matches), new Set([String(photos.beach._id), String(photos.dinner._id)]));
  assert.ok(face.matches.every((m) => m.similarity >= 0.999));
  // The photos come as the gallery lists them, uploader and all.
  assert.equal(face.matches[0].photo.uploadedBy.name, 'Alice');
  assert.equal(face.matches[0].photo.storageKey, undefined);
  assert.equal(body.data.pending, 0);
  assert.equal(body.data.threshold, env.faceScan.matchThreshold);
  assert.equal(body.data.width, 1000);
  assert.equal(fake.lastRequest().det, env.faceScan.queryDetSize);
  assert.equal(fake.lastRequest().limit, faceScanService.QUERY_MAX_FACES);
});

withDb('every face in the picture gets its own matches; a stranger gets none', async () => {
  const { status, body } = await call(`/${group._id}/face-scan`, {
    method: 'POST',
    body: pictureOf([{ embedding: BOB }, { embedding: STRANGER }]),
    as: bob,
  });
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.data.faces.length, 2);
  assert.deepEqual(ids(body.data.faces[0].matches), new Set([String(photos.beach._id), String(photos.old._id)]));
  assert.deepEqual(body.data.faces[1].matches, []);
});

withDb('status says whether Face Scan is on and how many photos still wait', async () => {
  const ok = await call(`/${group._id}/face-scan`, { as: alice });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body.data, { enabled: true, pending: 0 });

  await addPhoto('new.jpg');
  const waiting = await call(`/${group._id}/face-scan`, { as: alice });
  assert.equal(waiting.body.data.pending, 1);

  const outsider = await call(`/${group._id}/face-scan`, { as: carol });
  assert.equal(outsider.status, 403);
});

withDb('refusals: nobody in the picture, an unreadable one, an outsider, the service off or down', async () => {
  const nobody = await call(`/${group._id}/face-scan`, { method: 'POST', body: pictureOf([]), as: alice });
  assert.equal(nobody.status, 422);
  assert.equal(nobody.body.code, 'FACE_NOT_FOUND');

  const garbage = new FormData();
  garbage.append('photo', new Blob(['not-an-image at all'], { type: 'image/jpeg' }), 'x.jpg');
  const unreadable = await call(`/${group._id}/face-scan`, { method: 'POST', body: garbage, as: alice });
  assert.equal(unreadable.status, 422);
  assert.equal(unreadable.body.code, 'FACE_SCAN_UNREADABLE');

  const outsider = await call(`/${group._id}/face-scan`, {
    method: 'POST',
    body: pictureOf([{ embedding: ALICE }]),
    as: carol,
  });
  assert.equal(outsider.status, 403);

  const nothing = await call(`/${group._id}/face-scan`, { method: 'POST', body: new FormData(), as: alice });
  assert.equal(nothing.status, 400);

  const was = env.faceScan.serviceUrl;
  try {
    env.faceScan.serviceUrl = '';
    const off = await call(`/${group._id}/face-scan`, {
      method: 'POST',
      body: pictureOf([{ embedding: ALICE }]),
      as: alice,
    });
    assert.equal(off.status, 503);
    assert.equal(off.body.code, 'FACE_SCAN_UNAVAILABLE');
    const status = await call(`/${group._id}/face-scan`, { as: alice });
    assert.equal(status.body.data.enabled, false);

    // Port 9 is "discard": nothing answers there.
    env.faceScan.serviceUrl = 'http://127.0.0.1:9';
    const down = await call(`/${group._id}/face-scan`, {
      method: 'POST',
      body: pictureOf([{ embedding: ALICE }]),
      as: alice,
    });
    assert.equal(down.status, 503);
    assert.equal(down.body.code, 'FACE_SCAN_UNAVAILABLE');
  } finally {
    env.faceScan.serviceUrl = was;
  }
});

withDb('the worker gives an unreachable service time, and gives up on a photo it cannot read', async (t) => {
  // new.jpg from the status test is still waiting. The service is down:
  // the photo goes back in the queue with its attempt handed back.
  const was = env.faceScan.serviceUrl;
  t.mock.method(storage, 'read', async () => Buffer.from('not-an-image for sure'));
  try {
    env.faceScan.serviceUrl = 'http://127.0.0.1:9';
    assert.equal(await faceScanWorker.runOnce(), 'wait');
  } finally {
    env.faceScan.serviceUrl = was;
  }
  const waiting = await Photo.findOne({ storageKey: 'new.jpg' });
  assert.equal(waiting.faceScan.status, 'pending');
  assert.equal(waiting.faceScan.attempts, 0);

  // The service is back but cannot read the file: three tries, then failed.
  for (let attempt = 1; attempt <= faceScanWorker.MAX_ATTEMPTS; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    assert.equal(await faceScanWorker.runOnce(), 'next');
    // eslint-disable-next-line no-await-in-loop
    const photo = await Photo.findOne({ storageKey: 'new.jpg' });
    assert.equal(photo.faceScan.attempts, attempt);
    assert.equal(photo.faceScan.status, attempt < faceScanWorker.MAX_ATTEMPTS ? 'pending' : 'failed');
    assert.match(photo.faceScan.error, /415/);
  }
  assert.equal(await faceScanWorker.runOnce(), 'idle');
});

withDb('deleting a photo takes its faces with it', async () => {
  assert.equal(await Face.countDocuments({ photo: photos.beach._id }), 2);
  await photoService.deletePhoto(photos.beach._id, alice._id);
  assert.equal(await Face.countDocuments({ photo: photos.beach._id }), 0);
  assert.equal(await Face.countDocuments({ photo: photos.dinner._id }), 1);

  const deleted = await photoService.deletePhotos([photos.dinner._id, photos.old._id], alice._id);
  assert.equal(deleted.length, 2);
  assert.equal(await Face.countDocuments({ group: group._id }), 0);
});
