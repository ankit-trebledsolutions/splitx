const mongoose = require('mongoose');

const reminderSchema = new mongoose.Schema(
  {
    // Null for a personal reminder, which belongs to no group and is always
    // scope 'me'.
    group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Group',
      default: null,
      index: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    subtitle: { type: String, trim: true, maxlength: 200, default: '' },
    remindAt: { type: Date, required: true },
    // 'group' rings for every member, 'me' only for the creator.
    scope: { type: String, enum: ['group', 'me'], default: 'group' },
    // "Repeat weekly until trip ends" toggle on the New Reminder sheet.
    repeatWeekly: { type: Boolean, default: false },
    // Off for everybody. A member silencing it for themselves is `mutedBy`.
    enabled: { type: Boolean, default: true },
    // Ionicons name, so the list can show the flight/train/hotel glyphs.
    icon: { type: String, trim: true, default: 'alarm-outline' },
    task: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Members who switched this reminder off on their own phone.
    mutedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    // Members whose phone has confirmed the alarm is set for `remindAt`. The
    // rest get a plain push at the time instead (see reminderSweep.service).
    armedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    // When the server dealt with the current `remindAt`. Null means still to
    // come; a weekly reminder goes back to null as it moves on a week.
    firedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

reminderSchema.index({ group: 1, remindAt: 1 });
// The sweep's query: what is due and not yet dealt with.
reminderSchema.index({ firedAt: 1, remindAt: 1 });

reminderSchema.pre('validate', function personalIsPrivate(next) {
  if (!this.group) this.scope = 'me';
  next();
});

module.exports = mongoose.model('Reminder', reminderSchema);
