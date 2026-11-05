require('../testkit/safeEnv');

/**
 * Who may be in a group's call, with a fake Stream in place of the real one.
 *
 * Stream itself only checks that someone is a member of the call; these check
 * that the server makes the call's members exactly the group's members, before
 * anyone joins (POST /stream/call-join), when someone leaves the group, and
 * once a minute for anyone who got in anyway. Nothing here reaches Stream:
 * stream.outside.client refuses in tests, and every test replaces it.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const env = require('../src/config/env');
require('../testkit/safeEnv').assertSafe(env);
const Group = require('../src/models/Group');
const integrations = require('../src/integrations/store');
const streamService = require('../src/services/stream.service');
const callAccess = require('../src/services/callAccess.service');
const controller = require('../src/controllers/stream.controller');

const ASHA = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const BEN = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const CARA = 'cccccccccccccccccccccccc';
// Not in the group.
const XAVI = 'dddddddddddddddddddddddd';
const GROUP = 'eeeeeeeeeeeeeeeeeeeeeeee';
const CID = `default:${GROUP}`;

const oid = (id) => new mongoose.Types.ObjectId(id);
const person = (id, name) => ({ _id: oid(id), name });
// As groupService.getGroupForMember gives it: members populated with names.
const trip = (members = [person(ASHA, 'Asha'), person(BEN, 'Ben'), person(CARA, 'Cara')]) => ({
  _id: oid(GROUP),
  name: 'Tokyo Trip',
  members,
});
const asha = () => ({ _id: oid(ASHA), name: 'Asha' });

// ---- A fake Stream ----------------------------------------------------------

const notFound = () =>
  Object.assign(new Error("Stream error code 16: GetCall failed with error: \"Can't find call\""), {
    metadata: { responseCode: 404 },
  });

/**
 * Keeps calls the way Stream does, as far as these tests need: members with a
 * role, who is in the call, who is blocked from it. `log` is every request made,
 * in order.
 */
const makeFakeStream = () => {
  const fake = { calls: new Map(), log: [], users: new Map() };
  fake.reset = () => {
    fake.calls.clear();
    fake.users.clear();
    fake.log.length = 0;
  };
  // A call that already exists, as some earlier call left it.
  fake.seed = (cid, { members = [], participants = [], blocked = [] } = {}) => {
    fake.calls.set(cid, {
      members: members.map(([user_id, role]) => ({ user_id, role })),
      participants: participants.map((id, i) => ({
        user: { id },
        joined_at: new Date(Date.UTC(2026, 10, 5, 12, i)).toISOString(),
      })),
      blocked: [...blocked],
    });
  };
  fake.ops = () => fake.log.map((entry) => entry.op);

  const callApi = (type, id) => {
    const cid = `${type}:${id}`;
    const record = (op, args = {}) => fake.log.push({ cid, op, ...args });
    const existing = () => {
      const call = fake.calls.get(cid);
      if (!call) throw notFound();
      return call;
    };
    const info = (call) => ({
      id,
      type,
      blocked_user_ids: [...call.blocked],
      session: { participants: call.participants.map((p) => ({ ...p })) },
    });
    return {
      getOrCreate: async (request = {}) => {
        record('getOrCreate', { request });
        let call = fake.calls.get(cid);
        const created = !call;
        if (created) {
          call = { members: [], participants: [], blocked: [], createdBy: request.data?.created_by_id };
          fake.calls.set(cid, call);
        }
        return { created, call: info(call), members: call.members.slice(0, request.members_limit ?? 25) };
      },
      get: async () => {
        record('get');
        return { call: info(existing()), members: existing().members };
      },
      queryMembers: async ({ limit = 25, next } = {}) => {
        record('queryMembers');
        const all = existing().members;
        const from = Number(next ?? 0);
        const more = from + limit < all.length;
        return { members: all.slice(from, from + limit), ...(more ? { next: String(from + limit) } : {}) };
      },
      updateCallMembers: async ({ update_members: update = [], remove_members: remove = [] } = {}) => {
        record('updateCallMembers', { update, remove });
        const call = existing();
        for (const member of update) {
          const unknown = !fake.users.has(member.user_id);
          if (unknown) throw new Error(`Stream error code 4: user ${member.user_id} does not exist`);
          call.members = call.members.filter((m) => m.user_id !== member.user_id).concat({ ...member });
        }
        call.members = call.members.filter((m) => !remove.includes(m.user_id));
      },
      blockUser: async ({ user_id: userId }) => {
        record('blockUser', { userId });
        const call = existing();
        if (!call.blocked.includes(userId)) call.blocked.push(userId);
      },
      unblockUser: async ({ user_id: userId }) => {
        record('unblockUser', { userId });
        const call = existing();
        call.blocked = call.blocked.filter((id) => id !== userId);
      },
      kickUser: async ({ user_id: userId }) => {
        record('kickUser', { userId });
        const call = existing();
        if (!call.participants.some((p) => p.user.id === userId)) throw new Error('user is not in the call');
        call.participants = call.participants.filter((p) => p.user.id !== userId);
      },
    };
  };

  fake.client = {
    video: { call: callApi },
    upsertUsers: async (users) => {
      fake.log.push({ op: 'upsertUsers', users });
      for (const user of users) fake.users.set(user.id, user);
    },
  };
  return fake;
};

