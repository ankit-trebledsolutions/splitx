const Reminder = require('../models/Reminder');
const Notification = require('../models/Notification');
const pushService = require('./push.service');
const { WITH, audienceOf, ringersOf, repeatUntilFor } = require('./reminder.service');

/**
 * The server's part at reminder time. The alarm itself rings from each phone
 * (see reminderSync.service), so this is the backup and the bookkeeping:
 *
 *  - the reminder goes into the in-app notification list of everyone it is for;
 *  - anyone whose phone never confirmed the alarm gets a plain push instead;
 *  - a weekly reminder moves on a week, until the trip is over.
 *
 * Switched on by config (env.reminderSweep), never by default outside
 * production: a developer's machine pointed at the shared database must not
 * start sending pushes to real people.
 */
const SWEEP_EVERY_MS = 30 * 1000;
// Found later than this (the server was asleep, or the reminder is older than
// this feature) it is closed quietly: a "due now" for something long past
// helps nobody.
const STALE_AFTER_MS = 15 * 60 * 1000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const BATCH = 100;

// The first weekly time still ahead of `now`, or null once the trip has ended.
const nextWeekly = (remindAt, now, until) => {
  let next = remindAt.getTime() + WEEK_MS;
  while (next <= now.getTime()) next += WEEK_MS;
  return until && next > until.getTime() ? null : new Date(next);
};

/**
 * listed: gets the in-app entry. Everyone it is for except those who switched
 *         this reminder off; a muted group still fills the list, as elsewhere.
 * pushed: gets the backup push. Those it should ring for whose phone has not
 *         confirmed the alarm.
 */
const recipientsOf = (reminder) => {
  const off = new Set(reminder.mutedBy.map(String));
  const armed = new Set(reminder.armedBy.map(String));
  return {
    listed: audienceOf(reminder).filter((id) => !off.has(id)),
    pushed: ringersOf(reminder).filter((id) => !armed.has(id)),
  };
};

const tell = async (reminder) => {
  const { listed, pushed } = recipientsOf(reminder);
  const groupId = reminder.group?._id ?? null;

  if (listed.length) {
    await Notification.insertMany(
      listed.map((user) => ({
        user,
        group: groupId,
        type: 'reminder',
        title: 'Reminder',
        body: `"${reminder.title}" is due now.`,
        // A task reminder opens its task.
        entityId: reminder.task ?? null,
      }))
    );
  }

  // Not awaited, like every push.
  pushService.sendToUsers(pushed, {
    title: '⏰ Reminder',
    body: reminder.title,
    data: {
      type: 'reminder',
      reminderId: String(reminder._id),
      ...(groupId ? { groupId: String(groupId) } : {}),
      ...(reminder.task ? { entityId: String(reminder.task) } : {}),
    },
  });
};

// True when this call was the one that dealt with it.
const fire = async (due, now) => {
  // Claimed in a single step, so two server instances never both handle it,
  // and an edit that moved the time since it was read is left alone.
  const reminder = await Reminder.findOneAndUpdate(
    { _id: due._id, enabled: true, firedAt: null, remindAt: due.remindAt },
    { $set: { firedAt: now } },
    { new: true, timestamps: false }
  ).populate(WITH);
  if (!reminder) return false;

  if (now.getTime() - reminder.remindAt.getTime() <= STALE_AFTER_MS) {
    try {
      await tell(reminder);
    } catch (err) {
      // It stays claimed, so nobody is told twice. A weekly one must still be
      // moved on below, or it would never come round again.
      console.error(`[reminders] could not announce ${reminder._id}:`, err.message);
    }
  }

  if (reminder.repeatWeekly) {
    const next = nextWeekly(reminder.remindAt, now, repeatUntilFor(reminder.group));
    if (next) {
      // armedBy is kept: a phone re-arms a weekly alarm by itself when it rings.
      await Reminder.updateOne(
        { _id: reminder._id },
        { $set: { remindAt: next, firedAt: null } },
        { timestamps: false }
      );
    }
  }
  return true;
};

const sweepOnce = async (now = new Date()) => {
  const due = await Reminder.find({ enabled: true, firedAt: null, remindAt: { $lte: now } })
    .select('remindAt')
    .sort({ remindAt: 1 })
    .limit(BATCH)
    .lean();

  let handled = 0;
  for (const reminder of due) {
    try {
      if (await fire(reminder, now)) handled += 1;
    } catch (err) {
      console.error(`[reminders] could not handle ${reminder._id}:`, err.message);
    }
  }
  return handled;
};

let timer = null;
let busy = false;

const tick = async () => {
  if (busy) return; // a slow pass must not overlap the next one
  busy = true;
  try {
    await sweepOnce();
  } catch (err) {
    console.error('[reminders] sweep failed:', err.message);
  } finally {
    busy = false;
  }
};

const start = () => {
  if (timer) return;
  timer = setInterval(tick, SWEEP_EVERY_MS);
  timer.unref();
  tick();
};

const stop = () => {
  clearInterval(timer);
  timer = null;
};

module.exports = { start, stop, sweepOnce, nextWeekly, recipientsOf, STALE_AFTER_MS };
