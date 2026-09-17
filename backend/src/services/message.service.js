const Message = require('../models/Message');
const groupService = require('./group.service');
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
];

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

const sendMessage = async (userId, groupId, text) => {
  await groupService.getGroupForMember(groupId, userId);
  const message = await Message.create({
    group: groupId,
    sender: userId,
    type: 'text',
    text,
    readBy: [userId],
  });
  return publish(groupId, await message.populate(POPULATE));
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

module.exports = { listMessages, sendMessage, postActivity, postSystem, deleteForEntity, POPULATE };
