const Conversation = require('../models/Conversation');
const DirectMessage = require('../models/DirectMessage');
const Group = require('../models/Group');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const pushService = require('./push.service');
const { emitToUser, isViewingConversation } = require('../realtime/socket');

const PERSON_FIELDS = 'name email lastSeenAt';
const SENDER_FIELDS = 'name';

const sameId = (a, b) => String(a) === String(b);

const getConversationFor = async (conversationId, userId) => {
  const conversation = await Conversation.findById(conversationId).populate(
    'participants',
    PERSON_FIELDS
  );
  if (!conversation) throw ApiError.notFound('Conversation not found');
  if (!conversation.participants.some((p) => sameId(p._id, userId))) {
    throw ApiError.forbidden('You are not part of this conversation');
  }
  return conversation;
};

/**
 * Finds the conversation between two people, creating it on first contact.
 * Starting a new one requires a group in common, so strangers can't be
 * messaged; an existing conversation stays open even if that group is left.
 */
const openConversation = async (userId, otherUserId) => {
  if (sameId(userId, otherUserId)) throw ApiError.badRequest('You cannot message yourself');

  const pairKey = Conversation.pairKeyFor(userId, otherUserId);
  const existing = await Conversation.findOne({ pairKey }).populate('participants', PERSON_FIELDS);
  if (existing) return existing;

  const other = await User.exists({ _id: otherUserId });
  if (!other) throw ApiError.notFound('That person no longer exists');
  const shareGroup = await Group.exists({ members: { $all: [userId, otherUserId] } });
  if (!shareGroup) throw ApiError.forbidden('You can only message people you share a group with');

  // Both people can open the chat at the same moment; the unique pairKey lets
  // only one insert win, and the loser simply reads the winner's conversation.
  try {
    const created = await Conversation.create({ pairKey, participants: [userId, otherUserId] });
    return created.populate('participants', PERSON_FIELDS);
  } catch (err) {
    if (err.code !== 11000) throw err;
    return Conversation.findOne({ pairKey }).populate('participants', PERSON_FIELDS);
  }
};

const listConversations = (userId) =>
  Conversation.find({ participants: userId, lastMessageAt: { $ne: null } })
    .sort({ lastMessageAt: -1 })
    .limit(100)
    .populate('participants', PERSON_FIELDS);

// Same paging contract as group chat: newest page by default, `before` walks
// back through history, `after` catches up after a dropped connection.
const listMessages = async (conversationId, userId, { limit = 50, before, after } = {}) => {
  await getConversationFor(conversationId, userId);

  const query = { conversation: conversationId };
  if (before || after) {
    query.createdAt = {};
    if (before) query.createdAt.$lt = new Date(before);
    if (after) query.createdAt.$gt = new Date(after);
  }
  const cap = Math.min(limit, 200);

  if (after) {
    return DirectMessage.find(query).sort({ createdAt: 1 }).limit(cap).populate('sender', SENDER_FIELDS);
  }
  const messages = await DirectMessage.find(query)
    .sort({ createdAt: -1 })
    .limit(cap)
    .populate('sender', SENDER_FIELDS);
  return messages.reverse();
};

const sendMessage = async (userId, conversationId, text) => {
  const conversation = await getConversationFor(conversationId, userId);
  const recipient = conversation.participants.find((p) => !sameId(p._id, userId));

  const message = await DirectMessage.create({ conversation: conversationId, sender: userId, text });
  await message.populate('sender', SENDER_FIELDS);

  await Conversation.updateOne(
    { _id: conversationId },
    { lastMessageText: message.text, lastMessageAt: message.createdAt, lastSender: userId }
  );

  // Both sides get it live: the recipient, and the sender's other devices.
  const payload = { conversationId: String(conversationId), message };
  emitToUser(userId, 'dm:new', payload);
  if (recipient) {
    emitToUser(recipient._id, 'dm:new', payload);
    // No push while they are looking at this very chat.
    if (!isViewingConversation(recipient._id, conversationId)) {
      pushService.sendToUsers([recipient._id], {
        title: message.sender.name,
        body: message.text,
        data: { type: 'dm', conversationId: String(conversationId) },
      });
    }
  }

  return message;
};

module.exports = {
  openConversation,
  getConversationFor,
  listConversations,
  listMessages,
  sendMessage,
};
