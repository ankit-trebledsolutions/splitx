const Reminder = require('../models/Reminder');
const ApiError = require('../utils/ApiError');
const groupService = require('./group.service');
const messageService = require('./message.service');

const listReminders = async (groupId, userId) => {
  await groupService.getGroupForMember(groupId, userId);
  // Personal reminders are only visible to whoever made them.
  return Reminder.find({
    group: groupId,
    $or: [{ scope: 'group' }, { scope: 'me', createdBy: userId }],
  })
    .populate('createdBy', 'name email')
    .sort({ remindAt: 1 });
};

const createReminder = async (userId, groupId, payload) => {
  await groupService.getGroupForMember(groupId, userId);

  const reminder = await Reminder.create({
    group: groupId,
    title: payload.title,
    subtitle: payload.subtitle,
    remindAt: payload.remindAt,
    scope: payload.scope,
    icon: payload.icon,
    task: payload.task ?? null,
    createdBy: userId,
  });

  await reminder.populate('createdBy', 'name email');
  await messageService.postActivity({
    groupId,
    senderId: userId,
    type: 'reminder',
    text: reminder.title,
    reminder: reminder._id,
  });

  return reminder;
};

const getReminderForMember = async (reminderId, userId) => {
  const reminder = await Reminder.findById(reminderId).populate('createdBy', 'name email');
  if (!reminder) throw ApiError.notFound('Reminder not found');
  await groupService.getGroupForMember(reminder.group, userId);
  if (reminder.scope === 'me' && !reminder.createdBy._id.equals(userId)) {
    throw ApiError.forbidden('This reminder is private');
  }
  return reminder;
};

const updateReminder = async (reminderId, userId, payload) => {
  const reminder = await getReminderForMember(reminderId, userId);
  for (const field of ['title', 'subtitle', 'remindAt', 'scope', 'icon', 'enabled']) {
    if (payload[field] !== undefined) reminder[field] = payload[field];
  }
  await reminder.save();
  return reminder;
};

const deleteReminder = async (reminderId, userId) => {
  const reminder = await getReminderForMember(reminderId, userId);
  if (!reminder.createdBy._id.equals(userId)) {
    throw ApiError.forbidden('Only the reminder creator can delete it');
  }
  await messageService.deleteForEntity('reminder', reminder._id);
  await reminder.deleteOne();
};

module.exports = {
  listReminders,
  createReminder,
  getReminderForMember,
  updateReminder,
  deleteReminder,
};
