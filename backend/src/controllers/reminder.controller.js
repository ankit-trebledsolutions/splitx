const asyncHandler = require('../utils/asyncHandler');
const reminderService = require('../services/reminder.service');

const listReminders = asyncHandler(async (req, res) => {
  const reminders = await reminderService.listReminders(req.params.groupId, req.user._id);
  res.json({ success: true, data: { reminders } });
});

const listMine = asyncHandler(async (req, res) => {
  const reminders = await reminderService.listMine(req.user._id);
  res.json({ success: true, data: { reminders } });
});

// Shared by POST /groups/:groupId/reminders and POST /reminders (personal, no group).
const createReminder = asyncHandler(async (req, res) => {
  const reminder = await reminderService.createReminder(
    req.user._id,
    req.params.groupId ?? null,
    req.body
  );
  res.status(201).json({ success: true, data: { reminder } });
});

const updateReminder = asyncHandler(async (req, res) => {
  const reminder = await reminderService.updateReminder(
    req.params.reminderId,
    req.user._id,
    req.body
  );
  res.json({ success: true, data: { reminder } });
});

const deleteReminder = asyncHandler(async (req, res) => {
  await reminderService.deleteReminder(req.params.reminderId, req.user._id);
  res.json({ success: true, message: 'Reminder deleted' });
});

const markArmed = asyncHandler(async (req, res) => {
  await reminderService.markArmed(req.user._id, req.body.ids);
  res.json({ success: true });
});

module.exports = {
  listReminders,
  listMine,
  createReminder,
  updateReminder,
  deleteReminder,
  markArmed,
};
