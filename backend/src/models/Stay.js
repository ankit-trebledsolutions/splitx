const mongoose = require('mongoose');

// A hotel / accommodation booking for the trip.
const staySchema = new mongoose.Schema(
  {
    group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Group',
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    // The group's rating and note, added once they have stayed there. Empty
    // until then: a stay is usually added before anyone has seen it.
    stars: { type: Number, min: 1, max: 5, default: null },
    review: { type: String, trim: true, maxlength: 500, default: '' },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'cancelled'],
      default: 'pending',
    },
    checkIn: { type: Date, required: true },
    checkOut: { type: Date, required: true },
    guests: { type: Number, min: 1, max: 50, default: 1 },
    pricePerNight: { type: Number, min: 0, required: true },
    amenities: [{ type: String, trim: true, maxlength: 40 }],
    address: { type: String, trim: true, maxlength: 200, default: '' },
    emoji: { type: String, trim: true, maxlength: 8, default: '🏨' },
    // The places provider's id when this was picked from the suggestions, so
    // the tab can mark it as added. Null for a stay typed by hand.
    placeId: { type: String, trim: true, maxlength: 120, default: null },
    bookedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

staySchema.index({ group: 1, checkIn: 1 });

module.exports = mongoose.model('Stay', staySchema);
