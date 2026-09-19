const asyncHandler = require('../utils/asyncHandler');
const messageService = require('../services/message.service');
const groupService = require('../services/group.service');
const storage = require('../storage');

const listMessages = asyncHandler(async (req, res) => {
  const messages = await messageService.listMessages(req.params.groupId, req.user._id, {
    limit: Number(req.query.limit) || 100,
    before: req.query.before,
    // Reconnect catch-up: only messages newer than this timestamp.
    after: req.query.after,
  });
  res.json({ success: true, data: { messages } });
});

const sendMessage = asyncHandler(async (req, res) => {
  const message = await messageService.sendMessage(
    req.user._id,
    req.params.groupId,
    req.body.text,
    req.body.replyTo
  );
  res.status(201).json({ success: true, data: { message } });
});

const deleteMessage = asyncHandler(async (req, res) => {
  const message = await messageService.deleteMessage(
    req.params.messageId,
    req.params.groupId,
    req.user._id
  );
  res.json({ success: true, data: { message } });
});

// Longest voice note the duration field will record (the 10MB cap ends it sooner).
const MAX_DURATION_MS = 60 * 60 * 1000;

// Multipart upload of a photo, voice note or document sent in the chat: multer
// holds the file in memory, storage keeps it, the message points at it.
const sendAttachment = asyncHandler(async (req, res) => {
  if (!req.file) {
    res.status(400).json({ success: false, message: 'No file received' });
    return;
  }
  // Check membership before storing anything, so a non-member can't fill the bucket.
  await groupService.getGroupForMember(req.params.groupId, req.user._id);

  const durationMs = Math.min(Math.max(Math.round(Number(req.body.durationMs)) || 0, 0), MAX_DURATION_MS);
  const text = String(req.body.text ?? '').trim().slice(0, 2000);
  // Multipart bodies skip the zod schemas, so check the id here.
  const replyToId = req.body.replyTo || undefined;
  if (replyToId && !/^[a-f\d]{24}$/i.test(replyToId)) {
    res.status(400).json({ success: false, message: 'Invalid replyTo id' });
    return;
  }

  const stored = await storage.upload(req.file, {
    folder: `splix/groups/${req.params.groupId}/chat`,
  });
  let message;
  try {
    message = await messageService.sendAttachment(req.user._id, req.params.groupId, {
      text,
      replyToId,
      attachment: {
        url: stored.url,
        thumbUrl: stored.thumbUrl,
        name: String(req.file.originalname ?? '').slice(-200),
        mimeType: req.file.mimetype,
        size: req.file.size,
        durationMs,
        storageProvider: stored.provider,
        storageKey: stored.key,
      },
    });
  } catch (err) {
    // Don't leave a file in storage that no message points to.
    await storage.remove(stored.key, stored.provider);
    throw err;
  }
  res.status(201).json({ success: true, data: { message } });
});

module.exports = { listMessages, sendMessage, sendAttachment, deleteMessage };
