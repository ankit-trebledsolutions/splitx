const mongoose = require('mongoose');
const CallSession = require('../models/CallSession');
const Group = require('../models/Group');
const realtime = require('../realtime/socket');
const walletService = require('./wallet.service');
const streamService = require('./stream.service');
const groupService = require('./group.service');
const messageService = require('./message.service');
const callRing = require('./callRing.service');

/**
 * Credits for group calls. Whoever starts a call pays for each started block of
 * minutes (WalletSettings.callBlockMinutes) at the price of `callBlock`; the
 * people who join pay nothing. Free while that price is 0.
 *
 * What the app says is only a hint. The bill comes from the sweep, which asks
 * Stream which calls are really happening: a call the app never announced is
 * found and billed, and one the app called "ended" too early carries on with
 * the same session rather than being charged its first block again.
 */

const MINUTE_MS = 60 * 1000;
// A session is not called gone until Stream has had this long to show the
// call: the app opens it just before it joins.
const JOIN_GRACE_MS = 2 * MINUTE_MS;
// Two members starting a call in the same moment: the second joins the first's
// session rather than closing it.
const SAME_START_MS = 15 * 1000;
// How long before the next block the payer is warned that it cannot be paid.
const WARN_BEFORE_MS = 90 * 1000;

const chargeKeyOf = (sessionId, block) => `call:${sessionId}:${block}`;

// Blocks started so far: the first one the moment the call begins.
const blocksDue = (startedAt, blockMinutes, now = Date.now()) =>
  Math.floor(Math.max(0, now - new Date(startedAt).getTime()) / (blockMinutes * MINUTE_MS)) + 1;

const close = (filter, reason) =>
  CallSession.updateMany(
    { ...filter, status: 'active' },
    { $set: { status: 'ended', endedAt: new Date(), endReason: reason } }
  );

/**
 * Closes these sessions, giving back the first block of each one the sweep
 * never saw live: that call most likely never connected (the phone paid, then
 * failed to join). A call shorter than a minute that skipped "ended" is given
 * back too; that is the cheaper mistake.
 */
const closeUnlessSeen = async (sessions, reason) => {
  for (const session of sessions) {
    // eslint-disable-next-line no-await-in-loop
    const closed = await close({ _id: session._id }, reason);
    if (closed.modifiedCount === 1 && !session.seenLive) {
      // eslint-disable-next-line no-await-in-loop
      await walletService.refundQuietly(chargeKeyOf(session._id, 1));
    }
  }
};

/**
 * The app is about to start a call in an empty room (POST /stream/call-start).
 * Charges the first block before anyone joins, so someone without credits is
 * stopped before the group's phones ring. Resolves to what the app shows:
 *   { billed: false }                          free, or joining a call just started
 *   { billed: true, price, blockMinutes }
 * Throws 402 NO_CREDITS when the first block cannot be paid.
 */
const start = async (userId, groupId) => {
  await groupService.getGroupForMember(groupId, userId);
  const settings = await walletService.getSettings();
  const price = settings.prices.callBlock;
  if (!(price > 0)) return { billed: false };

  // The app only asks when the room is empty, so a session still open is from
  // a call that ended without saying so (or one this person paid for and then
  // failed to join). Unless it is seconds old: then a member started at the
  // same moment, and this person is joining theirs.
  const stale = await CallSession.find({
    group: groupId,
    status: 'active',
    startedAt: { $lt: new Date(Date.now() - SAME_START_MS) },
  })
    .select('seenLive')
    .lean();
  await closeUnlessSeen(stale, 'replaced');
  let session;
  try {
    session = await CallSession.create({ group: groupId, startedBy: userId });
  } catch (err) {
    if (err.code !== 11000) throw err;
    return { billed: false };
  }

  try {
    await walletService.charge(userId, {
      feature: 'call',
      key: chargeKeyOf(session._id, 1),
      ref: String(session._id),
    });
  } catch (err) {
    await CallSession.deleteOne({ _id: session._id });
    throw err;
  }
  await CallSession.updateOne({ _id: session._id }, { $max: { blocksCharged: 1 } });
  return { billed: true, price, blockMinutes: settings.callBlockMinutes };
};

// The last person left, says the app (POST /stream/call-event "ended").
const ended = (groupId) => close({ group: groupId }, 'left');

/**
 * The session a live call is billed to: the open one, one closed a moment ago
 * by an early "ended", or a new one for a call nobody announced, paid by
 * whoever has been in it longest (if they belong to the group).
 */
