const asyncHandler = require('../utils/asyncHandler');
const notificationService = require('../services/notification.service');

const listNotifications = asyncHandler(async (req, res) => {
  const notifications = await notificationService.listForUser(req.user._id);
  res.json({ success: true, data: { notifications } });
});

const markRead = asyncHandler(async (req, res) => {
  const notification = await notificationService.markRead(req.params.notificationId, req.user._id);
  res.json({ success: true, data: { notification } });
});

const markAllRead = asyncHandler(async (req, res) => {
  await notificationService.markAllRead(req.user._id);
  res.json({ success: true, message: 'All notifications marked read' });
});

const deleteNotification = asyncHandler(async (req, res) => {
  await notificationService.remove(req.params.notificationId, req.user._id);
  res.json({ success: true, message: 'Notification cleared' });
});

const clearAll = asyncHandler(async (req, res) => {
  await notificationService.clearAll(req.user._id);
  res.json({ success: true, message: 'Notifications cleared' });
});

module.exports = { listNotifications, markRead, markAllRead, deleteNotification, clearAll };
