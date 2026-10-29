require('../testkit/safeEnv');

/**
 * End-to-end smoke test of the chat cards: everything added to a group shows
 * up in its chat as a card (tasks with who they are for, "Task completed",
 * stays, attractions, gallery photos and videos), and cards follow what they
 * are about when it changes or goes. The real Express app over HTTP and a
 * throwaway local database; socket events and pushes are recorded instead of
 * sent, and uploads land in the local uploads folder (R2 is blanked by
 * testkit/safeEnv.js), from which they are removed again at the end.
 *
 *   npm run smoke:cards                   needs a local mongod on 27017
 *   SMOKE_MONGO_BASE=mongodb://127.0.0.1:27018 npm run smoke:cards
 *
 * A host other than 127.0.0.1 / localhost is refused before anything connects.
 * The database is named splix_cards_smoke_<timestamp> and dropped at the end.
 * Exits 0 only when every case passes.
 */
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');

const DB_PREFIX = 'splix_cards_smoke_';
const MONGO_BASE = (process.env.SMOKE_MONGO_BASE || 'mongodb://127.0.0.1:27017').replace(/\/+$/, '');
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');

const print = console.log.bind(console);

// Set once connected, so even a run that falls over half-way leaves no database behind.
let dropThrowawayDatabase = async () => {};

// Files already in the uploads folder before the run are never touched.
const filesBefore = new Set(fs.existsSync(UPLOAD_DIR) ? fs.readdirSync(UPLOAD_DIR) : []);
const removeOwnUploads = () => {
  if (!fs.existsSync(UPLOAD_DIR)) return [];
  const left = fs.readdirSync(UPLOAD_DIR).filter((name) => !filesBefore.has(name));
  for (const name of left) fs.rmSync(path.join(UPLOAD_DIR, name), { force: true });
  return left;
};

