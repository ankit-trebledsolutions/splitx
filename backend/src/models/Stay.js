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
    stars: { type: Number, min: 1, max: 5, default: 4 },
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
    bookedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

staySchema.index({ group: 1, checkIn: 1 });

module.exports = mongoose.model('Stay', staySchema);