const sessionFor = async (call, now) => {
  const open = await CallSession.findOne({ group: call.groupId, status: 'active' }).lean();
  if (open) return open;

  try {
    const resumed = await CallSession.findOneAndUpdate(
      {
        group: call.groupId,
        status: 'ended',
        endReason: 'left',
        endedAt: { $gte: new Date(now - JOIN_GRACE_MS) },
      },
      { $set: { status: 'active', endedAt: null, endReason: null } },
      { sort: { endedAt: -1 }, new: true }
    ).lean();
    if (resumed) return resumed;

    if (!call.firstUserId || !mongoose.isValidObjectId(call.firstUserId)) return null;
    const isMember = await Group.exists({ _id: call.groupId, members: call.firstUserId });
    if (!isMember) return null;
    return (
      await CallSession.create({
        group: call.groupId,
        startedBy: call.firstUserId,
        startedAt: call.startedAt ?? new Date(now),
      })
    ).toObject();
  } catch (err) {
    // Another server opened it first.
    if (err.code !== 11000) throw err;
    return CallSession.findOne({ group: call.groupId, status: 'active' }).lean();
  }
};

/**
 * Out of credits: everyone is taken out of the call, and the group is told why.
 * The event goes to the whole group so every phone in the call lets go of it;
 * `payerId` lets the payer's phone say it was their credits. Someone who joins
 * again is found by the next sweep and billed afresh.
 */
const endForCredits = async (session) => {
  const closed = await CallSession.updateOne(
    { _id: session._id, status: 'active' },
    { $set: { status: 'ended', endedAt: new Date(), endReason: 'no_credits' } }
  );
  if (closed.modifiedCount !== 1) return;

  const groupId = String(session.group);
  try {
    await streamService.removeEveryone(groupId);
  } catch (err) {
    console.error(`[calls] could not clear the call in ${groupId}:`, err.message);
  }
  realtime.emitToGroup(groupId, 'wallet:call-ended', {
    groupId,
    reason: 'no_credits',
    payerId: String(session.startedBy),
  });
  const group = await Group.findById(groupId).select('members').lean();
  if (group) callRing.end({ group, by: session.startedBy });
  await messageService
    .postSystem(groupId, 'Call ended: not enough credits')
    .catch((err) => console.error(`[calls] chat line for ${groupId} failed:`, err.message));
};

const billCall = async (call, settings, now) => {
  const session = await sessionFor(call, now);
  if (!session) return;
  if (!session.seenLive) await CallSession.updateOne({ _id: session._id }, { $set: { seenLive: true } });

  const blockMs = settings.callBlockMinutes * MINUTE_MS;
  const due = blocksDue(session.startedAt, settings.callBlockMinutes, now);
  for (let block = session.blocksCharged + 1; block <= due; block += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await walletService.charge(session.startedBy, {
        feature: 'call',
        key: chargeKeyOf(session._id, block),
        ref: String(session._id),
      });
    } catch (err) {
      if (err.code !== 'NO_CREDITS') throw err;
      // eslint-disable-next-line no-await-in-loop
      await endForCredits(session);
      return;
    }
    // A paid block also clears an old warning, so the next shortage is told too.
    // eslint-disable-next-line no-await-in-loop
    await CallSession.updateOne(
      { _id: session._id },
      { $max: { blocksCharged: block }, $set: { warned: false } }
    );
    session.warned = false;
  }

  const nextBlockAt = new Date(session.startedAt).getTime() + due * blockMs;
  if (session.warned || nextBlockAt - now > WARN_BEFORE_MS) return;
  if ((await walletService.balanceOf(session.startedBy)) >= settings.prices.callBlock) return;
  const claimed = await CallSession.updateOne(
    { _id: session._id, warned: false },
    { $set: { warned: true } }
  );
  if (claimed.modifiedCount === 1) {
    realtime.emitToUser(session.startedBy, 'wallet:call-low', {
      groupId: String(session.group),
      endsAt: new Date(nextBlockAt),
    });
  }
};

/**
 * One pass over every live call (walletSweep, every minute, on every server:
 * charge keys and the one-open-session index make two passes harmless).
 */
const sweep = async (now = Date.now()) => {
  const settings = await walletService.getSettings();
  if (!(settings.prices.callBlock > 0)) {
    // Calls were made free: nothing open is billed any further.
    await close({}, 'free');
    return;
  }
  if (!streamService.isConfigured()) return;

  const live = new Map();
  for (const call of await streamService.ongoingCalls()) {
    if (mongoose.isValidObjectId(call.groupId)) live.set(call.groupId, call);
  }

  const open = await CallSession.find({ status: 'active' }).select('group startedAt seenLive').lean();
  const gone = open.filter(
    (session) =>
      !live.has(String(session.group)) && now - new Date(session.startedAt).getTime() >= JOIN_GRACE_MS
  );
  await closeUnlessSeen(gone, 'gone');

  for (const call of live.values()) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await billCall(call, settings, now);
    } catch (err) {
      console.error(`[calls] billing ${call.groupId} failed:`, err.message);
    }
  }
};

module.exports = { start, ended, sweep, blocksDue, chargeKeyOf };
