const mongoose = require('mongoose');
const Group = require('../models/Group');
const streamService = require('./stream.service');

/**
 * Keeps each group's call to the group's members, after the call has begun.
 *
 * Joining is checked before it happens (POST /stream/call-join makes the call's
 * Stream members the group's members, and the locked call type lets only them
 * in). This covers what can change once someone is in:
 *  - memberLeft: someone left the group or was removed from it, so they come
 *    out of its call at once
 *  - sweep: once a minute, anyone in a group's call who is not in the group is
 *    taken out of it. The safety net for a call type that is not locked yet,
 *    and for a removal that could not reach Stream at the time.
 */

const idOf = (value) => String(value?._id ?? value);

/**
 * A member has gone from the group (groupService.detachMember). Not awaited
 * there, and never throws: leaving a group must not wait on, or fail with,
 * Stream. The sweep catches anything this misses.
 */
const memberLeft = async (groupId, userId) => {
  try {
    if (!streamService.isConfigured()) return;
    await streamService.removeFromCall(groupId, [userId]);
  } catch (err) {
    console.error(`[calls] could not take ${idOf(userId)} out of the call in ${idOf(groupId)}:`, err.message);
  }
};

/**
 * One pass over every live call (walletSweep, every minute, on every server:
 * taking someone out twice is harmless). Resolves to what it did, for logs and
 * tests: [{ groupId, removed: [userId] }].
 */
const sweep = async () => {
  if (!streamService.isConfigured()) return [];
  const done = [];
  for (const call of await streamService.ongoingCalls()) {
    // Only group calls are this app's to police.
    if (!call.participantIds.length || !mongoose.isValidObjectId(call.groupId)) continue;
    // eslint-disable-next-line no-await-in-loop
    const group = await Group.findById(call.groupId).select('members').lean();
    // A group that no longer exists has no members left to call.
    const members = new Set((group?.members ?? []).map(idOf));
    const outsiders = call.participantIds.filter((id) => !members.has(id));
    if (!outsiders.length) continue;
    try {
      // eslint-disable-next-line no-await-in-loop
      await streamService.removeFromCall(call.groupId, outsiders);
      console.warn(`[calls] took ${outsiders.length} non-member(s) out of the call in ${call.groupId}`);
      done.push({ groupId: call.groupId, removed: outsiders });
    } catch (err) {
      console.error(`[calls] could not clear outsiders from ${call.groupId}:`, err.message);
    }
  }
  return done;
};

module.exports = { memberLeft, sweep };
