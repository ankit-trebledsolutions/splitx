require('../testkit/safeEnv');

/**
 * End-to-end smoke test of credits: the real Express app over HTTP, a
 * throwaway local database, the fake OpenAI server and a stand-in for Stream.
 * Nothing real is touched (see testkit/safeEnv.js), and it costs nothing.
 *
 *   npm run smoke:wallet                          needs a local mongod on 27017
 *   SMOKE_MONGO_BASE=mongodb://127.0.0.1:27018 npm run smoke:wallet
 *   node scripts/smoke-wallet.js --verbose        also print the server's logs
 *
 * Also covers the co-admin permission fix that had to land before the wallet
 * (a co-admin could otherwise have given themselves the wallet module).
 *
 * The database is named splix_wallet_smoke_<timestamp> and dropped at the end.
 * Exits 0 only when every case passes.
 */
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fakeOpenai = require('./fake-openai');

const DB_PREFIX = 'splix_wallet_smoke_';
const MONGO_BASE = (process.env.SMOKE_MONGO_BASE || 'mongodb://127.0.0.1:27017').replace(/\/+$/, '');
const VERBOSE = process.argv.includes('--verbose');
const MINUTE_MS = 60 * 1000;

const print = console.log.bind(console);

let dropThrowawayDatabase = async () => {};