// One fake for the whole file: the service keeps the client it made for a set
// of keys, so every test must be handed the same one.
const fake = makeFakeStream();
test.beforeEach(() => fake.reset());

const useFake = (t) => t.mock.method(streamService.outside, 'client', () => fake.client);

const membersOf = (cid) =>
  Object.fromEntries((fake.calls.get(cid)?.members ?? []).map((m) => [m.user_id, m.role]));

// ---- prepareCall ------------------------------------------------------------

test('a group calling for the first time gets a call whose members are exactly the group', async (t) => {
  useFake(t);

  const answer = await streamService.prepareCall(trip(), asha());

  assert.deepEqual(answer, { live: false });
  assert.equal(fake.calls.get(CID).createdBy, ASHA);
  assert.deepEqual(membersOf(CID), { [ASHA]: 'call_member', [BEN]: 'call_member', [CARA]: 'call_member' });
  // Stream only takes members it knows: they are made known first, by name.
  const upsert = fake.log.find((entry) => entry.op === 'upsertUsers');
  assert.deepEqual(upsert.users, [
    { id: ASHA, name: 'Asha' },
    { id: BEN, name: 'Ben' },
    { id: CARA, name: 'Cara' },
  ]);
  assert.deepEqual(fake.ops(), ['getOrCreate', 'upsertUsers', 'updateCallMembers']);
});

test('a call already set up for the group is left as it is', async (t) => {
  useFake(t);
  fake.seed(CID, {
    members: [[ASHA, 'call_member'], [BEN, 'call_member'], [CARA, 'call_member']],
    participants: [BEN],
  });

  const answer = await streamService.prepareCall(trip(), asha());

  // Ben is in it: Asha is joining a call already on.
  assert.deepEqual(answer, { live: true });
  assert.deepEqual(fake.ops(), ['getOrCreate']);
});

test('a new member is added; someone no longer in the group is removed, blocked and taken out', async (t) => {
  useFake(t);
  // Xavi was a member, left the group, and is still in its call. Cara joined
  // the group since the last call. Ben was made a call admin somehow.
  fake.seed(CID, {
    members: [[ASHA, 'call_member'], [BEN, 'admin'], [XAVI, 'call_member']],
    participants: [XAVI, ASHA],
  });

  const answer = await streamService.prepareCall(trip(), asha());

  assert.deepEqual(answer, { live: true });
  assert.deepEqual(membersOf(CID), { [ASHA]: 'call_member', [BEN]: 'call_member', [CARA]: 'call_member' });
  const call = fake.calls.get(CID);
  assert.deepEqual(call.blocked, [XAVI]);
  assert.deepEqual(call.participants.map((p) => p.user.id), [ASHA]);
  // Only those who needed it were touched.
  const update = fake.log.find((entry) => entry.op === 'updateCallMembers' && entry.update.length);
  assert.deepEqual(update.update.map((m) => m.user_id).sort(), [BEN, CARA]);
});

test('someone blocked when they left the group is let back in once they are a member again', async (t) => {
  useFake(t);
  fake.seed(CID, {
    members: [[ASHA, 'call_member'], [BEN, 'call_member']],
    blocked: [CARA],
  });

  await streamService.prepareCall(trip(), person(CARA, 'Cara'));

  assert.deepEqual(fake.calls.get(CID).blocked, []);
  assert.equal(membersOf(CID)[CARA], 'call_member');
});

test('a group bigger than one page of Stream members is read in full', async (t) => {
  useFake(t);
  const many = Array.from({ length: 120 }, (_, i) => person(i.toString(16).padStart(24, '0'), `P${i}`));
  fake.seed(CID, { members: many.map((m) => [String(m._id), 'call_member']) });

  await streamService.prepareCall(trip(many), many[0]);

  // The first 100 come with the call, then every page is read: nobody past the
  // first page is mistaken for missing and added again.
  assert.deepEqual(fake.ops(), ['getOrCreate', 'queryMembers', 'queryMembers']);
  assert.equal(Object.keys(membersOf(CID)).length, 120);
});

test('without Stream keys a call cannot be set up, and says so', async (t) => {
  useFake(t);
  t.mock.method(integrations, 'stream', () => ({ apiKey: '', apiSecret: '' }));

  await assert.rejects(() => streamService.prepareCall(trip(), asha()), (err) => {
    assert.equal(err.statusCode, 503);
    assert.equal(err.code, 'CALLS_UNAVAILABLE');
    return true;
  });
  assert.deepEqual(fake.log, []);
});

// ---- POST /stream/call-join -------------------------------------------------

const join = (groupId, user = asha()) =>
  new Promise((resolve, reject) => {
    controller.callJoin({ body: { groupId }, user }, { json: resolve }, reject);
  });

// getGroupForMember is the real one; only the database read is replaced.
const stubGroupRead = (t, group) =>
  t.mock.method(Group, 'findById', () => ({ populate: async () => group }));

