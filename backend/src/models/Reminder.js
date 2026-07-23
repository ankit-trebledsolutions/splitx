const mongoose = require('mongoose');

const reminderSchema = new mongoose.Schema(
  {
    group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Group',
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    subtitle: { type: String, trim: true, maxlength: 200, default: '' },
    remindAt: { type: Date, required: true },
    // 'group' notifies every member, 'me' only the creator.
    scope: { type: String, enum: ['group', 'me'], default: 'group' },
    enabled: { type: Boolean, default: true },
    // Ionicons name, so the list can show the flight/train/hotel glyphs.
    icon: { type: String, trim: true, default: 'alarm-outline' },
    task: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

reminderSchema.index({ group: 1, remindAt: 1 });

module.exports = mongoose.model('Reminder', reminderSchema);
