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
 * minutes (WalletSettings.callBlockMinutes) at the price of `callBlock`, while
 * they are in it; the people who join pay nothing (the app's Wallet screen says
 * "Joining is free"). Once the starter has left a call that others stay on, the
 * rest of it is free. Only a member of the group ever pays. Free while that
 * price is 0.
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
// How long the payer may be out of the call before their bill stops: one sweep
// apart, so a phone that drops off for a moment does not end it.
const PAYER_AWAY_MS = 45 * 1000;

const chargeKeyOf = (sessionId, block) => `call:${sessionId}:${block}`;

// Blocks started so far: the first one the moment the call begins.
const blocksDue = (startedAt, blockMinutes, now = Date.now()) =>
  Math.floor(Math.max(0, now - new Date(startedAt).getTime()) / (blockMinutes * MINUTE_MS)) + 1;

const timeOf = (date) => (date ? new Date(date).getTime() : null);

const close = (filter, reason, at = new Date()) =>
  CallSession.updateMany(
    { ...filter, status: 'active' },
    { $set: { status: 'ended', endedAt: at, endReason: reason } }
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
 * The session a live call is billed to, or null when nobody pays for it.
 * `present` is the group's members in the call, longest in it first.
 *  - the open one
 *  - one closed a moment ago by an early "ended" (the app said the last person
 *    left, but the call carried on)
 *  - none, when the person paying left this call earlier and is not back in
 *    it: the rest of it is free, as joining is
 *  - otherwise a new one, paid by whoever has been in the call longest: the
 *    starter back in their own call (billed afresh from now), or a call nobody
 *    announced (billed from when it began, or from the end of the last bill in
 *    this same call, so no block is charged twice). Never from further back
 *    than one sweep could have missed it.
 */
const sessionFor = async (call, present, now) => {
  const open = await CallSession.findOne({ group: call.groupId, status: 'active' }).lean();
  if (open) return open;

  try {
    const last = await CallSession.findOne({ group: call.groupId, status: 'ended' })
      .sort({ endedAt: -1 })
      .lean();
    const lastEnded = timeOf(last?.endedAt);
    if (last?.endReason === 'left' && lastEnded >= now - JOIN_GRACE_MS) {
      const resumed = await CallSession.findOneAndUpdate(
        { _id: last._id, status: 'ended' },
        { $set: { status: 'active', endedAt: null, endReason: null } },
        { new: true }
      ).lean();
      if (resumed) return resumed;
    }

    const callStart = timeOf(call.startedAt);
    // The last bill ended during this call, not an earlier one.
    const sameCall = lastEnded !== null && callStart !== null && lastEnded >= callStart;
    let payer;
    let from;
    if (sameCall && last.endReason === 'payer_left') {
      if (!present.includes(String(last.startedBy))) return null;
      payer = String(last.startedBy);
      from = now;
    } else {
      [payer] = present;
      if (!payer) return null;
      from = sameCall ? lastEnded : callStart ?? now;
    }
    return (
      await CallSession.create({
        group: call.groupId,
        startedBy: payer,
        startedAt: new Date(Math.max(from, now - JOIN_GRACE_MS)),
        seenLive: true,
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

/**
 * The payer is not in the call (or no longer in the group) while it goes on:
 * nothing more is charged to them. A phone that dropped off for a moment is
 * back by the next sweep and carries on paying, blocks that came due included.
 * Still away then, they have left, and their bill stops there.
 */
const payerAway = async (session, now) => {
  // Still joining: call-start charges before the phone is in the call.
  if (now - timeOf(session.startedAt) < JOIN_GRACE_MS) return;
  if (!session.payerAwaySince) {
    await CallSession.updateOne(
      { _id: session._id, status: 'active', payerAwaySince: null },
      { $set: { payerAwaySince: new Date(now) } }
    );
    return;
  }
  if (now - timeOf(session.payerAwaySince) < PAYER_AWAY_MS) return;
  await close({ _id: session._id }, 'payer_left', new Date(now));
};

const billCall = async (call, settings, now) => {
  const group = await Group.findById(call.groupId).select('members').lean();
  // Gone with its group: the access sweep empties the call.
  if (!group) return;
  const members = new Set(group.members.map(String));
  // Only a member of the group ever pays for its call.
  const present = call.participantIds.filter((id) => members.has(id));

  const session = await sessionFor(call, present, now);
  if (!session) return;
  if (!session.seenLive) await CallSession.updateOne({ _id: session._id }, { $set: { seenLive: true } });

  if (!present.includes(String(session.startedBy))) {
    await payerAway(session, now);
    return;
  }
  if (session.payerAwaySince) {
    await CallSession.updateOne({ _id: session._id }, { $set: { payerAwaySince: null } });
  }

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

module.exports = { start, ended, sweep, blocksDue, chargeKeyOf, JOIN_GRACE_MS, PAYER_AWAY_MS };
