const Message = require('../models/Message');
const Photo = require('../models/Photo');
const Reminder = require('../models/Reminder');
const ApiError = require('../utils/ApiError');
const groupService = require('./group.service');
const storedFileService = require('./storedFile.service');
// Called as realtime.emitToGroup(...), never destructured, so tests can swap the function.
const realtime = require('../realtime/socket');

const SENDER_FIELDS = 'name email';

// Every activity card in the chat is a Message with a populated entity.
const POPULATE = [
  { path: 'sender', select: SENDER_FIELDS },
  {
    path: 'expense',
    populate: [
      { path: 'paidBy', select: SENDER_FIELDS },
      { path: 'splits.user', select: SENDER_FIELDS },
    ],
  },
  {
    path: 'task',
    populate: [
      { path: 'assignees', select: SENDER_FIELDS },
      { path: 'source.user', select: SENDER_FIELDS },
    ],
  },
  // A task card's assignees as they were when it was posted.
  { path: 'assignees', select: SENDER_FIELDS },
  // Without who muted it or has the alarm set: that is per member, not for the chat.
  { path: 'reminder', select: '-mutedBy -armedBy' },
  { path: 'stay', populate: { path: 'bookedBy', select: SENDER_FIELDS } },
  // Without who bookmarked it: that is each member's own list.
  { path: 'attraction', select: '-savedBy' },
  // Just enough of each photo or video to draw the card's tiles.
  { path: 'photos', select: 'imageUrl thumbUrl mediaType durationMs emoji color caption createdAt' },
  // Just enough of the quoted message to draw the reply preview.
  {
    path: 'replyTo',
    select: 'sender type text attachment.name attachment.durationMs deletedAt',
    populate: { path: 'sender', select: SENDER_FIELDS },
  },
];

// What people write themselves, as opposed to system lines and activity cards.
// Only these can be replied to or deleted.
const USER_TYPES = ['text', 'image', 'audio', 'file'];

/**
 * A private ("Just me") reminder gets no chat card. Ones made before that was
 * the rule did get one, so those cards are left out for everyone but their
 * owner. Done in the query rather than afterwards: the app takes a short page
 * to mean it has reached the start of the chat.
 */
const hiddenReminderIds = (groupId, userId) =>
  Reminder.find({ group: groupId, scope: 'me', createdBy: { $ne: userId } }).distinct('_id');

/**
 * `before` pages backwards through history; `after` returns only what arrived
 * since a given time, so the app can catch up after a dropped connection
 * without re-downloading the whole conversation.
 */
const listMessages = async (groupId, userId, { limit = 100, before, after } = {}) => {
  await groupService.getGroupForMember(groupId, userId);

  const query = { group: groupId };
  if (before || after) {
    query.createdAt = {};
    if (before) query.createdAt.$lt = new Date(before);
    if (after) query.createdAt.$gt = new Date(after);
  }
  const cap = Math.min(limit, 200);

  const hidden = await hiddenReminderIds(groupId, userId);
  if (hidden.length) query.reminder = { $nin: hidden };

  if (after) {
    // Catch-up: oldest-first, everything newer than the client's last message.
    return Message.find(query).sort({ createdAt: 1 }).limit(cap).populate(POPULATE);
  }

  // Newest-first for the limit, then flipped so the client renders oldest-first.
  const messages = await Message.find(query).sort({ createdAt: -1 }).limit(cap).populate(POPULATE);
  return messages.reverse();
};

// Push a freshly created message to everyone with the group open. The HTTP
// caller still receives it in the response, so the sender never waits on this.
const publish = (groupId, message) => {
  realtime.emitToGroup(groupId, 'message:new', { message });
  return message;
};

// A card already in the feed changed (a gallery card gained or lost a photo):
// open chats swap it for this copy.
const publishUpdate = (message) => {
  realtime.emitToGroup(String(message.group), 'message:updated', { message });
  return message;
};

// A reply must quote a person's message from this same group.
const resolveReplyTo = async (groupId, replyToId) => {
  if (!replyToId) return null;
  const original = await Message.exists({ _id: replyToId, group: groupId, type: { $in: USER_TYPES } });
  if (!original) throw ApiError.badRequest('The message you are replying to no longer exists');
  return replyToId;
};

const sendMessage = async (userId, groupId, text, replyToId) => {
  await groupService.getGroupForMember(groupId, userId);
  const message = await Message.create({
    group: groupId,
    sender: userId,
    type: 'text',
    text,
    replyTo: await resolveReplyTo(groupId, replyToId),
    readBy: [userId],
  });
  return publish(groupId, await message.populate(POPULATE));
};