const main = async () => {
  process.env.MONGODB_URI = `${MONGO_BASE}/${DB_PREFIX}${Date.now()}`;

  const env = require('../src/config/env');
  require('../testkit/safeEnv').assertSafe(env);

  const mongoose = require('mongoose');
  const jwt = require('jsonwebtoken');
  const sharp = require('sharp');
  const app = require('../src/app');
  const connectDB = require('../src/config/db');
  const realtime = require('../src/realtime/socket');
  const pushService = require('../src/services/push.service');
  const User = require('../src/models/User');
  const Group = require('../src/models/Group');
  const Task = require('../src/models/Task');
  const Message = require('../src/models/Message');
  const Photo = require('../src/models/Photo');
  const Notification = require('../src/models/Notification');

  await connectDB();
  const dbName = mongoose.connection.name;
  dropThrowawayDatabase = async () => {
    assert.ok(dbName.startsWith(DB_PREFIX), `refusing to drop "${dbName}"`);
    await mongoose.connection.dropDatabase();
  };
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));

  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;

  // ---- Seams ---------------------------------------------------------------

  const events = [];
  realtime.emitToGroup = (groupId, event, payload) => events.push({ room: `group:${groupId}`, event, payload });
  realtime.emitToUser = (userId, event, payload) => events.push({ room: `user:${userId}`, event, payload });
  const emitted = (name) => events.filter((e) => e.event === name);

  const pushes = [];
  pushService.sendToUsers = async (userIds, message, options = {}) => {
    pushes.push({ to: userIds.map(String).sort(), message, silent: Boolean(options.silent) });
  };

  // ---- Fixtures ------------------------------------------------------------

  let userCount = 0;
  const makeUser = (name) => {
    userCount += 1;
    // A Google account: no password, so no slow bcrypt hash per fixture.
    return User.create({ name, email: `cards${userCount}@example.test`, googleId: `cards-${userCount}` });
  };

  // users[0] is the admin.
  const makeGroup = async (fields = {}) => {
    const users = [await makeUser('Asha Rao'), await makeUser('Ben Okafor'), await makeUser('Cara Lind')];
    const group = await Group.create({
      name: 'Tokyo Trip',
      groupType: 'trip',
      createdBy: users[0]._id,
      admin: users[0]._id,
      members: users.map((user) => user._id),
      ...fields,
    });
    return { group, users, asha: users[0], ben: users[1], cara: users[2] };
  };

  const id = (doc) => String(doc._id);
  const ids = (docs) => docs.map(id).sort();
  const tokenOf = (user) => jwt.sign({ sub: id(user) }, env.jwtSecret);

  const call = async (user, method, url, body) => {
    const res = await fetch(`${base}${url}`, {
      method,
      headers: { Authorization: `Bearer ${tokenOf(user)}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };

  // Multipart, the way the app sends files: { field: { buffer, type, name } | string }.
  const upload = async (user, url, fields) => {
    const form = new FormData();
    for (const [name, value] of Object.entries(fields)) {
      if (value === undefined) continue;
      if (typeof value === 'string') form.append(name, value);
      else form.append(name, new Blob([value.buffer], { type: value.type }), value.name);
    }
    const res = await fetch(`${base}${url}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenOf(user)}` },
      body: form,
    });
    return { status: res.status, body: await res.json() };
  };

  const ok = (res, status = 200) =>
    assert.equal(res.status, status, `expected HTTP ${status}, got ${res.status}: ${JSON.stringify(res.body)}`);

  const jpeg = () =>
    sharp({ create: { width: 16, height: 12, channels: 3, background: '#2DD4BF' } }).jpeg().toBuffer();
  const photoFile = async () => ({ buffer: await jpeg(), type: 'image/jpeg', name: 'beach.jpg' });
  const videoFile = () => ({ buffer: Buffer.from('not really an mp4, but a video as far as uploads go'), type: 'video/mp4', name: 'clip.mp4' });

  const uploadPhoto = async (user, group, fields = {}) => {
    const res = await upload(user, `/groups/${id(group)}/photos/upload`, { photo: await photoFile(), ...fields });
    ok(res, 201);
    return res.body.data.photo;
  };

  // What a member sees in the chat, newest last.
  const feed = async (user, group) => {
    const res = await call(user, 'GET', `/groups/${id(group)}/messages`);
    ok(res);
    return res.body.data.messages;
  };
  const cardsOf = async (user, group, type) => (await feed(user, group)).filter((m) => m.type === type);

  const createTask = async (user, group, body) => {
    const res = await call(user, 'POST', `/groups/${id(group)}/tasks`, { title: 'Book the ryokan', ...body });
    ok(res, 201);
    return res.body.data.task;
  };
  const patchTask = async (user, task, body) => {
    const res = await call(user, 'PATCH', `/tasks/${task._id}`, body);
    ok(res);
    return res.body.data.task;
  };

  // ---- Runner --------------------------------------------------------------

  const results = [];
  let currentSection = '';
  const section = (title) => {
    currentSection = title;
    print(`\n${title}`);
  };

  const check = async (name, fn) => {
    events.length = 0;
    pushes.length = 0;
    try {
      await fn();
      results.push({ section: currentSection, name, ok: true });
      print(`  ok    ${name}`);
    } catch (err) {
      results.push({ section: currentSection, name, ok: false });
      print(`  FAIL  ${name}\n        ${String(err.stack || err.message).split('\n').slice(0, 4).join('\n        ')}`);
    }
  };

  // ---- Cases: tasks --------------------------------------------------------

  section('Tasks');

  await check('a task card names who the task is for', async () => {
    const { group, asha, ben } = await makeGroup();
    const task = await createTask(asha, group, { assignees: [id(ben)] });

    const [card] = await cardsOf(ben, group, 'task');
    assert.equal(card.task._id, task._id);
    assert.equal(card.sender.name, 'Asha Rao');
    assert.deepEqual(card.assignees.map((u) => u.name), ['Ben Okafor']);
    assert.equal(emitted('message:new').length, 1);
  });

  await check('a task for nobody in particular says so with an empty list, not a missing one', async () => {
    const { group, asha } = await makeGroup();
    await createTask(asha, group, {});
    const [card] = await cardsOf(asha, group, 'task');
    assert.deepEqual(card.assignees, []);
  });

  await check('completing it posts "Task completed": who it was for and who did it, separately', async () => {
    const { group, asha, ben, cara } = await makeGroup();
    const task = await createTask(asha, group, { assignees: [id(ben)] });
    events.length = 0;
    pushes.length = 0;

    const done = await patchTask(cara, task, { status: 'done' });
    assert.equal(done.status, 'done');
    assert.equal(done.completedBy.name, 'Cara Lind');
    assert.ok(done.completedAt);

    const cards = await cardsOf(asha, group, 'task_done');
    assert.equal(cards.length, 1);
    assert.equal(cards[0].sender.name, 'Cara Lind', 'the sender is who completed it');
    assert.deepEqual(cards[0].assignees.map((u) => u.name), ['Ben Okafor']);
    assert.equal(cards[0].task.title, 'Book the ryokan');
    assert.equal(emitted('message:new').length, 1);
    // Nobody's phone buzzes for it: the card is the update.
    assert.equal(pushes.length, 0);
  });

  await check('saying "done" again changes nothing: one card, same finisher, same time', async () => {
    const { group, asha, ben, cara } = await makeGroup();
    const task = await createTask(asha, group, { assignees: [id(ben)] });
    const first = await patchTask(cara, task, { status: 'done' });
    const again = await patchTask(ben, task, { status: 'done' });

    assert.equal(again.completedBy.name, 'Cara Lind');
    assert.equal(again.completedAt, first.completedAt);
    assert.equal((await cardsOf(asha, group, 'task_done')).length, 1);
  });

  await check('reopening takes the card back and tells open chats; finishing again posts a fresh one', async () => {
    const { group, asha, ben } = await makeGroup();
    const task = await createTask(asha, group, { assignees: [id(ben)] });
    await patchTask(ben, task, { status: 'done' });
    const [card] = await cardsOf(asha, group, 'task_done');
    events.length = 0;

    const reopened = await patchTask(asha, task, { status: 'open' });
    assert.equal(reopened.completedBy, null);
    assert.equal(reopened.completedAt, null);
    assert.equal((await cardsOf(asha, group, 'task_done')).length, 0);
    assert.deepEqual(emitted('message:removed').map((e) => e.payload), [
      { groupId: id(group), messageIds: [card._id] },
    ]);
    // The "Task added" card stays.
    assert.equal((await cardsOf(asha, group, 'task')).length, 1);

    await patchTask(asha, task, { status: 'done' });
    const [fresh] = await cardsOf(asha, group, 'task_done');
    assert.notEqual(fresh._id, card._id);
    assert.equal(fresh.sender.name, 'Asha Rao');
  });

  await check('reassigning a task later does not rewrite what its cards said', async () => {
    const { group, asha, ben, cara } = await makeGroup();
    const task = await createTask(asha, group, { assignees: [id(ben)] });
    await patchTask(asha, task, { assignees: [id(cara)] });

    const [card] = await cardsOf(asha, group, 'task');
    assert.deepEqual(card.assignees.map((u) => u.name), ['Ben Okafor']);
    assert.deepEqual(card.task.assignees.map((u) => u.name), ['Cara Lind']);
  });

  await check('editing anything but the status posts nothing', async () => {
    const { group, asha } = await makeGroup();
    const task = await createTask(asha, group, {});
    events.length = 0;
    await patchTask(asha, task, { title: 'Book the ryokan in Kyoto', status: 'open' });
    assert.equal(events.filter((e) => e.event.startsWith('message:')).length, 0);
    assert.equal(await Message.countDocuments({ group: group._id }), 1);
  });

  await check('deleting the task takes both of its cards with it', async () => {
    const { group, asha, ben } = await makeGroup();
    const task = await createTask(asha, group, { assignees: [id(ben)] });
    await patchTask(ben, task, { status: 'done' });
    events.length = 0;

    ok(await call(asha, 'DELETE', `/tasks/${task._id}`));
    assert.equal(await Message.countDocuments({ task: task._id }), 0);
    const removed = emitted('message:removed');
    assert.equal(removed.length, 1);
    assert.equal(removed[0].payload.messageIds.length, 2);
  });

  // ---- Cases: stays and attractions ----------------------------------------

  section('Stays and attractions');

  await check('a stay is a card that carries the stay, not a system line', async () => {
    const { group, asha, ben } = await makeGroup();
    const res = await call(asha, 'POST', `/groups/${id(group)}/stays`, {
      name: 'Hoshinoya Kyoto',
      checkIn: '2026-12-10T12:00:00.000Z',
      checkOut: '2026-12-13T12:00:00.000Z',
      guests: 3,
      pricePerNight: 420,
    });
    ok(res, 201);

    const messages = await feed(ben, group);
    assert.deepEqual(messages.map((m) => m.type), ['stay']);
    assert.equal(messages[0].stay._id, res.body.data.stay._id);
    assert.equal(messages[0].stay.name, 'Hoshinoya Kyoto');
    assert.equal(messages[0].stay.bookedBy.name, 'Asha Rao');
    // The others are still told, as before.
    assert.equal(await Notification.countDocuments({ group: group._id, type: 'stay' }), 2);
  });

  await check('deleting the stay removes its card', async () => {
    const { group, asha } = await makeGroup();
    const res = await call(asha, 'POST', `/groups/${id(group)}/stays`, {
      name: 'Park Hyatt',
      checkIn: '2026-12-10T12:00:00.000Z',
      checkOut: '2026-12-11T12:00:00.000Z',
      pricePerNight: 600,
    });
    ok(res, 201);
    events.length = 0;
    ok(await call(asha, 'DELETE', `/stays/${res.body.data.stay._id}`));
    assert.equal(await Message.countDocuments({ group: group._id, type: 'stay' }), 0);
    assert.equal(emitted('message:removed').length, 1);
  });

  await check('changing a stay’s status still says so in a line, without another card', async () => {
    const { group, asha } = await makeGroup();
    const res = await call(asha, 'POST', `/groups/${id(group)}/stays`, {
      name: 'Park Hyatt',
      checkIn: '2026-12-10T12:00:00.000Z',
      checkOut: '2026-12-11T12:00:00.000Z',
      pricePerNight: 600,
    });
    ok(await call(asha, 'PATCH', `/stays/${res.body.data.stay._id}`, { status: 'confirmed' }));
    assert.deepEqual((await feed(asha, group)).map((m) => m.type), ['stay', 'system']);
  });

  await check('an attraction is a card that carries it, without who bookmarked it', async () => {
    const { group, asha, ben } = await makeGroup();
    const res = await call(asha, 'POST', `/groups/${id(group)}/attractions`, {
      name: 'Fushimi Inari',
      category: 'Shrine',
      rating: 4.8,
    });
    ok(res, 201);
    ok(await call(ben, 'POST', `/attractions/${res.body.data.attraction._id}/toggle-save`));

    const messages = await feed(ben, group);
    assert.deepEqual(messages.map((m) => m.type), ['attraction']);
    assert.equal(messages[0].attraction.name, 'Fushimi Inari');
    assert.equal(messages[0].attraction.category, 'Shrine');
    assert.equal('savedBy' in messages[0].attraction, false);
  });

  await check('deleting the attraction removes its card', async () => {
    const { group, asha } = await makeGroup();
    const res = await call(asha, 'POST', `/groups/${id(group)}/attractions`, { name: 'Kinkaku-ji' });
    ok(res, 201);
    ok(await call(asha, 'DELETE', `/attractions/${res.body.data.attraction._id}`));
    assert.equal(await Message.countDocuments({ group: group._id }), 0);
  });

  // ---- Cases: gallery ------------------------------------------------------

  section('Gallery');

  await check('photos picked together make one card and one notification', async () => {
    const { group, asha, ben, cara } = await makeGroup();
    const photos = [];
    for (let i = 0; i < 3; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      photos.push(await uploadPhoto(asha, group, { batch: 'pick-1', batchCount: '3' }));
    }

    const cards = await cardsOf(ben, group, 'gallery');
    assert.equal(cards.length, 1);
    assert.deepEqual(ids(cards[0].photos), ids(photos));
    assert.equal(cards[0].photos[0].mediaType, 'image');
    assert.ok(cards[0].photos[0].thumbUrl);
    assert.equal('batch' in cards[0], true);
    assert.equal(emitted('message:new').length, 1);
    assert.equal(emitted('message:updated').length, 2);
    assert.equal(emitted('message:updated')[1].payload.message.photos.length, 3);

    const told = await Notification.find({ group: group._id });
    assert.deepEqual(told.map((n) => String(n.user)).sort(), ids([ben, cara]));
    assert.equal(told[0].title, 'Photos Added');
    assert.equal(told[0].body, 'Asha Rao added 3 photos to the "Tokyo Trip" gallery.');
    assert.equal(pushes.length, 1);
    // No more "added a photo to the gallery" lines.
    assert.equal(await Message.countDocuments({ group: group._id, type: 'system' }), 0);
  });

  await check('a photo sent without a batch (an older app) gets a card of its own', async () => {
    const { group, asha } = await makeGroup();
    await uploadPhoto(asha, group);
    await uploadPhoto(asha, group);
    const cards = await cardsOf(asha, group, 'gallery');
    assert.equal(cards.length, 2);
    assert.equal(cards[0].photos.length, 1);
    const told = await Notification.find({ group: group._id });
    assert.equal(told.length, 4);
    assert.equal(told[0].body, 'Asha Rao added a photo to the "Tokyo Trip" gallery.');
  });

  await check('another pick, or another member with the same key, starts a new card', async () => {
    const { group, asha, ben } = await makeGroup();
    await uploadPhoto(asha, group, { batch: 'pick-1' });
    await uploadPhoto(asha, group, { batch: 'pick-2' });
    await uploadPhoto(ben, group, { batch: 'pick-2' });
    assert.equal((await cardsOf(asha, group, 'gallery')).length, 3);
  });

  await check('a batch key from long ago does not bring an old card back', async () => {
    const { group, asha } = await makeGroup();
    await uploadPhoto(asha, group, { batch: 'pick-old' });
    // Straight to the collection: Mongoose will not let createdAt be rewritten.
    await Message.collection.updateMany(
      { group: group._id },
      { $set: { createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000) } }
    );
    await uploadPhoto(asha, group, { batch: 'pick-old' });
    assert.equal((await cardsOf(asha, group, 'gallery')).length, 2);
  });

  await check('a bad batch key is ignored rather than refused', async () => {
    const { group, asha } = await makeGroup();
    await uploadPhoto(asha, group, { batch: 'no spaces or $igns allowed' });
    await uploadPhoto(asha, group, { batch: 'no spaces or $igns allowed' });
    assert.equal((await cardsOf(asha, group, 'gallery')).length, 2);
  });

  await check('a video goes into the gallery with its poster frame and length', async () => {
    const { group, asha, ben } = await makeGroup();
    const res = await upload(asha, `/groups/${id(group)}/videos/upload`, {
      video: videoFile(),
      poster: { buffer: await jpeg(), type: 'image/jpeg', name: 'poster.jpg' },
      durationMs: '4200.4',
      batch: 'videos-1',
      batchCount: '1',
    });
    ok(res, 201);
    const { photo } = res.body.data;
    assert.equal(photo.mediaType, 'video');
    assert.equal(photo.durationMs, 4200);
    assert.match(photo.imageUrl, /^\/uploads\/.+clip\.mp4$/);
    assert.equal(photo.thumbUrl, `${photo.imageUrl}.thumb.jpg`);
    assert.ok(fs.existsSync(path.join(UPLOAD_DIR, path.basename(photo.thumbUrl))));

    const [card] = await cardsOf(ben, group, 'gallery');
    assert.equal(card.photos[0].mediaType, 'video');
    assert.equal(card.photos[0].durationMs, 4200);
    const [told] = await Notification.find({ group: group._id, user: ben._id });
    assert.equal(told.title, 'Video Added');
    assert.equal(told.body, 'Asha Rao added a video to the "Tokyo Trip" gallery.');
  });

  await check('a video without a poster gets no thumbnail rather than its own address', async () => {
    const { group, asha } = await makeGroup();
    const res = await upload(asha, `/groups/${id(group)}/videos/upload`, { video: videoFile() });
    ok(res, 201);
    assert.equal(res.body.data.photo.thumbUrl, '');
    assert.equal(res.body.data.photo.durationMs, 0);
  });

  await check('a poster frame over the limit is left out, and the video still goes up', async () => {
    const { group, asha } = await makeGroup();
    const { MAX_POSTER_BYTES } = require('../src/middleware/upload');
    const res = await upload(asha, `/groups/${id(group)}/videos/upload`, {
      video: videoFile(),
      poster: { buffer: Buffer.alloc(MAX_POSTER_BYTES + 1), type: 'image/jpeg', name: 'poster.jpg' },
    });
    ok(res, 201);
    assert.equal(res.body.data.photo.thumbUrl, '');
    assert.equal(res.body.data.photo.mediaType, 'video');
  });

  await check('only a video is taken there, and only an image as its poster', async () => {
    const { group, asha } = await makeGroup();
    const asImage = await upload(asha, `/groups/${id(group)}/videos/upload`, { video: await photoFile() });
    assert.equal(asImage.status, 400);
    const badPoster = await upload(asha, `/groups/${id(group)}/videos/upload`, {
      video: videoFile(),
      poster: videoFile(),
    });
    assert.equal(badPoster.status, 400);
    const none = await upload(asha, `/groups/${id(group)}/videos/upload`, { caption: 'nothing attached' });
    assert.equal(none.status, 400);
    assert.equal(await Photo.countDocuments({ group: group._id }), 0);
  });

  await check('someone outside the group cannot add a video, and nothing is kept', async () => {
    const { group } = await makeGroup();
    const outsider = await makeUser('Dev Patel');
    const before = fs.existsSync(UPLOAD_DIR) ? fs.readdirSync(UPLOAD_DIR).length : 0;
    const res = await upload(outsider, `/groups/${id(group)}/videos/upload`, { video: videoFile() });
    assert.ok(res.status === 403 || res.status === 404, `got ${res.status}`);
    assert.equal(fs.existsSync(UPLOAD_DIR) ? fs.readdirSync(UPLOAD_DIR).length : 0, before);
    assert.equal(await Photo.countDocuments({ group: group._id }), 0);
  });

  await check('deleting a photo takes it off its card; deleting the last one takes the card', async () => {
    const { group, asha } = await makeGroup();
    const photos = [];
    for (let i = 0; i < 3; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      photos.push(await uploadPhoto(asha, group, { batch: 'pick-3', batchCount: '3' }));
    }
    const [card] = await cardsOf(asha, group, 'gallery');
    events.length = 0;

    ok(await call(asha, 'DELETE', `/photos/${photos[0]._id}`));
    const [after] = await cardsOf(asha, group, 'gallery');
    assert.deepEqual(ids(after.photos), ids(photos.slice(1)));
    assert.equal(emitted('message:updated').length, 1);
    assert.equal(emitted('message:updated')[0].payload.message.photos.length, 2);

    events.length = 0;
    ok(await call(asha, 'POST', '/photos/bulk-delete', { photoIds: photos.slice(1).map((p) => p._id) }));
    assert.equal((await cardsOf(asha, group, 'gallery')).length, 0);
    assert.deepEqual(emitted('message:removed').map((e) => e.payload), [
      { groupId: id(group), messageIds: [card._id] },
    ]);
    assert.equal(await Photo.countDocuments({ group: group._id }), 0);
  });

  await check('a deleted video takes its poster with it', async () => {
    const { group, asha } = await makeGroup();
    const res = await upload(asha, `/groups/${id(group)}/videos/upload`, {
      video: videoFile(),
      poster: { buffer: await jpeg(), type: 'image/jpeg', name: 'poster.jpg' },
    });
    ok(res, 201);
    const { photo } = res.body.data;
    ok(await call(asha, 'DELETE', `/photos/${photo._id}`));
    assert.equal(fs.existsSync(path.join(UPLOAD_DIR, path.basename(photo.imageUrl))), false);
    assert.equal(fs.existsSync(path.join(UPLOAD_DIR, path.basename(photo.thumbUrl))), false);
  });

  await check('a photo sent in the chat still goes to the gallery quietly, with no card', async () => {
    const { group, asha } = await makeGroup();
    const res = await upload(asha, `/groups/${id(group)}/messages/upload`, { file: await photoFile() });
    ok(res, 201);
    assert.deepEqual((await feed(asha, group)).map((m) => m.type), ['image']);
    assert.equal(await Photo.countDocuments({ group: group._id }), 1);
  });

  // ---- Cases: leaving no trace -----------------------------------------------

  section('Deleting an account');

  await check('a deleted member drops out of task cards and of who completed a task', async () => {
    const { group, asha, ben } = await makeGroup();
    const task = await createTask(asha, group, { assignees: [id(ben), id(asha)] });
    await patchTask(ben, task, { status: 'done' });
    const userDeletion = require('../src/services/userDeletion.service');
    await userDeletion.deleteUser(ben._id);

    assert.equal(await Message.countDocuments({ assignees: ben._id }), 0);
    assert.equal(await Task.countDocuments({ completedBy: ben._id }), 0);
    const [card] = await cardsOf(asha, group, 'task');
    assert.deepEqual(card.assignees.map((u) => u.name), ['Asha Rao']);
  });

  // ---- Teardown ------------------------------------------------------------

  section('Clean-up');

  await new Promise((resolve) => server.close(resolve));

  await check(`throwaway database ${dbName} is dropped`, async () => {
    await dropThrowawayDatabase();
    const { databases } = await mongoose.connection.getClient().db('admin').admin().listDatabases();
    assert.equal(databases.some((db) => db.name === dbName), false);
  });
  await mongoose.disconnect();

  await check('files uploaded by this run are removed', async () => {
    removeOwnUploads();
    const left = fs.existsSync(UPLOAD_DIR) ? fs.readdirSync(UPLOAD_DIR).filter((n) => !filesBefore.has(n)) : [];
    assert.deepEqual(left, []);
  });

  // ---- Summary -------------------------------------------------------------

  print('');
  const sections = [...new Set(results.map((result) => result.section))];
  for (const name of sections) {
    const inSection = results.filter((result) => result.section === name);
    const passed = inSection.filter((result) => result.ok).length;
    print(`${passed === inSection.length ? 'PASS' : 'FAIL'}  ${name} (${passed}/${inSection.length})`);
  }
  const failed = results.filter((result) => !result.ok).length;
  print(`\nSMOKE chat cards: ${results.length - failed} passed, ${failed} failed, ${results.length} cases`);
  return failed;
};

main()
  .then((failed) => process.exit(failed ? 1 : 0))
  .catch(async (err) => {
    console.error(`Smoke test could not run: ${err.stack || err.message}`);
    await dropThrowawayDatabase().catch(() => {});
    removeOwnUploads();
    process.exit(1);
  });
