const Group = require('../models/Group');
const Expense = require('../models/Expense');
const Task = require('../models/Task');
const Reminder = require('../models/Reminder');
const Message = require('../models/Message');
const ItineraryDay = require('../models/ItineraryDay');
const ItineraryJob = require('../models/ItineraryJob');
const Photo = require('../models/Photo');
const Attraction = require('../models/Attraction');
const Stay = require('../models/Stay');
const Notification = require('../models/Notification');
const ApiError = require('../utils/ApiError');
const groupService = require('./group.service');
const notificationService = require('./notification.service');
const storage = require('../storage');
const realtime = require('../realtime/socket');

// Everything that belongs to a group and has no life outside it.
const CHILD_MODELS = [
  Expense,
  Task,
  Reminder,
  Message,
  ItineraryDay,
  ItineraryJob,
  Photo,
  Attraction,
  Stay,
  // Rows about the group would otherwise deep-link into a group that is gone.
  Notification,
];

/**
 * Every stored file the group owns: gallery photos and chat attachments. A
 * photo sent in the chat is one file behind both a message and a gallery row,
 * so the list is de-duplicated. Read before anything is deleted, because the
 * storage keys live on the rows.
 */
const storedFilesOf = async (groupId) => {
  const [photos, messages] = await Promise.all([
    Photo.find({ group: groupId }).select('+storageKey storageProvider').lean(),
    Message.find({ group: groupId, attachment: { $ne: null } })
      .select('+attachment.storageKey attachment.storageProvider')
      .lean(),
  ]);
  const files = new Map();
  const add = (key, provider) => {
    if (key) files.set(`${provider}:${key}`, { key, provider });
  };
  for (const photo of photos) add(photo.storageKey, photo.storageProvider);
  for (const message of messages) add(message.attachment?.storageKey, message.attachment?.storageProvider);
  return [...files.values()];
};

/**
 * Admin only, and final: the group goes with its chat, expenses, tasks,
 * reminders, itinerary, gallery, attractions and stays, for every member.
 * Unsettled balances do not stop it (unlike leaving): deleting is the admin
 * saying the whole record is no longer wanted, and the app warns them first.
 */
const deleteGroup = async (groupId, userId) => {
  const group = await groupService.getGroupForMember(groupId, userId);
  if (group.adminId.toString() !== userId.toString()) {
    throw ApiError.forbidden('Only the group admin can delete this group');
  }

  const admin = group.members.find((m) => m._id.equals(userId));
  const others = group.members.filter((m) => !m._id.equals(userId));
  const files = await storedFilesOf(groupId);

  // The group first: from this moment every request for it answers 404, so
  // nothing new can be added to it while its contents are being removed.
  await group.deleteOne();
  await Promise.all(CHILD_MODELS.map((Model) => Model.deleteMany({ group: groupId })));

  realtime.closeGroup(groupId, { name: group.name, deletedBy: userId });

  // Told one by one and without a group attached: there is nothing left to open.
  await Promise.all(
    others.map((member) =>
      notificationService
        .notifyUser({
          userId: member._id,
          type: 'member',
          title: 'Group Deleted',
          body: `${admin?.name ?? 'The admin'} deleted "${group.name}".`,
        })
        .catch((err) => console.error(`[group] could not tell ${member._id} about the deletion:`, err.message))
    )
  );

  // Last and best-effort (storage.remove never throws): a file left behind
  // costs a little space, a failed request here would not bring the group back.
  await Promise.all(files.map((file) => storage.remove(file.key, file.provider)));

  return { name: group.name, removedFiles: files.length };
};

module.exports = { deleteGroup };
