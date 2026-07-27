const Notification = require('../models/Notification');
const Group = require('../models/Group');
const ApiError = require('../utils/ApiError');

/**
 * Fan a notification out to every group member except the actor. Failures are
 * swallowed: a notification hiccup must never fail the action that caused it.
 */
const notifyGroup = async ({ groupId, actorId, type, title, body, amount = null }) => {
  try {
    const group = await Group.findById(groupId).select('members');
    if (!group) return;
    const recipients = group.members.filter((m) => !m.equals(actorId));
    if (!recipients.length) return;
    await Notification.insertMany(
      recipients.map((user) => ({ user, group: groupId, type, title, body, amount }))
    );
  } catch (err) {
    console.error('notifyGroup failed:', err.message);
  }
};

const listForUser = (userId) =>
  Notification.find({ user: userId }).sort({ createdAt: -1 }).limit(100);

const getOwn = async (notificationId, userId) => {
  const notification = await Notification.findById(notificationId);
  if (!notification) throw ApiError.notFound('Notification not found');
  if (!notification.user.equals(userId)) {
    throw ApiError.forbidden('Not your notification');
  }
  return notification;
};

const markRead = async (notificationId, userId) => {
  const notification = await getOwn(notificationId, userId);
  notification.read = true;
  await notification.save();
  return notification;
};

const markAllRead = (userId) =>
  Notification.updateMany({ user: userId, read: false }, { $set: { read: true } });

const remove = async (notificationId, userId) => {
  const notification = await getOwn(notificationId, userId);
  await notification.deleteOne();
};

const clearAll = (userId) => Notification.deleteMany({ user: userId });

module.exports = { notifyGroup, listForUser, markRead, markAllRead, remove, clearAll };
