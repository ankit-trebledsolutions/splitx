const { StreamClient } = require('@stream-io/node-sdk');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const integrations = require('../integrations/store');

/**
 * Splix's side of Stream, which carries the group calls.
 *
 * Each group has one call, of Stream's `default` type, whose id is the group's
 * id (see the app's ActiveCallProvider). Who may be in it is decided here, not
 * by the phone: before anyone joins, prepareCall makes the call's Stream
 * members exactly the group's members, and Stream lets only members in once
 * the `default` call type is locked to them (docs/STREAM-CALL-ACCESS.md).
 */

const CALL_TYPE = 'default';
// The role Stream gives a call's members. The locked call type grants joining
// to this role only.
const MEMBER_ROLE = 'call_member';
// Stream's page size for members and for member updates.
const PAGE = 100;

const refuseInTests = (what) => () => {
  throw new Error(`No outside calls in tests: mock stream.outside.${what}`);
};

// Everything that reaches Stream goes through this client, so tests can replace
// it and can never touch a real Stream app by forgetting to.
const outside = {
  client: env.nodeEnv === 'test'
    ? refuseInTests('client')
    : ({ apiKey, apiSecret }) => new StreamClient(apiKey, apiSecret),
};

// One client per set of keys, made when it is first needed. The keys can be
// changed in the admin panel while the server runs, so the client cannot be
// built once at start-up and kept.
let current = { id: null, client: null };
const clientFor = (keys) => {
  const id = `${keys.apiKey}:${keys.apiSecret}`;
  if (current.id !== id) current = { id, client: outside.client(keys) };
  return current.client;
};

const hasKeys = (keys) => Boolean(keys.apiKey && keys.apiSecret);

// The server's own Stream client, or null while no keys are set.
const serverClient = () => {
  const keys = integrations.stream();
  return hasKeys(keys) ? clientFor(keys) : null;
};

const idOf = (value) => String(value?._id ?? value);
const callOf = (client, groupId) => client.video.call(CALL_TYPE, String(groupId));
const isNotFound = (err) => err?.metadata?.responseCode === 404;

const chunks = (list, size = PAGE) => {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
};

// Who is in a call right now, longest in it first, each person once (a person
// on two phones is two participants).
const participantIdsOf = (call) => {
  const participants = [...(call?.session?.participants ?? [])].sort(
    (a, b) => new Date(a.joined_at) - new Date(b.joined_at)
  );
  return [...new Set(participants.map((p) => p.user?.id).filter(Boolean))];
};

// Long enough that the app isn't mid-call when it expires; the mobile SDK
// re-fetches from this endpoint whenever it needs a fresh one. The token is not
// what keeps people out of other groups' calls (it names no call); the call
// members are.
const TOKEN_TTL_SECONDS = 60 * 60 * 24;

const issueToken = async (user) => {
  const userId = user._id.toString();
  // Read once, so the token and the key sent with it always belong together.
  const keys = integrations.stream();
  const streamClient = clientFor(keys);

  // Stream needs to know the user before they can join calls; upsert keeps
  // the display name in sync with our account on every token request.
  await streamClient.upsertUsers([{ id: userId, name: user.name }]);

  // Backdate the issued-at by a minute so minor clock skew between this
  // server and Stream's servers can't make the token look "issued in the
  // future" (Stream rejects that with AuthErrorTokenUsedBeforeIssuedAt).
  const iat = Math.floor(Date.now() / 1000) - 60;
  const token = streamClient.generateUserToken({
    user_id: userId,
    iat,
    validity_in_seconds: TOKEN_TTL_SECONDS,
  });

  return {
    apiKey: keys.apiKey,
    token,
    user: { id: userId, name: user.name },
  };
};

// Every member Stream has for a call, past the first page.
const allMembers = async (call) => {
  const found = [];
  let next;
  for (let page = 0; page < 20; page += 1) {
    // eslint-disable-next-line no-await-in-loop
    const response = await call.queryMembers({ limit: PAGE, ...(next ? { next } : {}) });
    found.push(...(response.members ?? []));
    next = response.next;
    if (!next) break;
  }
  return found;
};

/**
 * Keeps people out of a call: no longer members, blocked from joining it again
 * (in case the call type still lets anyone join), and taken out if they are in
 * it now. Each step on its own, so one that fails (Stream answers an error for
 * kicking someone who is not in the call) does not stop the others.
 */
const shutOut = async (call, userIds) => {
  await Promise.allSettled([
    call.updateCallMembers({ remove_members: userIds }),
    ...userIds.map((userId) => call.blockUser({ user_id: userId })),
  ]);
  await Promise.allSettled(userIds.map((userId) => call.kickUser({ user_id: userId })));
};

