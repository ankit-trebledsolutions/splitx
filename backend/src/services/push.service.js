const User = require('../models/User');

// Expo's push service relays to FCM (Android) and APNs (iOS).
const EXPO_SEND_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
const CHUNK_SIZE = 100; // Expo's per-request limit
const RECEIPT_DELAY_MS = 60 * 1000;
const MAX_TOKENS_PER_USER = 10;

const isExpoToken = (token) => /^Expo(nent)?PushToken\[[^\]]+\]$/.test(token);

const chunk = (items, size) => {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
};

const post = async (url, body) => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Expo push responded ${res.status}`);
  return (await res.json()).data;
};

/**
 * A device belongs to whoever logged in on it last: the token is moved off any
 * other account so a shared phone never shows someone else's notifications.
 */
const registerToken = async (userId, token) => {
  await User.updateMany({ _id: { $ne: userId }, pushTokens: token }, { $pull: { pushTokens: token } });
  // Pull then push (Mongo can't do both on one field at once) so the token lands
  // at the end, and keep only the newest few devices.
  await User.updateOne({ _id: userId }, { $pull: { pushTokens: token } });
  await User.updateOne(
    { _id: userId },
    { $push: { pushTokens: { $each: [token], $slice: -MAX_TOKENS_PER_USER } } }
  );
};

const removeToken = (userId, token) =>
  User.updateOne({ _id: userId }, { $pull: { pushTokens: token } });

const forgetTokens = async (tokens) => {
  if (!tokens.length) return;
  await User.updateMany({ pushTokens: { $in: tokens } }, { $pull: { pushTokens: { $in: tokens } } });
};

// Expo reports uninstalled apps a little after sending; drop those tokens.
const checkReceipts = async (tokenByTicket) => {
  const dead = [];
  for (const ids of chunk([...tokenByTicket.keys()], 300)) {
    const receipts = await post(EXPO_RECEIPTS_URL, { ids });
    for (const [id, receipt] of Object.entries(receipts ?? {})) {
      if (receipt.status !== 'error') continue;
      if (receipt.details?.error === 'DeviceNotRegistered') dead.push(tokenByTicket.get(id));
      else console.error('Push receipt error:', receipt.details?.error ?? receipt.message);
    }
  }
  await forgetTokens(dead);
};

/**
 * Sends one push to every device of the given users. Never throws: a push
 * failure must not fail (or slow down) the action that caused it.
 */
const sendToUsers = async (userIds, { title, body, data = {} }) => {
  try {
    if (!userIds.length) return;
    const users = await User.find({ _id: { $in: userIds }, 'pushTokens.0': { $exists: true } })
      .select('pushTokens')
      .lean();
    const tokens = [...new Set(users.flatMap((u) => u.pushTokens))].filter(isExpoToken);
    if (!tokens.length) return;

    const dead = [];
    const tokenByTicket = new Map();

    for (const batch of chunk(tokens, CHUNK_SIZE)) {
      const tickets = await post(
        EXPO_SEND_URL,
        batch.map((to) => ({
          to,
          title,
          body,
          data,
          sound: 'default',
          priority: 'high',
          channelId: 'default',
        }))
      );
      tickets.forEach((ticket, i) => {
        if (ticket.status === 'ok') tokenByTicket.set(ticket.id, batch[i]);
        else if (ticket.details?.error === 'DeviceNotRegistered') dead.push(batch[i]);
        else console.error('Push ticket error:', ticket.details?.error ?? ticket.message);
      });
    }

    await forgetTokens(dead);

    if (tokenByTicket.size) {
      setTimeout(() => {
        checkReceipts(tokenByTicket).catch((err) =>
          console.error('Push receipt check failed:', err.message)
        );
      }, RECEIPT_DELAY_MS).unref();
    }
  } catch (err) {
    console.error('Push send failed:', err.message);
  }
};

module.exports = { isExpoToken, registerToken, removeToken, sendToUsers };
