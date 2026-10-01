const Reminder = require('../models/Reminder');
const Group = require('../models/Group');
const Task = require('../models/Task');
const ApiError = require('../utils/ApiError');
const groupService = require('./group.service');
const messageService = require('./message.service');
const notificationService = require('./notification.service');
const reminderSync = require('./reminderSync.service');
const realtime = require('../realtime/socket');

const DAY_MS = 24 * 60 * 60 * 1000;
// Room for the request to travel and for a phone clock that runs a little fast.
const PAST_GRACE_MS = 60 * 1000;
// "My reminders" keeps what already rang for this long before dropping it.
const RECENT_MS = 30 * DAY_MS;

const WITH = [
  { path: 'createdBy', select: 'name email' },
  { path: 'group', select: 'name startDate totalDays mutedBy members admin createdBy' },
];

const sameId = (a, b) => String(a) === String(b);
const has = (list, userId) => (list ?? []).some((id) => sameId(id, userId));
const idOf = (value) => String(value?._id ?? value);
const creatorId = (reminder) => idOf(reminder.createdBy);

/**
 * When a weekly reminder stops repeating: the end of the trip's last day. Null
 * (it repeats with no end) for groups without dates and for personal reminders.
 */
const repeatUntilFor = (group) => {
  if (!group?.startDate) return null;
  return new Date(new Date(group.startDate).getTime() + (group.totalDays ?? 1) * DAY_MS);
};

// Everyone the reminder is for, whether or not it rings for them.
const audienceOf = (reminder) =>
  reminder.scope === 'group' && reminder.group
    ? reminder.group.members.map(String)
    : [creatorId(reminder)];

/**
 * Whether it rings on this person's phone. Their own reminders ring even in a
 * group they have muted: muting a group silences what other people set.
 */
const ringsFor = (reminder, userId) => {
  if (!reminder.enabled || has(reminder.mutedBy, userId)) return false;
  return sameId(creatorId(reminder), userId) || !has(reminder.group?.mutedBy, userId);
};

const ringersOf = (reminder) => audienceOf(reminder).filter((id) => ringsFor(reminder, id));

// What a phone needs to set the alarm. The same for everyone it rings for.
const alarmOf = (reminder) => ({
  _id: String(reminder._id),
  title: reminder.title,
  subtitle: reminder.subtitle,
  remindAt: reminder.remindAt,
  group: reminder.group ? idOf(reminder.group) : null,
  groupName: reminder.group?.name ?? null,
  task: reminder.task ? String(reminder.task) : null,
  repeatWeekly: reminder.repeatWeekly,
  repeatUntil: reminder.repeatWeekly ? repeatUntilFor(reminder.group) : null,
});

/**
 * A reminder as one person sees it: who else muted it or has it set is nobody
 * else's business, so those lists become `muted` and `rings` for the asker.
 */
const present = (reminder, userId) => {
  const { mutedBy, armedBy, group, ...rest } = reminder.toObject();
  return {
    ...rest,
    group: group ? group._id : null,
    groupName: group?.name ?? null,
    muted: has(mutedBy, userId),
    rings: ringsFor(reminder, userId),
    repeatUntil: rest.repeatWeekly ? repeatUntilFor(group) : null,
  };
};

const assertFuture = (remindAt) => {
  if (new Date(remindAt).getTime() < Date.now() - PAST_GRACE_MS) {
    throw ApiError.badRequest('Pick a time in the future for the reminder');
  }
};

// Reminders this person may see: their groups' shared ones and their own private ones.
const visibleTo = async (userId) => {
  const groupIds = await Group.find({ members: userId }).distinct('_id');
  return {
    $or: [
      { scope: 'group', group: { $in: groupIds } },
      { scope: 'me', createdBy: userId },
    ],
  };
};

// Open screens reload their list. A private reminder only tells its owner.
const broadcast = (reminder, { toGroup = reminder.scope === 'group' } = {}) => {
  const groupId = reminder.group ? idOf(reminder.group) : null;
  if (toGroup && groupId) realtime.emitToGroup(groupId, 'reminder:changed', { groupId });
  else realtime.emitToUser(creatorId(reminder), 'reminder:changed', { groupId });
};

