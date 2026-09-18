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
    startDate: { type: Date, default: null },
    location: { type: String, trim: true, maxlength: 120, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Starts as the creator and can be handed over. Groups created before this
    // field existed have none, so always read it through `adminId`.
    admin: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    // Members who silenced this group's push notifications.
    mutedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
    inviteCode: { type: String, unique: true, index: true },
  },
  { timestamps: true }
);

groupSchema.virtual('adminId').get(function adminId() {
  return this.admin ?? this.createdBy;
});

// Clients always get a concrete `admin`, even for groups that predate the field.
groupSchema.set('toJSON', {
  transform(_doc, ret) {
    ret.admin = ret.admin ?? ret.createdBy;
    return ret;
  },
});

groupSchema.pre('validate', function ensureInviteCode(next) {
  if (!this.inviteCode) {
    this.inviteCode = crypto.randomBytes(4).toString('hex').toUpperCase();
  }
  next();
});

module.exports = mongoose.model('Group', groupSchema);
