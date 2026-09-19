const mongoose = require('mongoose');

/**
 * The group chat feed. Plain user messages live here alongside activity cards:
 * every expense, task and reminder created in a group also lands in the chat as
 * a message of the matching type, referencing the entity it was created from.
 *
 * `image`, `audio` (voice notes) and `file` messages carry an attachment;
 * their `text` is an optional caption.
 */
const attachmentSchema = new mongoose.Schema(
  {
    url: { type: String, trim: true, maxlength: 2000, required: true },
    // Small square preview for image bubbles; equals url for everything else.
    thumbUrl: { type: String, trim: true, maxlength: 2000, default: '' },
    name: { type: String, trim: true, maxlength: 200, default: '' },
    mimeType: { type: String, trim: true, maxlength: 120, default: '' },
    size: { type: Number, min: 0, default: 0 },
    // Voice notes only: length of the recording, so the bubble can show it
    // before the audio is downloaded.
    durationMs: { type: Number, min: 0, default: 0 },
    // As on Photo: which provider holds the file and its id there, for deletion.
    storageProvider: { type: String, trim: true, maxlength: 20, default: '' },
    storageKey: { type: String, trim: true, maxlength: 500, default: '', select: false },
  },
  { _id: false }
);

const messageSchema = new mongoose.Schema(
  {
    group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Group',
      required: true,
      index: true,
    },
    // Null for `system` messages ("Alex added Pete W. to Tokyo Getaway").
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    type: {
      type: String,
      enum: ['text', 'system', 'expense', 'task', 'reminder', 'image', 'audio', 'file'],
      default: 'text',
    },
    text: { type: String, trim: true, maxlength: 2000, default: '' },
    expense: { type: mongoose.Schema.Types.ObjectId, ref: 'Expense', default: null },
    task: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', default: null },
    reminder: { type: mongoose.Schema.Types.ObjectId, ref: 'Reminder', default: null },
    attachment: { type: attachmentSchema, default: null },
    // The message this one answers, shown quoted above it.
    replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
    // "Delete for everyone": the row stays, so the feed keeps its place and
    // replies still have something to point at, but text and attachment are
    // wiped and the app shows "This message was deleted".
    deletedAt: { type: Date, default: null },
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
);

messageSchema.index({ group: 1, createdAt: 1 });
// Looked up when a file is deleted, to see whether a message still uses it.
messageSchema.index({ 'attachment.url': 1 }, { sparse: true });

// `select: false` only hides storageKey on reads; a just-created document still
// carries it, so strip it from anything that is sent to a client.
messageSchema.set('toJSON', {
  transform(_doc, ret) {
    if (ret.attachment) delete ret.attachment.storageKey;
    return ret;
  },
});

module.exports = mongoose.model('Message', messageSchema);
