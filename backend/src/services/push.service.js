const User = require('../models/User');
const Reminder = require('../models/Reminder');

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
 * `armedBy` on a reminder says "this person's phone will ring by itself", and
 * that holds back the backup push at reminder time (reminderSweep.service). It
 * is only known to be true while the phone that said so is still theirs. When
 * a phone signs out, is replaced, or loses the app, the mark is cleared; the
 * next phone of theirs to sync sets it again.
 */
const forgetArmed = async (userIds) => {
  if (!userIds.length) return;
  await Reminder.updateMany(
    { armedBy: { $in: userIds } },
    { $pull: { armedBy: { $in: userIds } } },
    { timestamps: false }
  );
};

/**
 * A device belongs to whoever logged in on it last: the token is moved off any
 * other account so a shared phone never shows someone else's notifications.
 */
const registerToken = async (userId, token) => {
  // A token this account has not had before means a new phone or a reinstall.
  const known = await User.exists({ _id: userId, pushTokens: token });
  const previousOwners = await User.find({ _id: { $ne: userId }, pushTokens: token }).distinct('_id');

  await User.updateMany({ _id: { $ne: userId }, pushTokens: token }, { $pull: { pushTokens: token } });
  // Pull then push (Mongo can't do both on one field at once) so the token lands
  // at the end, and keep only the newest few devices.
  await User.updateOne({ _id: userId }, { $pull: { pushTokens: token } });
  await User.updateOne(
    { _id: userId },
    { $push: { pushTokens: { $each: [token], $slice: -MAX_TOKENS_PER_USER } } }
  );

  await forgetArmed(known ? previousOwners : [...previousOwners, userId]);
};

const removeToken = async (userId, token) => {
  await User.updateOne({ _id: userId }, { $pull: { pushTokens: token } });
  await forgetArmed([userId]);
};

const forgetTokens = async (tokens) => {
  if (!tokens.length) return;
  const owners = await User.find({ pushTokens: { $in: tokens } }).distinct('_id');
  await User.updateMany({ pushTokens: { $in: tokens } }, { $pull: { pushTokens: { $in: tokens } } });
  await forgetArmed(owners);
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

// A push the person sees, on the "default" channel the app creates.
const visibleMessage = ({ title, body, data }) => ({
  title,
  body,
  data,
  sound: 'default',
  priority: 'high',
  channelId: 'default',
});

// A push nobody sees: no title or body, so the phone hands it to the app's
// background task instead of the notification tray. The content-available flag
// is what makes iOS do the same; Expo has spelled it both ways over time and
// accepts either, so both are sent.
const silentMessage = ({ data }) => ({
  data,
  priority: 'high',
  contentAvailable: true,
  _contentAvailable: true,
});

/**
 * Sends one push to every device of the given users. Never throws: a push
 * failure must not fail (or slow down) the action that caused it.
 *
 * silent: deliver `data` to the app without showing anything (used to set or
 * drop reminder alarms on a phone whose app is closed).
 */
const sendToUsers = async (userIds, { title, body, data = {} }, { silent = false } = {}) => {
  try {
    if (!userIds.length) return;
    const message = silent ? silentMessage({ data }) : visibleMessage({ title, body, data });
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
        batch.map((to) => ({ to, ...message }))
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
