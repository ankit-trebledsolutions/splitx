const asyncHandler = require('../utils/asyncHandler');
const messageService = require('../services/message.service');

const listMessages = asyncHandler(async (req, res) => {
  const messages = await messageService.listMessages(req.params.groupId, req.user._id, {
    limit: Number(req.query.limit) || 100,
    before: req.query.before,
  });
  res.json({ success: true, data: { messages } });
});

const sendMessage = asyncHandler(async (req, res) => {
  const message = await messageService.sendMessage(
    req.user._id,
    req.params.groupId,
    req.body.text
  );
  res.status(201).json({ success: true, data: { message } });
});

module.exports = { listMessages, sendMessage };