// A shared reminder shows up in the group chat and in the others' notifications.
const announce = async (reminder, actorId) => {
  const groupId = idOf(reminder.group);
  await messageService.postActivity({
    groupId,
    senderId: actorId,
    type: 'reminder',
    text: reminder.title,
    reminder: reminder._id,
  });
  await notificationService.notifyGroup({
    groupId,
    actorId,
    type: 'reminder',
    title: 'Reminder Set',
    body: `${reminder.createdBy?.name ?? 'Someone'} set a reminder: "${reminder.title}".`,
  });
};

const listReminders = async (groupId, userId) => {
  await groupService.getGroupForMember(groupId, userId);
  // Personal reminders are only visible to whoever made them.
  const reminders = await Reminder.find({
    group: groupId,
    $or: [{ scope: 'group' }, { scope: 'me', createdBy: userId }],
  })
    .populate(WITH)
    .sort({ remindAt: 1 });
  return reminders.map((reminder) => present(reminder, userId));
};

// Everything that can ring for this person, across groups, plus their personal ones.
const listMine = async (userId) => {
  const since = new Date(Date.now() - RECENT_MS);
  const reminders = await Reminder.find({
    $and: [
      await visibleTo(userId),
      // A weekly one keeps its first date until the sweep moves it on, so it
      // stays listed however old that date is.
      { $or: [{ remindAt: { $gte: since } }, { repeatWeekly: true }] },
    ],
  })
    .populate(WITH)
    .sort({ remindAt: 1 })
    .limit(300);
  return reminders.map((reminder) => present(reminder, userId));
};

// groupId null makes a personal reminder: no group, no chat card, only for its owner.
const createReminder = async (userId, groupId, payload) => {
  if (groupId) await groupService.getGroupForMember(groupId, userId);
  assertFuture(payload.remindAt);
  if (groupId && payload.task && !(await Task.exists({ _id: payload.task, group: groupId }))) {
    throw ApiError.badRequest('That task is not in this group');
  }

  const reminder = await Reminder.create({
    group: groupId ?? null,
    title: payload.title,
    subtitle: payload.subtitle,
    remindAt: payload.remindAt,
    scope: groupId ? payload.scope : 'me',
    repeatWeekly: payload.repeatWeekly ?? false,
    icon: payload.icon,
    task: groupId ? payload.task ?? null : null,
    createdBy: userId,
  });

  await reminder.populate(WITH);
  // Private reminders stay private: no chat card, nobody else is told.
  if (reminder.scope === 'group') await announce(reminder, userId);

  reminderSync.upsert(ringersOf(reminder), alarmOf(reminder));
  broadcast(reminder);
  return present(reminder, userId);
};

const getReminderFor = async (reminderId, userId) => {
  const reminder = await Reminder.findById(reminderId).populate(WITH);
  if (!reminder) throw ApiError.notFound('Reminder not found');
  if (reminder.scope === 'me') {
    if (!sameId(creatorId(reminder), userId)) throw ApiError.forbidden('This reminder is private');
  } else if (!has(reminder.group?.members, userId)) {
    throw ApiError.forbidden('You are not a member of this group');
  }
  return reminder;
};