/**
 * Gets a group's call ready for `user`, a member, to join (POST
 * /stream/call-join). Creates the call if the group has never called, then
 * makes its Stream members exactly the group's members:
 *  - every member is added, with the call_member role
 *  - anyone else is removed, blocked, and taken out of the call if in it
 *  - a member blocked earlier (they had left the group, and are back) is let in
 *
 * `group.members` must be populated with names (groupService.getGroupForMember):
 * Stream only takes members it knows, so new ones are first created there.
 *
 * Resolves to { live }: whether any member is in the call right now.
 */
const prepareCall = async (group, user) => {
  const client = serverClient();
  if (!client) throw new ApiError(503, 'Calls are not set up yet', { code: 'CALLS_UNAVAILABLE' });

  const call = callOf(client, group._id);
  const members = new Map(group.members.map((m) => [idOf(m), m]));

  const created = await call.getOrCreate({
    members_limit: PAGE,
    data: { created_by_id: idOf(user) },
  });
  const info = created.call;
  const listed = created.members ?? [];
  const inStream = listed.length < PAGE ? listed : await allMembers(call);

  const roleOf = new Map(inStream.map((m) => [m.user_id, m.role]));
  // Missing, or there with another role (an admin can end the call or take
  // people out of it): every member is an equal call_member.
  const toAdd = [...members.keys()].filter((id) => roleOf.get(id) !== MEMBER_ROLE);
  const outsiders = [...roleOf.keys()].filter((id) => !members.has(id));

  if (toAdd.length) {
    await client.upsertUsers(toAdd.map((id) => ({ id, name: members.get(id).name })));
    for (const batch of chunks(toAdd)) {
      // eslint-disable-next-line no-await-in-loop
      await call.updateCallMembers({ update_members: batch.map((id) => ({ user_id: id, role: MEMBER_ROLE })) });
    }
  }

  const participants = participantIdsOf(info);
  const intruders = [...new Set([...outsiders, ...participants.filter((id) => !members.has(id))])];
  if (intruders.length) await shutOut(call, intruders);

  const blocked = (info?.blocked_user_ids ?? []).filter((id) => members.has(id));
  await Promise.all(blocked.map((userId) => call.unblockUser({ user_id: userId })));

  return { live: participants.some((id) => members.has(id)) };
};

/**
 * Takes these people out of a group's call for good: they have left the group,
 * or the sweep found them in a call that is not theirs. Nothing to do for a
 * group that has never called.
 */
const removeFromCall = async (groupId, userIds) => {
  const client = serverClient();
  const ids = [...new Set(userIds.map(idOf))];
  if (!client || !ids.length) return;
  const call = callOf(client, groupId);
  try {
    await call.get();
  } catch (err) {
    if (isNotFound(err)) return;
    throw err;
  }
  await shutOut(call, ids);
};

/**
 * Every call Stream says is happening now. Resolves to
 *   [{ groupId, startedAt, participantIds }]
 * where participantIds are the people in it, longest in it first.
 */
const ongoingCalls = async () => {
  const client = serverClient();
  if (!client) return [];
  const found = [];
  let next;
  // A few pages at most: far more live calls than this app will ever have.
  for (let page = 0; page < 10; page += 1) {
    // eslint-disable-next-line no-await-in-loop
    const response = await client.video.queryCalls({
      filter_conditions: { ongoing: true },
      limit: 100,
      ...(next ? { next } : {}),
    });
    for (const { call } of response.calls ?? []) {
      if (call?.type !== CALL_TYPE) continue;
      found.push({
        groupId: call.id,
        startedAt: call.session?.started_at ? new Date(call.session.started_at) : null,
        participantIds: participantIdsOf(call),
      });
    }
    next = response.next;
    if (!next) break;
  }
  return found;
};

/**
 * Takes everyone out of a group's call, leaving the call itself open for the
 * next one. Not end(): an ended call can only be joined again with Stream's
 * JOIN_ENDED_CALL permission, and every group reuses one call id for good, so
 * ending it would stop that group calling at all. Resolves to the ids removed.
 */
const removeEveryone = async (groupId) => {
  const client = serverClient();
  if (!client) return [];
  const call = callOf(client, groupId);
  const { call: info } = await call.get();
  const userIds = participantIdsOf(info);
  // Not blocked: they may call again as soon as they have credits.
  await Promise.allSettled(userIds.map((userId) => call.kickUser({ user_id: userId })));
  return userIds;
};

module.exports = {
  CALL_TYPE,
  MEMBER_ROLE,
  outside,
  issueToken,
  prepareCall,
  removeFromCall,
  ongoingCalls,
  removeEveryone,
  participantIdsOf,
  // Whether keys are set, without making a client.
  isConfigured: () => hasKeys(integrations.stream()),
};