test('a member is answered once the call is ready for them', async (t) => {
  useFake(t);
  stubGroupRead(t, trip());

  const answer = await join(GROUP);

  assert.deepEqual(answer, { success: true, data: { live: false } });
  assert.equal(membersOf(CID)[ASHA], 'call_member');
});

test('someone outside the group is refused, and Stream is never asked', async (t) => {
  useFake(t);
  stubGroupRead(t, trip());

  await assert.rejects(() => join(GROUP, person(XAVI, 'Xavi')), (err) => err.statusCode === 403);
  assert.deepEqual(fake.log, []);
});

test('a group that does not exist is a 404, and Stream is never asked', async (t) => {
  useFake(t);
  stubGroupRead(t, null);

  await assert.rejects(() => join(GROUP), (err) => err.statusCode === 404);
  assert.deepEqual(fake.log, []);
});

// ---- Leaving the group ------------------------------------------------------

test('someone who leaves a group is taken out of its call and kept out', async (t) => {
  useFake(t);
  fake.seed(CID, {
    members: [[ASHA, 'call_member'], [BEN, 'call_member']],
    participants: [ASHA, BEN],
  });

  await callAccess.memberLeft(GROUP, oid(BEN));

  const call = fake.calls.get(CID);
  assert.deepEqual(membersOf(CID), { [ASHA]: 'call_member' });
  assert.deepEqual(call.blocked, [BEN]);
  assert.deepEqual(call.participants.map((p) => p.user.id), [ASHA]);
});

test('leaving a group that has never called asks Stream nothing more', async (t) => {
  useFake(t);

  await callAccess.memberLeft(GROUP, BEN);

  assert.deepEqual(fake.ops(), ['get']);
});

test('leaving a group never fails, even with Stream down', async (t) => {
  t.mock.method(streamService.outside, 'client', () => {
    throw new Error('Stream down');
  });
  // The service may already hold the fake client from an earlier test.
  t.mock.method(streamService, 'removeFromCall', async () => {
    throw new Error('Stream down');
  });
  const logged = t.mock.method(console, 'error', () => {});

  await callAccess.memberLeft(GROUP, BEN);

  assert.equal(logged.mock.callCount(), 1);
});

// ---- The minute sweep -------------------------------------------------------

const stubGroups = (t, groupsById) =>
  t.mock.method(Group, 'findById', (id) => ({
    select: () => ({ lean: async () => groupsById[String(id)] ?? null }),
  }));

test('the sweep takes anyone out of a call who is not in its group, and nobody else', async (t) => {
  useFake(t);
  t.mock.method(console, 'warn', () => {});
  fake.seed(CID, { members: [[ASHA, 'call_member']], participants: [ASHA, XAVI] });
  t.mock.method(streamService, 'ongoingCalls', async () => [
    { groupId: GROUP, startedAt: new Date(), participantIds: [ASHA, XAVI] },
  ]);
  stubGroups(t, { [GROUP]: { members: [oid(ASHA), oid(BEN)] } });

  const done = await callAccess.sweep();

  assert.deepEqual(done, [{ groupId: GROUP, removed: [XAVI] }]);
  const call = fake.calls.get(CID);
  assert.deepEqual(call.participants.map((p) => p.user.id), [ASHA]);
  assert.deepEqual(call.blocked, [XAVI]);
});

test('the sweep empties the call of a group that no longer exists', async (t) => {
  useFake(t);
  t.mock.method(console, 'warn', () => {});
  fake.seed(CID, { participants: [ASHA, BEN] });
  t.mock.method(streamService, 'ongoingCalls', async () => [
    { groupId: GROUP, startedAt: new Date(), participantIds: [ASHA, BEN] },
  ]);
  stubGroups(t, {});

  const done = await callAccess.sweep();

  assert.deepEqual(done, [{ groupId: GROUP, removed: [ASHA, BEN] }]);
  assert.deepEqual(fake.calls.get(CID).participants, []);
});

test('the sweep leaves alone calls that are not a group call, and calls with only members', async (t) => {
  useFake(t);
  t.mock.method(streamService, 'ongoingCalls', async () => [
    { groupId: 'dashboard-test-call', startedAt: new Date(), participantIds: [XAVI] },
    { groupId: GROUP, startedAt: new Date(), participantIds: [BEN, ASHA] },
  ]);
  stubGroups(t, { [GROUP]: { members: [oid(ASHA), oid(BEN)] } });

  assert.deepEqual(await callAccess.sweep(), []);
  assert.deepEqual(fake.log, []);
});

// ---- What Stream says is live -----------------------------------------------

test('a live call lists who is in it longest first, each person once', () => {
  const at = (minute) => new Date(Date.UTC(2026, 10, 5, 12, minute)).toISOString();
  const ids = streamService.participantIdsOf({
    session: {
      participants: [
        { user: { id: BEN }, joined_at: at(3) },
        { user: { id: ASHA }, joined_at: at(1) },
        // Ben again, on a second phone.
        { user: { id: BEN }, joined_at: at(2) },
      ],
    },
  });
  assert.deepEqual(ids, [ASHA, BEN]);
  assert.deepEqual(streamService.participantIdsOf({}), []);
});