const updateReminder = async (reminderId, userId, payload) => {
  const reminder = await getReminderFor(reminderId, userId);
  const before = { scope: reminder.scope, ringers: ringersOf(reminder) };

  // A one-off that already rang and is now made weekly has turns still to come:
  // the sweep must pick it up again to move it on.
  if (payload.repeatWeekly === true && !reminder.repeatWeekly) reminder.firedAt = null;

  for (const field of ['title', 'subtitle', 'repeatWeekly', 'icon', 'enabled']) {
    if (payload[field] !== undefined) reminder[field] = payload[field];
  }

  if (payload.remindAt !== undefined && payload.remindAt.getTime() !== reminder.remindAt.getTime()) {
    assertFuture(payload.remindAt);
    reminder.remindAt = payload.remindAt;
    // A new time is a new alarm: no phone has it yet and the sweep has not seen it.
    reminder.armedBy = [];
    reminder.firedAt = null;
  }

  if (payload.scope !== undefined && payload.scope !== reminder.scope) {
    if (!sameId(creatorId(reminder), userId)) {
      throw ApiError.forbidden('Only the reminder creator can change who it is for');
    }
    if (!reminder.group) throw ApiError.badRequest('A personal reminder is only for you');
    reminder.scope = payload.scope;
  }

  // Only ever the asker's own switch.
  if (payload.muted !== undefined) {
    reminder.mutedBy = reminder.mutedBy.filter((id) => !sameId(id, userId));
    if (payload.muted) reminder.mutedBy.push(userId);
  }

  await reminder.save();

  const scopeChanged = before.scope !== reminder.scope;
  if (scopeChanged) {
    if (reminder.scope === 'group') await announce(reminder, userId);
    else await messageService.deleteForEntity('reminder', reminder._id);
  }

  const ringers = ringersOf(reminder);
  if (Object.keys(payload).every((key) => key === 'muted')) {
    // Someone's own switch concerns only their own phones.
    if (ringers.includes(String(userId))) reminderSync.upsert([userId], alarmOf(reminder));
    else reminderSync.remove([userId], reminder._id);
  } else {
    reminderSync.upsert(ringers, alarmOf(reminder));
    reminderSync.remove(before.ringers.filter((id) => !ringers.includes(id)), reminder._id);
  }
  broadcast(reminder, { toGroup: scopeChanged || reminder.scope === 'group' });

  return present(reminder, userId);
};

const removeEverywhere = async (reminder) => {
  await messageService.deleteForEntity('reminder', reminder._id);
  await reminder.deleteOne();
  reminderSync.remove(audienceOf(reminder), reminder._id);
  broadcast(reminder);
};

const deleteReminder = async (reminderId, userId) => {
  const reminder = await getReminderFor(reminderId, userId);
  const isAdmin = reminder.group && sameId(reminder.group.adminId, userId);
  // The admin too: otherwise a shared reminder outlives a creator who left.
  if (!sameId(creatorId(reminder), userId) && !isAdmin) {
    throw ApiError.forbidden('Only the reminder creator can delete it');
  }
  await removeEverywhere(reminder);
};

// A deleted task takes its reminders with it, off the phones as well.
const removeForTask = async (taskId) => {
  const reminders = await Reminder.find({ task: taskId }).populate(WITH);
  for (const reminder of reminders) await removeEverywhere(reminder);
};

/**
 * Someone left a group or was removed from it. Their private reminders about
 * it go with them, the shared ones forget them, and their phone is told to
 * read its list again so it stops ringing for that group.
 */
const forgetMember = async (groupId, userId) => {
  const own = await Reminder.find({ group: groupId, scope: 'me', createdBy: userId }).distinct('_id');
  if (own.length) {
    await messageService.deleteForEntity('reminder', { $in: own });
    await Reminder.deleteMany({ _id: { $in: own } });
  }
  await Reminder.updateMany(
    { group: groupId },
    { $pull: { mutedBy: userId, armedBy: userId } },
    { timestamps: false }
  );
  reminderSync.refresh([userId]);
};

/**
 * A phone reporting which alarms it has set. Limited to reminders the person
 * can see, so an id picked up elsewhere changes nothing.
 */
const markArmed = async (userId, reminderIds) => {
  if (!reminderIds.length) return;
  await Reminder.updateMany(
    { $and: [{ _id: { $in: reminderIds } }, await visibleTo(userId)] },
    { $addToSet: { armedBy: userId } },
    { timestamps: false }
  );
};

module.exports = {
  listReminders,
  listMine,
  createReminder,
  updateReminder,
  deleteReminder,
  removeForTask,
  forgetMember,
  markArmed,
  // For the sweep and the tests.
  WITH,
  audienceOf,
  ringsFor,
  ringersOf,
  alarmOf,
  present,
  repeatUntilFor,
};
