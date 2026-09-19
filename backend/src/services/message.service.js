const Message = require('../models/Message');
const Photo = require('../models/Photo');
const ApiError = require('../utils/ApiError');
const groupService = require('./group.service');
const storedFileService = require('./storedFile.service');
const { emitToGroup } = require('../realtime/socket');

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
  { path: 'reminder' },
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
  emitToGroup(groupId, 'message:new', { message });
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
  emitToGroup(groupId, 'message:deleted', { message });
  return message;
};

/**
 * Internal: drop an activity card into the group chat. Called by the expense,
 * task and reminder services so anything created anywhere shows up in the chat.
 */
const postActivity = async ({ groupId, senderId, type, text, expense, task, reminder }) => {
  const message = await Message.create({
    group: groupId,
    sender: senderId ?? null,
    type,
    text: text ?? '',
    expense: expense ?? null,
    task: task ?? null,
    reminder: reminder ?? null,
    readBy: senderId ? [senderId] : [],
  });
  return publish(groupId, await message.populate(POPULATE));
};

const postSystem = (groupId, text) =>
  postActivity({ groupId, senderId: null, type: 'system', text });

const deleteForEntity = (field, entityId) => Message.deleteMany({ [field]: entityId });

module.exports = { listMessages, sendMessage, sendAttachment, deleteMessage, postActivity, postSystem, deleteForEntity, POPULATE };
