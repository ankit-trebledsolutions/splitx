const { StreamClient } = require('@stream-io/node-sdk');
const env = require('../config/env');

const streamClient = new StreamClient(env.streamApiKey, env.streamApiSecret);

// Long enough that the app isn't mid-call when it expires; the mobile SDK
// re-fetches from this endpoint whenever it needs a fresh one.
const TOKEN_TTL_SECONDS = 60 * 60 * 24;

const issueToken = async (user) => {
  const userId = user._id.toString();

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
    apiKey: env.streamApiKey,
    token,
    user: { id: userId, name: user.name },
  };
};

module.exports = { issueToken };
