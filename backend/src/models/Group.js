const mongoose = require('mongoose');
const crypto = require('crypto');

// Where a trip is going, as picked from the app's country and state lists
// (services/regions.service.js). The state is optional: a country alone is a
// destination too. Groups made before this existed have only `location`.
const destinationSchema = new mongoose.Schema(
  {
    countryCode: { type: String, required: true, uppercase: true, trim: true, minlength: 2, maxlength: 2 },
    countryName: { type: String, required: true, trim: true, maxlength: 80 },
    stateCode: { type: String, uppercase: true, trim: true, maxlength: 24, default: '' },
    stateName: { type: String, trim: true, maxlength: 120, default: '' },
  },
  { _id: false }
);

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
    // The destination as text ("Rajasthan, India"): what every screen shows,
    // and what the suggestions fall back to for a group with no `destination`.
    location: { type: String, trim: true, maxlength: 120, default: '' },
    destination: { type: destinationSchema, default: null },
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

// "Which groups am I in" runs on nearly every screen and every live connection.
groupSchema.index({ members: 1 });

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
