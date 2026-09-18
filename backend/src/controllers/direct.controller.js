const asyncHandler = require('../utils/asyncHandler');
const directService = require('../services/direct.service');

const openConversation = asyncHandler(async (req, res) => {
  const conversation = await directService.openConversation(req.user._id, req.body.userId);
  res.json({ success: true, data: { conversation } });
});

const listConversations = asyncHandler(async (req, res) => {
  const conversations = await directService.listConversations(req.user._id);
  res.json({ success: true, data: { conversations } });
});

const getConversation = asyncHandler(async (req, res) => {
  const conversation = await directService.getConversationFor(
    req.params.conversationId,
    req.user._id
  );
  res.json({ success: true, data: { conversation } });
});

const listMessages = asyncHandler(async (req, res) => {
  const messages = await directService.listMessages(req.params.conversationId, req.user._id, {
    limit: Number(req.query.limit) || 50,
    before: req.query.before,
    after: req.query.after,
  });
  res.json({ success: true, data: { messages } });
});

const sendMessage = asyncHandler(async (req, res) => {
  const message = await directService.sendMessage(
    req.user._id,
    req.params.conversationId,
    req.body.text
  );
  res.status(201).json({ success: true, data: { message } });
});

module.exports = {
  openConversation,
  listConversations,
  getConversation,
  listMessages,
  sendMessage,
};
