require('../testkit/safeEnv');

/**
 * End-to-end smoke test of reminders as alarms: the real Express app over
 * HTTP and a throwaway local database. Pushes and socket events are recorded
 * instead of sent, so nothing real is touched (see testkit/safeEnv.js).
 *
 *   npm run smoke:reminders                   needs a local mongod on 27017
 *   SMOKE_MONGO_BASE=mongodb://127.0.0.1:27018 npm run smoke:reminders
 *
 * A host other than 127.0.0.1 / localhost is refused before anything connects.
 * The database is named splix_reminder_smoke_<timestamp> and dropped at the end.
 * Exits 0 only when every case passes.
 */
const assert = require('node:assert/strict');

const DB_PREFIX = 'splix_reminder_smoke_';
const MONGO_BASE = (process.env.SMOKE_MONGO_BASE || 'mongodb://127.0.0.1:27017').replace(/\/+$/, '');
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

const print = console.log.bind(console);

// Set once connected, so even a run that falls over half-way leaves no database behind.
let dropThrowawayDatabase = async () => {};

const main = async () => {
  process.env.MONGODB_URI = `${MONGO_BASE}/${DB_PREFIX}${Date.now()}`;

  const env = require('../src/config/env');
  require('../testkit/safeEnv').assertSafe(env);

  const mongoose = require('mongoose');
  const jwt = require('jsonwebtoken');
  const app = require('../src/app');
  const connectDB = require('../src/config/db');
  const realtime = require('../src/realtime/socket');
  const pushService = require('../src/services/push.service');
  const reminderSweep = require('../src/services/reminderSweep.service');
  const User = require('../src/models/User');
  const Group = require('../src/models/Group');
  const Task = require('../src/models/Task');
  const Reminder = require('../src/models/Reminder');
  const Message = require('../src/models/Message');
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

  // Socket events and pushes, recorded instead of sent.
  const events = [];
  realtime.emitToGroup = (groupId, event, payload) => events.push({ room: `group:${groupId}`, event, payload });
  realtime.emitToUser = (userId, event, payload) => events.push({ room: `user:${userId}`, event, payload });

  const pushes = [];
  pushService.sendToUsers = async (userIds, message, options = {}) => {
    pushes.push({ to: userIds.map(String).sort(), message, silent: Boolean(options.silent) });
  };
  // What phones were told about their alarms, and what people were shown.
  const syncs = (action) => pushes.filter((p) => p.silent && p.message.data.action === action);
  const visible = () => pushes.filter((p) => !p.silent);

  // ---- Fixtures ------------------------------------------------------------

  let userCount = 0;
  const makeUser = (name) => {
    userCount += 1;
    // A Google account: no password, so no slow bcrypt hash per fixture.
    return User.create({ name, email: `smoke${userCount}@example.test`, googleId: `smoke-${userCount}` });
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
  const inAnHour = () => new Date(Date.now() + HOUR_MS).toISOString();

  const call = async (user, method, url, body) => {
    const res = await fetch(`${base}${url}`, {
      method,
      headers: {
        Authorization: `Bearer ${jwt.sign({ sub: id(user) }, env.jwtSecret)}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };

  const create = async (user, group, body = {}) => {
    const res = await call(user, 'POST', group ? `/groups/${id(group)}/reminders` : '/reminders', {
      title: 'Flight to Tokyo',
      remindAt: inAnHour(),
      ...body,
    });
    assert.equal(res.status, 201, `expected HTTP 201, got ${res.status}: ${JSON.stringify(res.body)}`);
    return res.body.data.reminder;
  };
  const listGroup = async (user, group) =>
    (await call(user, 'GET', `/groups/${id(group)}/reminders`)).body.data.reminders;
  const listMine = async (user) => (await call(user, 'GET', '/reminders')).body.data.reminders;

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
      print(`  FAIL  ${name}\n        ${String(err.message).split('\n').join('\n        ')}`);
    }
  };

  // ---- Cases ---------------------------------------------------------------

  section('Creating');

  await check('a shared reminder: chat card, the others are told, every phone gets the alarm', async () => {
    const { group, users, asha, ben, cara } = await makeGroup();
    const reminder = await create(asha, group, { subtitle: 'Terminal 3', repeatWeekly: false });

    assert.equal(reminder.scope, 'group');
    assert.equal(reminder.muted, false);
    assert.equal(reminder.rings, true);
    assert.equal(reminder.groupName, 'Tokyo Trip');
    assert.equal(String(reminder.group), id(group));
    assert.equal(reminder.createdBy.name, 'Asha Rao');
    assert.equal('mutedBy' in reminder, false);
    assert.equal('armedBy' in reminder, false);

    assert.equal(await Message.countDocuments({ group: group._id, type: 'reminder', reminder: reminder._id }), 1);
    const told = await Notification.find({ group: group._id, type: 'reminder' });
    assert.deepEqual(told.map((n) => String(n.user)).sort(), ids([ben, cara]));

    assert.equal(visible().length, 1);
    assert.deepEqual(visible()[0].to, ids([ben, cara]));

    assert.equal(syncs('upsert').length, 1);
    assert.deepEqual(syncs('upsert')[0].to, ids(users));
    const sent = syncs('upsert')[0].message.data;
    assert.equal(sent.type, 'reminder-sync');
    assert.equal(sent.reminder._id, reminder._id);
    assert.equal(sent.reminder.title, 'Flight to Tokyo');
    assert.equal(sent.reminder.subtitle, 'Terminal 3');
    assert.equal(sent.reminder.groupName, 'Tokyo Trip');
    assert.equal(new Date(sent.reminder.remindAt).toISOString(), reminder.remindAt);
    assert.equal(visible()[0].message.title, 'Reminder Set');
    // A silent push carries no words: it must never show in the tray.
    assert.equal(syncs('upsert')[0].message.title, undefined);
    assert.equal(syncs('upsert')[0].message.body, undefined);

    assert.deepEqual(events.filter((e) => e.event === 'reminder:changed'), [
      { room: `group:${id(group)}`, event: 'reminder:changed', payload: { groupId: id(group) } },
    ]);
  });

  await check('a "Just me" reminder stays private: no chat card, nobody told, only its owner’s phone', async () => {
    const { group, asha, ben } = await makeGroup();
    const reminder = await create(ben, group, { scope: 'me', title: 'Buy a gift for Asha' });

    assert.equal(reminder.scope, 'me');
    assert.equal(await Message.countDocuments({ group: group._id }), 0);
    assert.equal(await Notification.countDocuments({ group: group._id }), 0);
    assert.deepEqual(visible(), []);
    assert.deepEqual(syncs('upsert').map((p) => p.to), [[id(ben)]]);
    assert.deepEqual(events.map((e) => e.room), [`user:${id(ben)}`]);

    assert.deepEqual((await listGroup(asha, group)).map((r) => r.title), []);
    assert.deepEqual((await listGroup(ben, group)).map((r) => r.title), ['Buy a gift for Asha']);
  });

  await check('a personal reminder needs no group and is seen only by its owner', async () => {
    const { asha, ben } = await makeGroup();
    const reminder = await create(asha, null, { title: 'Renew passport', scope: 'group' });

    assert.equal(reminder.group, null);
    assert.equal(reminder.groupName, null);
    assert.equal(reminder.scope, 'me');
    assert.equal(reminder.rings, true);
    assert.deepEqual(syncs('upsert').map((p) => p.to), [[id(asha)]]);
    assert.equal(await Message.countDocuments({ reminder: reminder._id }), 0);

    assert.deepEqual((await listMine(asha)).map((r) => r.title), ['Renew passport']);
    assert.deepEqual(await listMine(ben), []);
  });

  await check('a time in the past is refused, and so is a task from another group', async () => {
    const { group, asha } = await makeGroup();
    const past = await call(asha, 'POST', `/groups/${id(group)}/reminders`, {
      title: 'Too late',
      remindAt: new Date(Date.now() - HOUR_MS).toISOString(),
    });
    assert.equal(past.status, 400);
    assert.equal(past.body.message, 'Pick a time in the future for the reminder');

    const other = await makeGroup();
    const task = await Task.create({ group: other.group._id, title: 'Elsewhere', createdBy: other.asha._id });
    const foreign = await call(asha, 'POST', `/groups/${id(group)}/reminders`, {
      title: 'Wrong task',
      remindAt: inAnHour(),
      task: id(task),
    });
    assert.equal(foreign.status, 400);
    assert.equal(foreign.body.message, 'That task is not in this group');
    assert.equal(await Reminder.countDocuments({ group: group._id }), 0);
  });

  section('Seeing');

  await check('"my reminders" holds shared, private and personal ones, each with its group name', async () => {
    const { group, asha, ben } = await makeGroup();
    await create(asha, group, { title: 'Shared' });
    await create(asha, group, { title: 'Private', scope: 'me' });
    await create(asha, null, { title: 'Personal' });

    const mine = await listMine(asha);
    assert.deepEqual(mine.map((r) => r.title).sort(), ['Personal', 'Private', 'Shared']);
    assert.equal(mine.find((r) => r.title === 'Shared').groupName, 'Tokyo Trip');
    assert.equal(mine.find((r) => r.title === 'Personal').groupName, null);
    assert.deepEqual((await listMine(ben)).map((r) => r.title), ['Shared']);
  });

  await check('a private reminder’s old chat card is hidden from the others without shortening the page', async () => {
    const { group, asha, ben } = await makeGroup();
    // As it was before the fix: a card in the chat for a "Just me" reminder.
    const secret = await Reminder.create({
      group: group._id,
      title: 'Surprise party',
      remindAt: new Date(Date.now() + HOUR_MS),
      scope: 'me',
      createdBy: ben._id,
    });
    await Message.create({ group: group._id, sender: ben._id, type: 'reminder', text: secret.title, reminder: secret._id });
    for (let i = 0; i < 4; i += 1) {
      await Message.create({ group: group._id, sender: asha._id, type: 'text', text: `Message ${i}` });
    }

    const forAsha = (await call(asha, 'GET', `/groups/${id(group)}/messages?limit=3`)).body.data.messages;
    // Three were asked for and three exist besides the card: a full page.
    assert.equal(forAsha.length, 3);
    const allForAsha = (await call(asha, 'GET', `/groups/${id(group)}/messages`)).body.data.messages;
    assert.equal(allForAsha.some((m) => m.type === 'reminder'), false);
    assert.equal(allForAsha.length, 4);

    const allForBen = (await call(ben, 'GET', `/groups/${id(group)}/messages`)).body.data.messages;
    assert.equal(allForBen.filter((m) => m.type === 'reminder').length, 1);
  });

  await check('a shared reminder’s chat card does not carry who muted it or has it set', async () => {
    const { group, asha, ben } = await makeGroup();
    const reminder = await create(asha, group);
    await call(ben, 'PATCH', `/reminders/${reminder._id}`, { muted: true });
    await call(ben, 'POST', '/reminders/armed', { ids: [reminder._id] });

    const messages = (await call(asha, 'GET', `/groups/${id(group)}/messages`)).body.data.messages;
    const card = messages.find((m) => m.type === 'reminder');
    assert.equal(card.reminder.title, 'Flight to Tokyo');
    assert.equal('mutedBy' in card.reminder, false);
    assert.equal('armedBy' in card.reminder, false);
  });

  section('Changing');

  await check('switching it off for myself leaves it ringing for everyone else', async () => {
    const { group, asha, ben } = await makeGroup();
    const reminder = await create(asha, group);
    pushes.length = 0;

    const off = await call(ben, 'PATCH', `/reminders/${reminder._id}`, { muted: true });
    assert.equal(off.status, 200);
    assert.equal(off.body.data.reminder.muted, true);
    assert.equal(off.body.data.reminder.rings, false);
    assert.equal(off.body.data.reminder.enabled, true);
    // Only Ben's own phones are told, and told to drop it.
    assert.deepEqual(syncs('remove').map((p) => p.to), [[id(ben)]]);
    assert.deepEqual(syncs('upsert'), []);

    const forAsha = (await listGroup(asha, group))[0];
    assert.equal(forAsha.muted, false);
    assert.equal(forAsha.rings, true);

    pushes.length = 0;
    const on = await call(ben, 'PATCH', `/reminders/${reminder._id}`, { muted: false });
    assert.equal(on.body.data.reminder.rings, true);
    assert.deepEqual(syncs('upsert').map((p) => p.to), [[id(ben)]]);
  });

  await check('a new time reaches every phone and starts the confirmations again', async () => {
    const { group, users, asha, ben } = await makeGroup();
    const reminder = await create(asha, group);
    await call(ben, 'POST', '/reminders/armed', { ids: [reminder._id] });
    assert.equal((await Reminder.findById(reminder._id)).armedBy.length, 1);
    pushes.length = 0;

    const later = new Date(Date.now() + 3 * HOUR_MS).toISOString();
    const moved = await call(ben, 'PATCH', `/reminders/${reminder._id}`, { remindAt: later, title: 'Flight moved' });
    assert.equal(moved.status, 200);
    assert.equal(moved.body.data.reminder.remindAt, later);

    const stored = await Reminder.findById(reminder._id);
    assert.deepEqual(stored.armedBy, []);
    assert.equal(stored.firedAt, null);
    assert.deepEqual(syncs('upsert').map((p) => p.to), [ids(users)]);
    assert.equal(syncs('upsert')[0].message.data.reminder.title, 'Flight moved');

    const past = await call(ben, 'PATCH', `/reminders/${reminder._id}`, {
      remindAt: new Date(Date.now() - HOUR_MS).toISOString(),
    });
    assert.equal(past.status, 400);
  });

  await check('only the creator decides who it is for; making it private takes it off the others’ phones', async () => {
    const { group, asha, ben, cara } = await makeGroup();
    const reminder = await create(asha, group);
    pushes.length = 0;

    const refused = await call(ben, 'PATCH', `/reminders/${reminder._id}`, { scope: 'me' });
    assert.equal(refused.status, 403);

    const made = await call(asha, 'PATCH', `/reminders/${reminder._id}`, { scope: 'me' });
    assert.equal(made.status, 200);
    assert.equal(await Message.countDocuments({ reminder: reminder._id }), 0);
    assert.deepEqual(syncs('remove').map((p) => p.to), [ids([ben, cara])]);
    assert.deepEqual(syncs('upsert').map((p) => p.to), [[id(asha)]]);
    assert.deepEqual(await listGroup(ben, group), []);
    // The group is told, so the others' open lists lose it.
    assert.equal(events.some((e) => e.room === `group:${id(group)}` && e.event === 'reminder:changed'), true);

    const hidden = await call(ben, 'PATCH', `/reminders/${reminder._id}`, { muted: true });
    assert.equal(hidden.status, 403);
    assert.equal(hidden.body.message, 'This reminder is private');
  });

  await check('turning it off for everybody takes it off every phone, and back on returns it', async () => {
    const { group, users, asha, ben } = await makeGroup();
    const reminder = await create(asha, group);
    pushes.length = 0;

    const off = await call(ben, 'PATCH', `/reminders/${reminder._id}`, { enabled: false });
    assert.equal(off.body.data.reminder.rings, false);
    assert.deepEqual(syncs('remove').map((p) => p.to), [ids(users)]);

    pushes.length = 0;
    const on = await call(asha, 'PATCH', `/reminders/${reminder._id}`, { enabled: true, muted: false });
    assert.equal(on.body.data.reminder.rings, true);
    assert.deepEqual(syncs('upsert').map((p) => p.to), [ids(users)]);
  });

  await check('the creator or the admin deletes it; phones and the chat lose it too', async () => {
    const { group, users, asha, ben, cara } = await makeGroup();
    const byBen = await create(ben, group, { title: 'Ben’s reminder' });
    pushes.length = 0;

    const refused = await call(cara, 'DELETE', `/reminders/${byBen._id}`);
    assert.equal(refused.status, 403);
    assert.equal(refused.body.message, 'Only the reminder creator can delete it');

    // Asha is the admin.
    const gone = await call(asha, 'DELETE', `/reminders/${byBen._id}`);
    assert.equal(gone.status, 200);
    assert.equal(await Reminder.countDocuments({ _id: byBen._id }), 0);
    assert.equal(await Message.countDocuments({ reminder: byBen._id }), 0);
    assert.deepEqual(syncs('remove').map((p) => p.to), [ids(users)]);
    assert.equal(syncs('remove')[0].message.data.reminderId, byBen._id);

    const again = await call(asha, 'DELETE', `/reminders/${byBen._id}`);
    assert.equal(again.status, 404);
  });

  await check('someone outside the group can neither see nor change its reminders', async () => {
    const { group, asha } = await makeGroup();
    const reminder = await create(asha, group);
    const outsider = await makeUser('Dev Outsider');

    assert.equal((await call(outsider, 'GET', `/groups/${id(group)}/reminders`)).status, 403);
    assert.equal((await call(outsider, 'PATCH', `/reminders/${reminder._id}`, { title: 'Mine now' })).status, 403);
    assert.equal((await call(outsider, 'DELETE', `/reminders/${reminder._id}`)).status, 403);
    assert.deepEqual(await listMine(outsider), []);
  });

  await check('muting a group silences other people’s reminders there, not my own', async () => {
    const { group, asha, ben } = await makeGroup();
    await create(asha, group, { title: 'Set by Asha' });
    await create(ben, group, { title: 'Set by Ben' });
    pushes.length = 0;

    const muted = await call(ben, 'PUT', `/groups/${id(group)}/mute`, { muted: true });
    assert.equal(muted.status, 200, JSON.stringify(muted.body));
    // His phone is told to read the list again.
    assert.deepEqual(syncs('refresh').map((p) => p.to), [[id(ben)]]);

    const list = await listGroup(ben, group);
    assert.equal(list.find((r) => r.title === 'Set by Asha').rings, false);
    assert.equal(list.find((r) => r.title === 'Set by Asha').muted, false);
    assert.equal(list.find((r) => r.title === 'Set by Ben').rings, true);
  });

  section('Phones reporting their alarms');

  await check('a phone can only confirm reminders its owner can see', async () => {
    const { group, asha, ben } = await makeGroup();
    const shared = await create(asha, group);
    const secret = await create(asha, group, { scope: 'me', title: 'Private' });
    const personal = await create(asha, null, { title: 'Personal' });

    const res = await call(ben, 'POST', '/reminders/armed', { ids: [shared._id, secret._id, personal._id] });
    assert.equal(res.status, 200);
    assert.deepEqual(ids((await Reminder.findById(shared._id)).armedBy.map((u) => ({ _id: u }))), [id(ben)]);
    assert.deepEqual((await Reminder.findById(secret._id)).armedBy, []);
    assert.deepEqual((await Reminder.findById(personal._id)).armedBy, []);

    // Twice is still once.
    await call(ben, 'POST', '/reminders/armed', { ids: [shared._id] });
    assert.equal((await Reminder.findById(shared._id)).armedBy.length, 1);

    const bad = await call(ben, 'POST', '/reminders/armed', { ids: ['not-an-id'] });
    assert.equal(bad.status, 400);
  });

  await check('the confirmations go when the phone does: sign-out, a new phone, but not an ordinary app start', async () => {
    const { group, asha, ben } = await makeGroup();
    const reminder = await create(asha, group);
    const armedBy = async () => (await Reminder.findById(reminder._id)).armedBy.map(String);
    const phone = { token: 'ExponentPushToken[smoke-ben-phone]' };

    // Ben's phone registers for pushes, then confirms the alarm.
    assert.equal((await call(ben, 'POST', '/notifications/push-token', phone)).status, 200);
    await call(ben, 'POST', '/reminders/armed', { ids: [reminder._id] });
    assert.deepEqual(await armedBy(), [id(ben)]);

    // The same phone registering again, as it does on every app start: kept.
    await call(ben, 'POST', '/notifications/push-token', phone);
    assert.deepEqual(await armedBy(), [id(ben)]);

    // Signing out: that phone no longer holds the alarm.
    assert.equal((await call(ben, 'DELETE', '/notifications/push-token', phone)).status, 200);
    assert.deepEqual(await armedBy(), []);

    // A different phone signing in starts unconfirmed until it syncs.
    await call(ben, 'POST', '/notifications/push-token', phone);
    await call(ben, 'POST', '/reminders/armed', { ids: [reminder._id] });
    await call(ben, 'POST', '/notifications/push-token', { token: 'ExponentPushToken[smoke-ben-new-phone]' });
    assert.deepEqual(await armedBy(), []);
  });

  section('At reminder time');

  // Straight into the database: the API refuses a time that has already passed.
  const dueReminder = (group, creator, fields = {}) =>
    Reminder.create({
      group: group ? group._id : null,
      title: 'Leave for the airport',
      remindAt: new Date(Date.now() - 20 * 1000),
      scope: group ? 'group' : 'me',
      createdBy: creator._id,
      ...fields,
    });

  await check('everyone it is for gets the in-app entry; only unconfirmed phones get the backup push', async () => {
    const { group, users, asha, ben, cara } = await makeGroup();
    const reminder = await dueReminder(group, asha, { armedBy: [asha._id], mutedBy: [cara._id] });

    assert.equal(await reminderSweep.sweepOnce(), 1);

    const entries = await Notification.find({ group: group._id, type: 'reminder', title: 'Reminder' });
    assert.deepEqual(entries.map((n) => String(n.user)).sort(), ids([asha, ben]));
    assert.equal(entries[0].body, '"Leave for the airport" is due now.');

    assert.deepEqual(visible().map((p) => p.to), [[id(ben)]]);
    assert.equal(visible()[0].message.body, 'Leave for the airport');
    assert.equal(visible()[0].message.data.groupId, id(group));
    assert.notEqual((await Reminder.findById(reminder._id)).firedAt, null);

    // The next pass finds nothing left to do.
    pushes.length = 0;
    assert.equal(await reminderSweep.sweepOnce(), 0);
    assert.deepEqual(pushes, []);
    assert.equal(await Notification.countDocuments({ group: group._id, title: 'Reminder' }), 2);
    assert.equal(users.length, 3);
  });

  await check('a personal reminder reaches only its owner', async () => {
    const { asha } = await makeGroup();
    await dueReminder(null, asha, { title: 'Renew passport' });

    assert.equal(await reminderSweep.sweepOnce(), 1);
    const entries = await Notification.find({ user: asha._id, title: 'Reminder' });
    assert.equal(entries.length, 1);
    assert.equal(entries[0].group, null);
    assert.deepEqual(visible().map((p) => p.to), [[id(asha)]]);
    assert.equal('groupId' in visible()[0].message.data, false);
  });

  await check('reminders from before this feature are closed without a word', async () => {
    const { group, asha } = await makeGroup();
    const old = await dueReminder(group, asha, { remindAt: new Date(Date.now() - 3 * DAY_MS) });
    const off = await dueReminder(group, asha, { enabled: false });

    assert.equal(await reminderSweep.sweepOnce(), 1);
    assert.equal(await Notification.countDocuments({ group: group._id }), 0);
    assert.deepEqual(pushes, []);
    assert.notEqual((await Reminder.findById(old._id)).firedAt, null);
    // Switched off: not the sweep's business until someone turns it on again.
    assert.equal((await Reminder.findById(off._id)).firedAt, null);
  });

  await check('a weekly reminder moves on a week, and stops when the trip is over', async () => {
    const startDate = new Date(Date.now() - 2 * DAY_MS);
    const long = await makeGroup({ startDate, totalDays: 30 });
    const short = await makeGroup({ startDate, totalDays: 4 });
    const repeats = await dueReminder(long.group, long.asha, { repeatWeekly: true });
    const ends = await dueReminder(short.group, short.asha, { repeatWeekly: true });

    assert.equal(await reminderSweep.sweepOnce(), 2);

    const moved = await Reminder.findById(repeats._id);
    assert.equal(moved.remindAt.getTime(), repeats.remindAt.getTime() + WEEK_MS);
    assert.equal(moved.firedAt, null);

    const finished = await Reminder.findById(ends._id);
    assert.equal(finished.remindAt.getTime(), ends.remindAt.getTime());
    assert.notEqual(finished.firedAt, null);

    const shown = (await listGroup(long.asha, long.group))[0];
    assert.equal(new Date(shown.repeatUntil).getTime(), startDate.getTime() + 30 * DAY_MS);
  });

  await check('a one-off that already rang, then made weekly, comes back to the sweep and moves on', async () => {
    const { group, asha } = await makeGroup();
    const reminder = await dueReminder(group, asha);
    assert.equal(await reminderSweep.sweepOnce(), 1);
    assert.notEqual((await Reminder.findById(reminder._id)).firedAt, null);

    const weekly = await call(asha, 'PATCH', `/reminders/${id(reminder)}`, { repeatWeekly: true });
    assert.equal(weekly.status, 200);
    assert.equal((await Reminder.findById(reminder._id)).firedAt, null);

    const entriesBefore = await Notification.countDocuments({ group: group._id, title: 'Reminder' });
    assert.equal(await reminderSweep.sweepOnce(), 1);
    const moved = await Reminder.findById(reminder._id);
    assert.equal(moved.remindAt.getTime(), reminder.remindAt.getTime() + WEEK_MS);
    assert.equal(moved.firedAt, null);
    assert.ok((await Notification.countDocuments({ group: group._id, title: 'Reminder' })) >= entriesBefore);
  });

  section('Leaving and deleting');

  await check('leaving a group takes my private reminders about it and stops its alarms on my phone', async () => {
    const { group, asha, ben } = await makeGroup();
    const shared = await create(asha, group);
    await create(ben, group, { scope: 'me', title: 'Ben’s private one' });
    await call(ben, 'PATCH', `/reminders/${shared._id}`, { muted: true });
    await call(ben, 'POST', '/reminders/armed', { ids: [shared._id] });
    pushes.length = 0;

    const left = await call(ben, 'POST', `/groups/${id(group)}/leave`, {});
    assert.equal(left.status, 200, JSON.stringify(left.body));

    assert.equal(await Reminder.countDocuments({ group: group._id, createdBy: ben._id }), 0);
    const kept = await Reminder.findById(shared._id);
    assert.deepEqual(kept.mutedBy, []);
    assert.deepEqual(kept.armedBy, []);
    assert.deepEqual(syncs('refresh').map((p) => p.to), [[id(ben)]]);
    assert.deepEqual(await listMine(ben), []);
  });

  await check('deleting a task removes its reminders from the list and from every phone', async () => {
    const { group, users, asha } = await makeGroup();
    const task = await Task.create({ group: group._id, title: 'Book the hotel', createdBy: asha._id });
    const reminder = await create(asha, group, { title: 'Book the hotel', task: id(task) });
    assert.equal(String(reminder.task), id(task));
    pushes.length = 0;

    const gone = await call(asha, 'DELETE', `/tasks/${id(task)}`);
    assert.equal(gone.status, 200, JSON.stringify(gone.body));
    assert.equal(await Reminder.countDocuments({ task: task._id }), 0);
    assert.equal(await Message.countDocuments({ reminder: reminder._id }), 0);
    assert.deepEqual(syncs('remove').map((p) => p.to), [ids(users)]);
  });

  await check('deleting a group tells every member’s phone to read its list again', async () => {
    const { group, users, asha } = await makeGroup();
    await create(asha, group);
    pushes.length = 0;

    const gone = await call(asha, 'DELETE', `/groups/${id(group)}`);
    assert.equal(gone.status, 200, JSON.stringify(gone.body));
    assert.equal(await Reminder.countDocuments({ group: group._id }), 0);
    assert.deepEqual(syncs('refresh').map((p) => p.to), [ids(users)]);
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

  // ---- Summary -------------------------------------------------------------

  print('');
  const sections = [...new Set(results.map((result) => result.section))];
  for (const name of sections) {
    const inSection = results.filter((result) => result.section === name);
    const passed = inSection.filter((result) => result.ok).length;
    print(`${passed === inSection.length ? 'PASS' : 'FAIL'}  ${name} (${passed}/${inSection.length})`);
  }
  const failed = results.filter((result) => !result.ok).length;
  print(`\nSMOKE reminders: ${results.length - failed} passed, ${failed} failed, ${results.length} cases`);
  return failed;
};

main()
  .then((failed) => process.exit(failed ? 1 : 0))
  .catch(async (err) => {
    console.error(`Smoke test could not run: ${err.message}`);
    await dropThrowawayDatabase().catch(() => {});
    process.exit(1);
  });
