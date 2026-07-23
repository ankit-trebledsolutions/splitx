const mongoose = require('mongoose');

/**
 * The group chat feed. Plain user messages live here alongside activity cards:
 * every expense, task and reminder created in a group also lands in the chat as
 * a message of the matching type, referencing the entity it was created from.
 */
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
      enum: ['text', 'system', 'expense', 'task', 'reminder'],
      default: 'text',
    },
    text: { type: String, trim: true, maxlength: 2000, default: '' },
    expense: { type: mongoose.Schema.Types.ObjectId, ref: 'Expense', default: null },
    task: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', default: null },
    reminder: { type: mongoose.Schema.Types.ObjectId, ref: 'Reminder', default: null },
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
);

messageSchema.index({ group: 1, createdAt: 1 });

module.exports = mongoose.model('Message', messageSchema);
