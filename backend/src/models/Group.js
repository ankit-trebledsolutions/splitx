const mongoose = require('mongoose');
const crypto = require('crypto');

const groupSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, trim: true, maxlength: 300, default: '' },
    groupType: {
      type: String,
      enum: ['trip', 'home', 'couple', 'event', 'other'],
      default: 'trip',
    },
    // Only meaningful for trip groups; null for everything else.
    totalDays: { type: Number, min: 1, max: 365, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
    inviteCode: { type: String, unique: true, index: true },
  },
  { timestamps: true }
);

groupSchema.pre('validate', function ensureInviteCode(next) {
  if (!this.inviteCode) {
    this.inviteCode = crypto.randomBytes(4).toString('hex').toUpperCase();
  }
  next();
});

module.exports = mongoose.model('Group', groupSchema);
