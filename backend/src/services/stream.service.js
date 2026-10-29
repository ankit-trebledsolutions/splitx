const { StreamClient } = require('@stream-io/node-sdk');
const integrations = require('../integrations/store');

// One client per set of keys, made when it is first needed. The keys can be
// changed in the admin panel while the server runs, so the client cannot be
// built once at start-up and kept.
let current = { id: null, client: null };
const clientFor = ({ apiKey, apiSecret }) => {
  const id = `${apiKey}:${apiSecret}`;
  if (current.id !== id) current = { id, client: new StreamClient(apiKey, apiSecret) };
  return current.client;
};

// Long enough that the app isn't mid-call when it expires; the mobile SDK
// re-fetches from this endpoint whenever it needs a fresh one.
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

// The server's own Stream client, or null while no keys are set.
const serverClient = () => {
  const keys = integrations.stream();
  return keys.apiKey && keys.apiSecret ? clientFor(keys) : null;
};

/**
 * Every call Stream says is happening now. Each group has one call, whose id is
 * the group's id (see the app's ActiveCallProvider). Resolves to
 *   [{ groupId, startedAt, firstUserId }]
 * where firstUserId is whoever has been in the call longest.
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
      if (call?.type !== 'default') continue;
      const participants = [...(call.session?.participants ?? [])].sort(
        (a, b) => new Date(a.joined_at) - new Date(b.joined_at)
      );
      found.push({
        groupId: call.id,
        startedAt: call.session?.started_at ? new Date(call.session.started_at) : null,
        firstUserId: participants[0]?.user?.id ?? null,
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
  const call = client.video.call('default', String(groupId));
  const { call: current } = await call.get();
  const userIds = [
    ...new Set((current?.session?.participants ?? []).map((p) => p.user?.id).filter(Boolean)),
  ];
  // Not blocked: they may call again as soon as they have credits.
  await Promise.allSettled(userIds.map((userId) => call.kickUser({ user_id: userId })));
  return userIds;
};

module.exports = { issueToken, ongoingCalls, removeEveryone, isConfigured: () => serverClient() !== null };