// Photos show inline and audio gets a player; everything else is a download.
const attachmentType = (mimeType = '') => {
  if (/^image\//.test(mimeType)) return 'image';
  if (/^audio\//.test(mimeType)) return 'audio';
  return 'file';
};

/**
 * A chat message carrying an already-stored file (see the controller, which
 * does the upload). `attachment` is the storage result plus the file's details.
 */
const sendAttachment = async (userId, groupId, { attachment, text = '', replyToId }) => {
  await groupService.getGroupForMember(groupId, userId);
  const type = attachmentType(attachment.mimeType);
  const message = await Message.create({
    group: groupId,
    sender: userId,
    type,
    text,
    attachment,
    replyTo: await resolveReplyTo(groupId, replyToId),
    readBy: [userId],
  });

  // Photos shared in the chat also go into the group gallery. Quietly: the chat
  // already shows the photo, so no "added a photo" line or notification.
  if (type === 'image') {
    try {
      await Photo.create({
        group: groupId,
        emoji: '📷',
        imageUrl: attachment.url,
        thumbUrl: attachment.thumbUrl,
        storageProvider: attachment.storageProvider,
        storageKey: attachment.storageKey,
        caption: text.slice(0, 200),
        uploadedBy: userId,
      });
    } catch (err) {
      // The message is sent either way; a missing gallery tile is not worth failing it.
      console.error('[chat] could not add photo to gallery:', err.message);
    }
  }

  return publish(groupId, await message.populate(POPULATE));
};

/**
 * "Delete for everyone", sender only. The message stays as an empty
 * placeholder (see Message.deletedAt); its file goes unless the gallery still
 * shows it.
 */
const deleteMessage = async (messageId, groupId, userId) => {
  await groupService.getGroupForMember(groupId, userId);
  const message = await Message.findOne({ _id: messageId, group: groupId }).select(
    '+attachment.storageKey'
  );
  if (!message) throw ApiError.notFound('Message not found');
  if (!USER_TYPES.includes(message.type)) throw ApiError.badRequest('This message cannot be deleted');
  if (!message.sender?.equals(userId)) {
    throw ApiError.forbidden('You can only delete your own messages');
  }

  if (!message.deletedAt) {
    const file = message.attachment && {
      url: message.attachment.url,
      key: message.attachment.storageKey,
      provider: message.attachment.storageProvider,
    };
    message.deletedAt = new Date();
    message.text = '';
    message.attachment = null;
    await message.save();
    if (file) await storedFileService.removeIfUnused(file);
  }

  await message.populate(POPULATE);
  realtime.emitToGroup(groupId, 'message:deleted', { message });
  return message;
};

/**
 * Internal: drop an activity card into the group chat. Called by the services
 * that create things (expenses, tasks, reminders, stays, attractions, gallery
 * uploads) so anything added anywhere shows up in the chat.
 */
const postActivity = async ({
  groupId,
  senderId,
  type,
  text,
  expense,
  task,
  reminder,
  stay,
  attraction,
  assignees,
  photos,
  batch,
}) => {
  const message = await Message.create({
    group: groupId,
    sender: senderId ?? null,
    type,
    text: text ?? '',
    expense: expense ?? null,
    task: task ?? null,
    reminder: reminder ?? null,
    stay: stay ?? null,
    attraction: attraction ?? null,
    // Only cards that use these get them; everything else leaves them out.
    assignees,
    photos,
    batch: batch || undefined,
    readBy: senderId ? [senderId] : [],
  });
  return publish(groupId, await message.populate(POPULATE));
};

const postSystem = (groupId, text) =>
  postActivity({ groupId, senderId: null, type: 'system', text });

// A later file from the same upload joins the card its first file posted, as
// long as that was recent: a retry straight after a failed upload still lands
// on that card, while an old batch key never revives a card from long ago.
const BATCH_WINDOW_MS = 30 * 60 * 1000;

/**
 * Shows a new gallery photo or video in the chat. Files picked together share
 * a `batch` key, so ten photos make one card rather than ten. Resolves to
 * `{ message, created }`; `created` is false when the file joined a card.
 */
const addToGalleryCard = async ({ groupId, senderId, photoId, batch }) => {
  if (batch) {
    const card = await Message.findOneAndUpdate(
      {
        group: groupId,
        sender: senderId,
        type: 'gallery',
        batch,
        createdAt: { $gte: new Date(Date.now() - BATCH_WINDOW_MS) },
      },
      { $addToSet: { photos: photoId } },
      { new: true }
    );
    if (card) return { message: publishUpdate(await card.populate(POPULATE)), created: false };
  }
  const message = await postActivity({ groupId, senderId, type: 'gallery', photos: [photoId], batch });
  return { message, created: true };
};

/**
 * Deletes cards and tells every open chat to drop them (`message:removed`),
 * so a card never outlives what it was about on someone's screen.
 */
const removeCards = async (filter) => {
  const removed = await Message.find(filter).select('_id group').lean();
  await Message.deleteMany(filter);
  const byGroup = new Map();
  for (const { _id, group } of removed) {
    const groupId = String(group);
    byGroup.set(groupId, [...(byGroup.get(groupId) ?? []), String(_id)]);
  }
  for (const [groupId, messageIds] of byGroup) {
    realtime.emitToGroup(groupId, 'message:removed', { groupId, messageIds });
  }
};

const deleteForEntity = (field, entityId) => removeCards({ [field]: entityId });

/**
 * Gallery photos or videos were deleted: they come off the cards that showed
 * them, and a card left with nothing on it goes.
 */
const dropFromGalleryCards = async (photoIds) => {
  if (!photoIds.length) return;
  const cards = await Message.find({ type: 'gallery', photos: { $in: photoIds } }).select('_id');
  if (!cards.length) return;
  const cardIds = cards.map((card) => card._id);
  await Message.updateMany({ _id: { $in: cardIds } }, { $pull: { photos: { $in: photoIds } } });
  await removeCards({ _id: { $in: cardIds }, photos: { $size: 0 } });
  const left = await Message.find({ _id: { $in: cardIds } }).populate(POPULATE);
  left.forEach(publishUpdate);
};

module.exports = {
  listMessages,
  sendMessage,
  sendAttachment,
  deleteMessage,
  postActivity,
  postSystem,
  addToGalleryCard,
  removeCards,
  deleteForEntity,
  dropFromGalleryCards,
  POPULATE,
};
