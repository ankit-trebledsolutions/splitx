const mongoose = require('mongoose');

// One in-app notification for one user, fanned out to the other group members
// whenever something happens in a group (expense added, task created, etc.).
const notificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', default: null },
    type: {
      type: String,
      enum: [
        'expense',
        'task',
        'reminder',
        'member',
        'itinerary',
        'photo',
        'attraction',
        'stay',
        'system',
      ],
      default: 'system',
    },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    body: { type: String, trim: true, maxlength: 300, default: '' },
    // Signed money amount for transaction rows ("-$45.00"); null otherwise.
    amount: { type: Number, default: null },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

notificationSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
