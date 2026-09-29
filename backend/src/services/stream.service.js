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

module.exports = { issueToken };