const main = async () => {
  const fake = await fakeOpenai.start({ slowMs: 10000 });
  process.env.MONGODB_URI = `${MONGO_BASE}/${DB_PREFIX}${Date.now()}`;
  process.env.OPENAI_BASE_URL = fake.url;

  const env = require('../src/config/env');
  require('../testkit/safeEnv').assertSafe(env);

  const mongoose = require('mongoose');
  const jwt = require('jsonwebtoken');
  const app = require('../src/app');
  const connectDB = require('../src/config/db');
  const realtime = require('../src/realtime/socket');
  const ai = require('../src/services/ai.service');
  const aiItineraryService = require('../src/services/aiItinerary.service');
  const walletService = require('../src/services/wallet.service');
  const callBilling = require('../src/services/callBilling.service');
  const streamService = require('../src/services/stream.service');
  const { ROLES } = require('../src/config/permissions');
  const User = require('../src/models/User');
  const Group = require('../src/models/Group');
  const Message = require('../src/models/Message');
  const Wallet = require('../src/models/Wallet');
  const CreditTransaction = require('../src/models/CreditTransaction');
  const WalletSettings = require('../src/models/WalletSettings');
  const CallSession = require('../src/models/CallSession');
  const ItineraryJob = require('../src/models/ItineraryJob');

  await connectDB();
  const dbName = mongoose.connection.name;
  dropThrowawayDatabase = async () => {
    assert.ok(dbName.startsWith(DB_PREFIX), `refusing to drop "${dbName}"`);
    await mongoose.connection.dropDatabase();
  };
  // The unique keys are what make "at most once" true: build them before any race.
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));

  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;

  // ---- Seams ---------------------------------------------------------------

  const events = [];
  realtime.emitToGroup = (groupId, event, payload) => events.push({ room: `group:${groupId}`, event, payload });
  realtime.emitToUser = (userId, event, payload) => events.push({ room: `user:${userId}`, event, payload });
  const eventsFor = (user, event) => events.filter((e) => e.room === `user:${user._id}` && e.event === event);

  // The AI controller never awaits run(); keep its promises so a case can wait.
  const runs = [];
  const realRun = aiItineraryService.run;
  aiItineraryService.run = (jobId) => {
    const running = realRun(jobId);
    runs.push(running);
    return running;
  };
  const settleRuns = () => Promise.allSettled(runs.splice(0));

  // Stream, as the billing sweep sees it: the calls it says are live, and the
  // calls the server asked it to clear.
  let liveCalls = [];
  const endedCalls = [];
  streamService.isConfigured = () => true;
  streamService.ongoingCalls = async () => liveCalls;
  streamService.removeEveryone = async (groupId) => {
    endedCalls.push(String(groupId));
    return [];
  };
  const groupEvents = (group, event) => events.filter((e) => e.room === `group:${group._id}` && e.event === event);

  // ---- Fixtures ------------------------------------------------------------

  let userCount = 0;
  // A Google account: no password, so no slow bcrypt hash per fixture.
  const makeUser = (name = 'Smoke Tester', fields = {}) => {
    userCount += 1;
    return User.create({ name, email: `smoke${userCount}@example.test`, googleId: `smoke-${userCount}`, ...fields });
  };
  const makeStaff = (name, role, permissions) =>
    makeUser(name, { role, ...(permissions ? { permissions } : {}) });

  const makeTrip = (members) =>
    Group.create({
      name: 'Smoke Trip',
      groupType: 'trip',
      location: 'Jaipur, India',
      startDate: new Date('2026-12-10T06:30:00.000Z'),
      totalDays: 2,
      createdBy: members[0]._id,
      admin: members[0]._id,
      members: members.map((member) => member._id),
    });

  const request = async (token, method, url, body) => {
    const res = await fetch(`${base}${url}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
    return { status: res.status, body: parsed };
  };
  const call = (user, method, url, body) =>
    request(jwt.sign({ sub: String(user._id) }, env.jwtSecret), method, url, body);
  const adminCall = (user, method, url, body) =>
    request(jwt.sign({ sub: String(user._id), scope: 'admin' }, env.jwtSecret), method, `/admin${url}`, body);

  const expectStatus = (res, status) =>
    assert.equal(res.status, status, `expected HTTP ${status}, got ${res.status}: ${JSON.stringify(res.body)}`);
  const expectError = (res, status, code) => {
    expectStatus(res, status);
    assert.equal(res.body.success, false);
    if (code) assert.equal(res.body.code, code);
  };

  const DEFAULTS = WalletSettings.DEFAULTS;
  const setSettings = (changes = {}) =>
    WalletSettings.findOneAndUpdate(
      { key: 'wallet' },
      {
        $set: {
          prices: { ...DEFAULTS.prices, ...(changes.prices ?? {}) },
          callBlockMinutes: changes.callBlockMinutes ?? DEFAULTS.callBlockMinutes,
          signupBonus: changes.signupBonus ?? DEFAULTS.signupBonus,
          monthlyFree: changes.monthlyFree ?? DEFAULTS.monthlyFree,
          coAdminGrantCap: changes.coAdminGrantCap ?? DEFAULTS.coAdminGrantCap,
        },
      },
      { upsert: true }
    );

  const walletOf = (user) => Wallet.findOne({ user: user._id }).lean();
  const rowsOf = (user, filter = {}) => CreditTransaction.find({ user: user._id, ...filter }).lean();
  const balanceOf = async (user) => {
    const wallet = await walletOf(user);
    return wallet.free + wallet.paid;
  };
  // A user with exactly `credits`, all of them their own (paid pot).
  const userWith = async (credits, name) => {
    const user = await makeUser(name);
    await walletService.ensureWallet(user._id);
    const wallet = await walletOf(user);
    const change = credits - (wallet.free + wallet.paid);
    await walletService.applyOp(user._id, {
      key: `fixture:${user._id}`,
      type: change >= 0 ? 'grant' : 'deduct',
      compute: (current) => ({ free: -current.free, paid: credits - current.paid }),
    });
    return user;
  };

  const owner = await makeStaff('Owner', ROLES.SUPER_ADMIN);
  const userAdmin = await makeStaff('Users Co-admin', ROLES.ADMIN, { user_management: 'read_write' });
  const peerAdmin = await makeStaff('Peer Co-admin', ROLES.ADMIN, { user_management: 'read' });
  const walletAdmin = await makeStaff('Wallet Co-admin', ROLES.ADMIN, { wallet: 'read_write' });
  const walletReader = await makeStaff('Wallet Reader', ROLES.ADMIN, { wallet: 'read' });

  // ---- Runner --------------------------------------------------------------

  const results = [];
  let currentGroup = '';
  const section = (title) => {
    currentGroup = title;
    print(`\n${title}`);
  };

  const check = async (name, fn) => {
    ai.resetBreaker();
    aiItineraryService.resetShutdown();
    env.openai.apiKey = 'fake-ok';
    await setSettings();
    events.length = 0;
    liveCalls = [];
    endedCalls.length = 0;

    const logs = [];
    const real = { error: console.error, warn: console.warn };
    if (!VERBOSE) {
      console.error = (...args) => logs.push(args.map(String).join(' '));
      console.warn = console.error;
    }
    try {
      await fn();
      results.push({ group: currentGroup, name, ok: true });
      print(`  ok    ${name}`);
    } catch (err) {
      results.push({ group: currentGroup, name, ok: false });
      print(`  FAIL  ${name}\n        ${String(err.stack || err.message).split('\n').slice(0, 4).join('\n        ')}`);
      for (const line of logs) print(`        | ${line.split('\n')[0]}`);
    } finally {
      await settleRuns();
      Object.assign(console, real);
    }
  };

  // ---- Cases ---------------------------------------------------------------

  section('Co-admin permissions');

  await check('a co-admin cannot give themselves modules through PATCH /users/:id', async () => {
    const res = await adminCall(userAdmin, 'PATCH', `/users/${userAdmin._id}`, {
      name: 'Users Co-admin',
      permissions: { wallet: 'read_write', email_template: 'read_write', support: 'read_write' },
    });
    expectStatus(res, 200);
    const fresh = await User.findById(userAdmin._id).lean();
    assert.deepEqual(Object.keys(fresh.permissions), ['user_management']);
  });

  await check("a co-admin cannot reset a peer admin's password or email; an owner can", async () => {
    expectError(await adminCall(userAdmin, 'PATCH', `/users/${peerAdmin._id}`, { password: 'taken-over-1' }), 403);
    expectError(await adminCall(userAdmin, 'PATCH', `/users/${peerAdmin._id}`, { email: 'mine@example.test' }), 403);
    expectStatus(await adminCall(owner, 'PATCH', `/users/${peerAdmin._id}`, { password: 'owner-reset-1' }), 200);
  });

  await check("a co-admin can still change an app user's details", async () => {
    const someone = await makeUser('Someone');
    expectStatus(await adminCall(userAdmin, 'PATCH', `/users/${someone._id}`, { password: 'support-reset-1' }), 200);
  });

  section('Wallet basics');

  await check("the first look creates the wallet: signup bonus + this month's free credits", async () => {
    const user = await makeUser('Newcomer');
    const res = await call(user, 'GET', '/wallet');
    expectStatus(res, 200);
    const { wallet } = res.body.data;
    assert.equal(wallet.balance, DEFAULTS.signupBonus + DEFAULTS.monthlyFree);
    assert.equal(wallet.free, DEFAULTS.monthlyFree);
    assert.equal(wallet.paid, DEFAULTS.signupBonus);
    assert.deepEqual(wallet.prices, { aiItinerary: 0, callBlock: 0, callBlockMinutes: 10 });
    assert.equal(new Date(wallet.freeRenewsAt).getTime(), walletService.nextMonthStart().getTime());

    const history = await call(user, 'GET', '/wallet/transactions');
    expectStatus(history, 200);
    assert.deepEqual(history.body.data.items.map((row) => row.type).sort(), ['bonus', 'monthly']);
    for (const row of history.body.data.items) {
      assert.equal('note' in row, false, 'the app never sees admin notes');
      assert.equal('by' in row, false, 'the app never sees which admin');
    }
  });

  await check('five first looks at once still give the bonus once', async () => {
    const user = await makeUser('Eager');
    const all = await Promise.all([1, 2, 3, 4, 5].map(() => call(user, 'GET', '/wallet')));
    for (const res of all) expectStatus(res, 200);
    assert.equal((await rowsOf(user, { type: 'bonus' })).length, 1);
    assert.equal((await rowsOf(user, { type: 'monthly' })).length, 1);
    assert.equal(await balanceOf(user), DEFAULTS.signupBonus + DEFAULTS.monthlyFree);
    assert.equal(await Wallet.countDocuments({ user: user._id }), 1);
  });

  await check('the app has no way to add credits', async () => {
    const user = await makeUser('Hopeful');
    for (const method of ['POST', 'PUT', 'PATCH']) {
      // eslint-disable-next-line no-await-in-loop
      const res = await call(user, method, '/wallet', { balance: 100000, paid: 100000 });
      expectStatus(res, 404);
    }
    const res = await call(user, 'GET', '/wallet');
    assert.equal(res.body.data.wallet.balance, DEFAULTS.signupBonus + DEFAULTS.monthlyFree);
  });

  await check('a new month tops the free pot back up to the allowance, once', async () => {
    const user = await makeUser('Returning');
    // A wallet last topped up in an earlier month, with 5 free credits left,
    // and the history that explains it.
    await Wallet.create({ user: user._id, free: 5, paid: 50, freeMonth: '2026-01' });
    await CreditTransaction.create([
      { user: user._id, key: `bonus:${user._id}`, type: 'bonus', amount: 50, free: 0, paid: 50, freeAfter: 0, paidAfter: 50, balanceAfter: 50 },
      { user: user._id, key: `monthly:${user._id}:2026-01`, type: 'monthly', amount: 5, free: 5, paid: 0, freeAfter: 5, paidAfter: 50, balanceAfter: 55 },
    ]);
    await call(user, 'GET', '/wallet');
    await call(user, 'GET', '/wallet');
    const wallet = await walletOf(user);
    assert.equal(wallet.free, DEFAULTS.monthlyFree);
    assert.equal(wallet.paid, 50);
    assert.equal(wallet.freeMonth, walletService.monthOf());
    const topUps = await rowsOf(user, { key: `monthly:${user._id}:${walletService.monthOf()}` });
    assert.equal(topUps.length, 1);
    assert.equal(topUps[0].amount, DEFAULTS.monthlyFree - 5);
  });

  await check('with no monthly allowance and an empty free pot, the month moves on with no history row', async () => {
    await setSettings({ monthlyFree: 0 });
    const user = await makeUser('Quiet');
    await Wallet.create({ user: user._id, free: 0, paid: 0, freeMonth: '2026-01' });
    await walletService.ensureWallet(user._id);
    assert.equal((await walletOf(user)).freeMonth, walletService.monthOf());
    assert.equal((await rowsOf(user, { type: 'monthly' })).length, 0);
  });

  section('Spending safely');

  await check('12 charges at once on 70 credits: exactly 7 go through and the balance ends at 0', async () => {
    await setSettings({ prices: { aiItinerary: 10 } });
    const user = await makeUser('Racer');
    await walletService.ensureWallet(user._id);
    const outcomes = await Promise.allSettled(
      Array.from({ length: 12 }, (_, i) =>
        walletService.charge(user._id, { feature: 'ai_itinerary', key: `race:${user._id}:${i}` })
      )
    );
    const paid = outcomes.filter((o) => o.status === 'fulfilled');
    const refused = outcomes.filter((o) => o.status === 'rejected');
    for (const r of refused) assert.equal(r.reason.code, 'NO_CREDITS', r.reason.message);
    assert.equal(paid.length, 7);
    assert.equal(refused.length, 5);
    const wallet = await walletOf(user);
    assert.deepEqual([wallet.free, wallet.paid], [0, 0]);
    assert.equal(wallet.pending.length, 0);
    assert.equal((await rowsOf(user, { type: 'spend' })).length, 7);
  });

  await check('the same key charges once, however often and however fast it is sent', async () => {
    await setSettings({ prices: { aiItinerary: 10 } });
    const user = await userWith(100, 'Double tapper');
    const key = `dup:${user._id}`;
    await Promise.all([1, 2, 3].map(() => walletService.charge(user._id, { feature: 'ai_itinerary', key })));
    await walletService.charge(user._id, { feature: 'ai_itinerary', key });
    assert.equal(await balanceOf(user), 90);
    assert.equal((await rowsOf(user, { type: 'spend' })).length, 1);
  });

  await check('a refund goes back into the pots it came from, once', async () => {
    await setSettings({ prices: { aiItinerary: 30 } });
    const user = await makeUser('Refunded');
    await walletService.ensureWallet(user._id);
    const key = `ai:refund-test-${user._id}`;
    await walletService.charge(user._id, { feature: 'ai_itinerary', key });
    let wallet = await walletOf(user);
    assert.deepEqual([wallet.free, wallet.paid], [0, DEFAULTS.signupBonus - 10]);
    await Promise.all([walletService.refund(key), walletService.refund(key)]);
    await walletService.refund(key);
    wallet = await walletOf(user);
    assert.deepEqual([wallet.free, wallet.paid], [DEFAULTS.monthlyFree, DEFAULTS.signupBonus]);
    assert.equal((await rowsOf(user, { type: 'refund' })).length, 1);
    assert.equal(await walletService.refund('ai:never-charged'), null);
  });

  await check('while a feature is free, charging writes nothing at all', async () => {
    const user = await makeUser('Freeloader');
    assert.equal(await walletService.charge(user._id, { feature: 'ai_itinerary', key: `free:${user._id}` }), null);
    assert.equal(await Wallet.countDocuments({ user: user._id }), 0);
  });

  section('Admin grants');

  const adjustBody = (type, amount, reason = 'Smoke test', requestId = randomUUID()) => ({
    type,
    amount,
    reason,
    requestId,
  });

  await check('an owner grants any amount, and the reason never reaches the app', async () => {
    const user = await makeUser('Lucky');
    const res = await adminCall(owner, 'POST', `/wallet/users/${user._id}/adjust`, adjustBody('grant', 5000, 'Launch gift'));
    expectStatus(res, 200);
    assert.equal(res.body.data.wallet.balance, DEFAULTS.signupBonus + DEFAULTS.monthlyFree + 5000);
    assert.equal(res.body.data.transaction.note, 'Launch gift');
    assert.equal(res.body.data.transaction.by.id, String(owner._id));
    const app = await call(user, 'GET', '/wallet/transactions');
    const grant = app.body.data.items.find((row) => row.type === 'grant');
    assert.equal(grant.amount, 5000);
    assert.equal('note' in grant, false);
    assert.ok(eventsFor(user, 'wallet:updated').length > 0, 'the phone hears about it');
  });

  await check('a co-admin is held to the cap, and one request id lands once', async () => {
    const user = await makeUser('Helped');
    expectError(await adminCall(walletAdmin, 'POST', `/wallet/users/${user._id}/adjust`, adjustBody('grant', 600)), 403);
    const body = adjustBody('grant', 400);
    const [first, second] = await Promise.all([
      adminCall(walletAdmin, 'POST', `/wallet/users/${user._id}/adjust`, body),
      adminCall(walletAdmin, 'POST', `/wallet/users/${user._id}/adjust`, body),
    ]);
    expectStatus(first, 200);
    expectStatus(second, 200);
    assert.equal((await rowsOf(user, { type: 'grant' })).length, 1);
    assert.equal(await balanceOf(user), DEFAULTS.signupBonus + DEFAULTS.monthlyFree + 400);
  });

  await check('a deduction takes granted credits first and can never go below zero', async () => {
    const user = await makeUser('Corrected');
    await walletService.ensureWallet(user._id);
    expectError(await adminCall(owner, 'POST', `/wallet/users/${user._id}/adjust`, adjustBody('deduct', 1000)), 400);
    expectStatus(await adminCall(owner, 'POST', `/wallet/users/${user._id}/adjust`, adjustBody('deduct', 30)), 200);
    const wallet = await walletOf(user);
    assert.deepEqual([wallet.free, wallet.paid], [DEFAULTS.monthlyFree, DEFAULTS.signupBonus - 30]);
  });

  await check('nobody adjusts their own credits; read-only and module-less admins are refused', async () => {
    const user = await makeUser('Bystander');
    expectError(await adminCall(walletAdmin, 'POST', `/wallet/users/${walletAdmin._id}/adjust`, adjustBody('grant', 10)), 400);
    expectError(await adminCall(walletReader, 'POST', `/wallet/users/${user._id}/adjust`, adjustBody('grant', 10)), 403);
    expectStatus(await adminCall(walletReader, 'GET', `/wallet/users/${user._id}`), 200);
    expectError(await adminCall(userAdmin, 'GET', `/wallet/users/${user._id}`), 403);
    expectError(await adminCall(userAdmin, 'GET', '/wallet/transactions'), 403);
  });

  await check("owners stay invisible: their wallet is 'not found' to a co-admin and their rows are left out", async () => {
    await walletService.ensureWallet(owner._id);
    expectError(await adminCall(walletAdmin, 'GET', `/wallet/users/${owner._id}`), 404);
    expectError(await adminCall(walletAdmin, 'POST', `/wallet/users/${owner._id}/adjust`, adjustBody('grant', 10)), 404);
    const seenByCoAdmin = await adminCall(walletAdmin, 'GET', '/wallet/transactions?type=bonus&limit=100');
    expectStatus(seenByCoAdmin, 200);
    assert.equal(seenByCoAdmin.body.data.items.some((row) => row.user.id === String(owner._id)), false);
    const seenByOwner = await adminCall(owner, 'GET', '/wallet/transactions?type=bonus&limit=100');
    assert.equal(seenByOwner.body.data.items.some((row) => row.user.id === String(owner._id)), true);
  });

  await check('prices are owners only, and apply to the very next request', async () => {
    const values = {
      prices: { aiItinerary: 12, callBlock: 4 },
      callBlockMinutes: 5,
      signupBonus: 50,
      monthlyFree: 20,
      coAdminGrantCap: 500,
    };
    expectError(await adminCall(walletAdmin, 'PUT', '/wallet/settings', values), 403);
    expectError(await adminCall(owner, 'PUT', '/wallet/settings', { ...values, callBlockMinutes: 0 }), 400);
    expectError(await adminCall(owner, 'PUT', '/wallet/settings', { ...values, prices: { aiItinerary: 1.5, callBlock: 4 } }), 400);
    expectStatus(await adminCall(owner, 'PUT', '/wallet/settings', values), 200);
    const user = await makeUser('Price watcher');
    const res = await call(user, 'GET', '/wallet');
    assert.deepEqual(res.body.data.wallet.prices, { aiItinerary: 12, callBlock: 4, callBlockMinutes: 5 });
    expectStatus(await adminCall(walletReader, 'GET', '/wallet/settings'), 200);
  });

  section('AI itinerary');

  const PREFS = { travellers: 'friends', interests: ['sightseeing'], pace: 'balanced', budget: 'mid', transport: 'cab' };
  const generate = (user, group, body = {}) => call(user, 'POST', `/groups/${group._id}/itinerary/generate`, { ...PREFS, ...body });

  await check('a plan costs its price; a plan that fails is refunded', async () => {
    await setSettings({ prices: { aiItinerary: 10 } });
    const user = await userWith(100, 'Planner');
    const group = await makeTrip([user]);

    expectStatus(await generate(user, group), 202);
    await settleRuns();
    let job = await ItineraryJob.findOne({ group: group._id }).sort({ startedAt: -1 }).lean();
    assert.equal(job.status, 'done');
    assert.equal(await balanceOf(user), 90);
    const spent = await CreditTransaction.findOne({ key: `ai:${job._id}` }).lean();
    assert.equal(spent.feature, 'ai_itinerary');
    assert.equal(spent.amount, -10);

    env.openai.apiKey = 'fake-garbage';
    expectStatus(await generate(user, group, { replace: true }), 202);
    await settleRuns();
    job = await ItineraryJob.findOne({ group: group._id }).sort({ startedAt: -1 }).lean();
    assert.equal(job.status, 'failed');
    assert.equal(await balanceOf(user), 90, 'charged, then given back');
    assert.ok(await CreditTransaction.exists({ key: `refund:ai:${job._id}` }));
  });

  await check('without enough credits the plan is refused with 402 and leaves no job behind', async () => {
    await setSettings({ prices: { aiItinerary: 10 } });
    const user = await userWith(9, 'Short');
    const group = await makeTrip([user]);
    const res = await generate(user, group);
    expectError(res, 402, 'NO_CREDITS');
    assert.equal(res.body.needed, 10);
    assert.equal(res.body.balance, 9);
    assert.equal(await ItineraryJob.countDocuments({ group: group._id }), 0);
    assert.equal(await balanceOf(user), 9);
    // The group is not left locked.
    expectStatus(await call(user, 'GET', `/groups/${group._id}/itinerary/generate`), 200);
  });

  await check('a job a dead server left running is refunded when it is reaped', async () => {
    await setSettings({ prices: { aiItinerary: 10 } });
    const user = await userWith(50, 'Orphaned');
    const group = await makeTrip([user]);
    const job = await ItineraryJob.create({
      group: group._id,
      requestedBy: user._id,
      resolved: { destination: 'Jaipur', days: 2 },
      startedAt: new Date(Date.now() - 60 * MINUTE_MS),
    });
    await walletService.charge(user._id, { feature: 'ai_itinerary', key: `ai:${job._id}` });
    assert.equal(await balanceOf(user), 40);
    await aiItineraryService.reapStale({ group: group._id });
    assert.equal((await ItineraryJob.findById(job._id).lean()).status, 'failed');
    assert.equal(await balanceOf(user), 50);
  });

  section('Calls');

  const startCall = (user, group) => call(user, 'POST', '/stream/call-start', { groupId: String(group._id) });
  const sessionOf = (group) => CallSession.findOne({ group: group._id }).sort({ startedAt: -1 }).lean();
  const liveCall = (group, firstUser, startedAt = new Date()) => ({
    groupId: String(group._id),
    startedAt,
    firstUserId: String(firstUser._id),
  });

  await check('while calls are free, starting one bills nothing and opens nothing', async () => {
    const user = await makeUser('Caller');
    const group = await makeTrip([user]);
    const res = await startCall(user, group);
    expectStatus(res, 200);
    assert.deepEqual(res.body.data, { billed: false });
    assert.equal(await CallSession.countDocuments({ group: group._id }), 0);
  });

  await check('starting a call pays its first block; without credits it is 402 and nothing opens', async () => {
    await setSettings({ prices: { callBlock: 5 } });
    const rich = await userWith(20, 'Rich caller');
    const poor = await userWith(4, 'Poor caller');
    const richGroup = await makeTrip([rich]);
    const poorGroup = await makeTrip([poor]);

    const res = await startCall(rich, richGroup);
    expectStatus(res, 200);
    assert.deepEqual(res.body.data, { billed: true, price: 5, blockMinutes: 10 });
    assert.equal(await balanceOf(rich), 15);
    const session = await sessionOf(richGroup);
    assert.equal(session.status, 'active');
    assert.equal(session.blocksCharged, 1);

    expectError(await startCall(poor, poorGroup), 402, 'NO_CREDITS');
    assert.equal(await CallSession.countDocuments({ group: poorGroup._id }), 0);
    assert.equal(await balanceOf(poor), 4);

    // Not a member: refused before anything is charged.
    expectError(await startCall(poor, richGroup), 403);
  });

  await check('the sweep bills each new block, warns once, then ends the call when credits run out', async () => {
    await setSettings({ prices: { callBlock: 5 } });
    const payer = await userWith(10, 'Payer');
    const friend = await makeUser('Friend');
    const group = await makeTrip([payer, friend]);
    expectStatus(await startCall(payer, group), 200);
    const session = await sessionOf(group);
    const at = (minutes) => new Date(session.startedAt).getTime() + minutes * MINUTE_MS;
    liveCalls = [liveCall(group, payer, session.startedAt)];

    await callBilling.sweep(at(5));
    assert.equal(await balanceOf(payer), 5, 'nothing new inside the first block');
    await callBilling.sweep(at(10));
    assert.equal(await balanceOf(payer), 0, 'second block paid at 10 minutes');
    assert.equal((await CallSession.findById(session._id).lean()).blocksCharged, 2);

    await callBilling.sweep(at(18.6));
    await callBilling.sweep(at(19));
    const warnings = eventsFor(payer, 'wallet:call-low');
    assert.equal(warnings.length, 1, 'warned once, about a minute and a half ahead');
    assert.equal(warnings[0].payload.groupId, String(group._id));

    await callBilling.sweep(at(20));
    assert.deepEqual(endedCalls, [String(group._id)]);
    const closed = await CallSession.findById(session._id).lean();
    assert.equal(closed.status, 'ended');
    assert.equal(closed.endReason, 'no_credits');
    const endedEvents = groupEvents(group, 'wallet:call-ended');
    assert.equal(endedEvents.length, 1, 'every phone in the call is told');
    assert.equal(endedEvents[0].payload.payerId, String(payer._id));
    assert.ok(await Message.exists({ group: group._id, text: 'Call ended: not enough credits' }));
    assert.equal(await balanceOf(payer), 0);
  });

  await check('a call nobody announced is found and billed to whoever has been in it longest', async () => {
    await setSettings({ prices: { callBlock: 5 } });
    const first = await userWith(100, 'First in');
    const second = await userWith(100, 'Second in');
    const group = await makeTrip([second, first]);
    const now = Date.now();
    liveCalls = [liveCall(group, first, new Date(now - 25 * MINUTE_MS))];
    await callBilling.sweep(now);
    const session = await sessionOf(group);
    assert.equal(String(session.startedBy), String(first._id));
    assert.equal(session.blocksCharged, 3, '25 minutes is three started blocks');
    assert.equal(await balanceOf(first), 85);
    assert.equal(await balanceOf(second), 100);

    // Someone outside the group in a call with the group's id pays nothing.
    const stranger = await userWith(100, 'Stranger');
    const otherGroup = await makeTrip([await makeUser('Owner of the other')]);
    liveCalls = [liveCall(otherGroup, stranger)];
    await callBilling.sweep(Date.now());
    assert.equal(await CallSession.countDocuments({ group: otherGroup._id }), 0);
    assert.equal(await balanceOf(stranger), 100);
  });

  await check('an "ended" sent too early does not charge the first block again', async () => {
    await setSettings({ prices: { callBlock: 5 } });
    const payer = await userWith(100, 'Early leaver');
    const group = await makeTrip([payer]);
    expectStatus(await startCall(payer, group), 200);
    const session = await sessionOf(group);
    expectStatus(await call(payer, 'POST', '/stream/call-event', { groupId: String(group._id), event: 'ended' }), 200);
    assert.equal((await CallSession.findById(session._id).lean()).status, 'ended');

    liveCalls = [liveCall(group, payer, session.startedAt)];
    await callBilling.sweep(new Date(session.startedAt).getTime() + MINUTE_MS);
    const resumed = await CallSession.findById(session._id).lean();
    assert.equal(resumed.status, 'active');
    assert.equal(await CallSession.countDocuments({ group: group._id }), 1);
    assert.equal(await balanceOf(payer), 95, 'still only the first block');
  });

  await check('a paid call that never showed up on Stream is closed after the join grace and refunded', async () => {
    await setSettings({ prices: { callBlock: 5 } });
    const payer = await userWith(100, 'Never connected');
    const group = await makeTrip([payer]);
    expectStatus(await startCall(payer, group), 200);
    assert.equal(await balanceOf(payer), 95);
    const session = await sessionOf(group);
    liveCalls = [];
    await callBilling.sweep(new Date(session.startedAt).getTime() + MINUTE_MS);
    assert.equal((await CallSession.findById(session._id).lean()).status, 'active', 'still joining');
    await callBilling.sweep(new Date(session.startedAt).getTime() + 3 * MINUTE_MS);
    const closed = await CallSession.findById(session._id).lean();
    assert.equal(closed.status, 'ended');
    assert.equal(closed.endReason, 'gone');
    assert.equal(await balanceOf(payer), 100);
  });

  await check('a call that was seen live keeps its charge when it goes', async () => {
    await setSettings({ prices: { callBlock: 5 } });
    const payer = await userWith(100, 'Real caller');
    const group = await makeTrip([payer]);
    expectStatus(await startCall(payer, group), 200);
    const session = await sessionOf(group);
    liveCalls = [liveCall(group, payer, session.startedAt)];
    await callBilling.sweep(new Date(session.startedAt).getTime() + MINUTE_MS);
    liveCalls = [];
    await callBilling.sweep(new Date(session.startedAt).getTime() + 5 * MINUTE_MS);
    assert.equal((await CallSession.findById(session._id).lean()).endReason, 'gone');
    assert.equal(await balanceOf(payer), 95);
  });

  await check('trying again after a call failed to connect charges the first block once', async () => {
    await setSettings({ prices: { callBlock: 5 } });
    const payer = await userWith(100, 'Retrier');
    const group = await makeTrip([payer]);
    expectStatus(await startCall(payer, group), 200);
    const first = await sessionOf(group);
    // Half a minute later, the phone having failed to join, they press call again.
    await CallSession.updateOne({ _id: first._id }, { $set: { startedAt: new Date(Date.now() - 30 * 1000) } });
    expectStatus(await startCall(payer, group), 200);
    assert.equal((await CallSession.findById(first._id).lean()).endReason, 'replaced');
    assert.equal(await CallSession.countDocuments({ group: group._id, status: 'active' }), 1);
    assert.equal(await balanceOf(payer), 95);
  });

  await check('making calls free closes every open session', async () => {
    await setSettings({ prices: { callBlock: 5 } });
    const payer = await userWith(100, 'Mid-call');
    const group = await makeTrip([payer]);
    expectStatus(await startCall(payer, group), 200);
    await setSettings({ prices: { callBlock: 0 } });
    await callBilling.sweep();
    assert.equal(await CallSession.countDocuments({ status: 'active' }), 0);
    assert.equal((await sessionOf(group)).endReason, 'free');
  });

  section('Repair and checks');

  await check('a change applied to a balance but missing from the history is finished by recovery', async () => {
    const user = await userWith(10, 'Crashed');
    const wallet = await walletOf(user);
    const entry = {
      key: `crash:${user._id}`,
      type: 'grant',
      free: 0,
      paid: 25,
      freeAfter: wallet.free,
      paidAfter: wallet.paid + 25,
      at: new Date(Date.now() - 2 * MINUTE_MS),
    };
    // What a server that died between the two writes leaves behind.
    await Wallet.updateOne({ _id: wallet._id }, { $set: { paid: wallet.paid + 25 }, $inc: { version: 1 }, $push: { pending: entry } });
    assert.ok((await walletService.recoverPending()) >= 1);
    assert.equal((await walletOf(user)).pending.length, 0);
    assert.ok(await CreditTransaction.exists({ key: entry.key }));
    assert.equal(await balanceOf(user), 35);
  });

  await check('a balance changed behind the service shows up in the check, and the summary adds up', async () => {
    const user = await userWith(10, 'Tampered');
    await Wallet.updateOne({ user: user._id }, { $inc: { paid: 1000 } });
    let check = await walletService.checkBalances(1000);
    assert.ok(check.mismatches.some((m) => String(m.user) === String(user._id)));
    await Wallet.updateOne({ user: user._id }, { $inc: { paid: -1000 } });
    check = await walletService.checkBalances(1000);
    assert.deepEqual(check.mismatches, [], JSON.stringify(check.mismatches));

    const summary = await adminCall(owner, 'GET', '/wallet/summary');
    expectStatus(summary, 200);
    assert.deepEqual(summary.body.data.check.mismatches, []);
    assert.equal(summary.body.data.held.wallets, await Wallet.countDocuments());
  });

  // ---- Teardown --------------------------------------------------------------

  section('Clean-up');
  await fake.close();
  await new Promise((resolve) => server.close(resolve));
  await check(`throwaway database ${dbName} is dropped`, async () => {
    await dropThrowawayDatabase();
    const { databases } = await mongoose.connection.getClient().db('admin').admin().listDatabases();
    assert.equal(databases.some((db) => db.name === dbName), false);
  });
  await mongoose.disconnect();

  // ---- Summary -------------------------------------------------------------

  print('');
  const groups = [...new Set(results.map((result) => result.group))];
  for (const group of groups) {
    const inGroup = results.filter((result) => result.group === group);
    const passed = inGroup.filter((result) => result.ok).length;
    print(`${passed === inGroup.length ? 'PASS' : 'FAIL'}  ${group} (${passed}/${inGroup.length})`);
  }
  const failed = results.filter((result) => !result.ok).length;
  print(`\nSMOKE wallet: ${results.length - failed} passed, ${failed} failed, ${results.length} cases`);
  return failed;
};

main()
  .then((failed) => process.exit(failed ? 1 : 0))
  .catch(async (err) => {
    console.error(`Smoke test could not run: ${err.stack || err.message}`);
    await dropThrowawayDatabase().catch(() => {});
    process.exit(1);
  });
