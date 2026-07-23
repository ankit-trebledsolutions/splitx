const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema(
  {
    group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Group',
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    notes: { type: String, trim: true, maxlength: 500, default: '' },
    priority: { type: String, enum: ['high', 'med', 'low'], default: 'med' },
    assignees: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    dueAt: { type: Date, default: null },
    status: { type: String, enum: ['open', 'done'], default: 'open' },
    completedAt: { type: Date, default: null },
    // Set when the task was auto-detected from a chat message, so the sheet can
    // show "Mentioned by Sam L. — 'Do not forget to book tickets'".
    source: {
      message: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
      user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      text: { type: String, trim: true, maxlength: 2000, default: '' },
      at: { type: Date, default: null },
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Task', taskSchema);
