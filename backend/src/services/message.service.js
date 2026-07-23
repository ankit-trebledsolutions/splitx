const Message = require('../models/Message');
const groupService = require('./group.service');

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

const listMessages = async (groupId, userId, { limit = 100, before } = {}) => {
  await groupService.getGroupForMember(groupId, userId);

  const query = { group: groupId };
  if (before) query.createdAt = { $lt: new Date(before) };

  // Newest-first for the limit, then flipped so the client renders oldest-first.
  const messages = await Message.find(query)
    .sort({ createdAt: -1 })
    .limit(Math.min(limit, 200))
    .populate(POPULATE);

  return messages.reverse();
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
  return message.populate(POPULATE);
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
  return message.populate(POPULATE);
};

const postSystem = (groupId, text) =>
  postActivity({ groupId, senderId: null, type: 'system', text });

const deleteForEntity = (field, entityId) => Message.deleteMany({ [field]: entityId });

module.exports = { listMessages, sendMessage, postActivity, postSystem, deleteForEntity, POPULATE };
