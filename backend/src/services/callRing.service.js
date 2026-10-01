const pushService = require('./push.service');
const realtime = require('../realtime/socket');

/**
 * Makes a group call ring on its members' phones.
 *
 * The call itself lives in Stream, which does not know who ought to be told.
 * The app says when the first person joins a group's call and when the last
 * one leaves (stream.controller); this turns those two moments into "ring" and
 * "stop ringing" on everyone else's phone.
 *
 * The ring goes out as an ordinary push, with a title and a body. An Android
 * app that knows about calls takes it before anything is shown and rings like
 * a phone call instead; an iPhone, or an older build, shows it as the
 * notification it looks like. The "stop" is a silent push: there is nothing to
 * show for it. Both also go over the socket, which is quicker while the app is
 * open; the phone ignores whichever of the two arrives second.
 */
const TYPE = 'call';

// How long a phone rings before the call counts as missed (CallCenter.RING_MS
// in the app). A ring that cannot reach a phone within that time is dropped
// rather than delivered late, for a call that may be long over.
const RING_SECONDS = 45;

// A second "started" for the same group this soon is the same call: two people
// pressing the button together, or the app sending it again.
const SAME_CALL_MS = 15 * 1000;

const idOf = (value) => String(value?._id ?? value);

// groupId -> when its phones were last told to ring.
const lastRing = new Map();

const forgetOldRings = (now) => {
  if (lastRing.size < 500) return;
  for (const [groupId, at] of lastRing) {
    if (now - at >= SAME_CALL_MS) lastRing.delete(groupId);
  }
};

/**
 * Everyone in the group except the caller, and except those who muted it: a
 * muted group does not ring, the same as its reminders.
 */
const ringersOf = (group, callerId) => {
  const muted = new Set((group.mutedBy ?? []).map(idOf));
  return group.members.map(idOf).filter((id) => id !== idOf(callerId) && !muted.has(id));
};

const describe = (video) => {
  if (video === true) return 'group video call';
  if (video === false) return 'group voice call';
  return 'group call';
};

/**
 * The first person has joined: ring the others. `video` is whether they
 * started it with the camera on; an app from before calls rang does not say,
 * and the phones are then told only that it is a call.
 *
 * Resolves to what was sent, or null when this is the call already ringing.
 * Never throws: a ring that fails must not fail the call.
 */
const ring = async ({ group, caller, video, now = Date.now() }) => {
  try {
    const groupId = idOf(group);
    const previous = lastRing.get(groupId);
    if (previous !== undefined && now - previous < SAME_CALL_MS) return null;
    forgetOldRings(now);
    lastRing.set(groupId, now);

    const to = ringersOf(group, caller);
    const kind = typeof video === 'boolean' ? video : null;
    const data = {
      type: TYPE,
      action: 'ring',
      groupId,
      groupName: group.name,
      callerId: idOf(caller),
      callerName: caller.name,
      video: kind,
      at: now,
    };

    for (const userId of to) realtime.emitToUser(userId, 'call:ring', data);
    await pushService.sendToUsers(
      to,
      { title: group.name, body: `${caller.name} started a ${describe(kind)}`, data },
      { ttl: RING_SECONDS }
    );
    return { to, data };
  } catch (err) {
    console.error('Call ring failed:', err.message);
    return null;
  }
};

/**
 * The last person has left: phones still ringing stop, and show the call as
 * missed. Sent to those who muted the group as well; a phone that is not
 * ringing does nothing with it. Never throws.
 */
const end = async ({ group, by, now = Date.now() }) => {
  try {
    const groupId = idOf(group);
    // The next call in this group is a new one, however soon it starts.
    lastRing.delete(groupId);

    const to = group.members.map(idOf).filter((id) => id !== idOf(by));
    const data = { type: TYPE, action: 'end', groupId, at: now };

    for (const userId of to) realtime.emitToUser(userId, 'call:end', data);
    await pushService.sendToUsers(to, { data }, { silent: true, ttl: RING_SECONDS });
    return { to, data };
  } catch (err) {
    console.error('Call end not sent:', err.message);
    return null;
  }
};

module.exports = { TYPE, RING_SECONDS, SAME_CALL_MS, ringersOf, ring, end };
