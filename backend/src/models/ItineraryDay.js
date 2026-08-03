const mongoose = require('mongoose');

// One document per trip day ("Day 1 · Arrival Day"), holding its activities.
const itineraryDaySchema = new mongoose.Schema(
  {
    group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Group',
      required: true,
      index: true,
    },
    dayNumber: { type: Number, required: true, min: 1, max: 365 },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    date: { type: Date, default: null },
    activities: [
      {
        time: { type: String, trim: true, maxlength: 20, default: '' },
        endTime: { type: String, trim: true, maxlength: 20, default: '' },
        title: { type: String, required: true, trim: true, maxlength: 200 },
        location: { type: String, trim: true, maxlength: 200, default: '' },
        // Ionicons name for the activity row glyph.
        icon: { type: String, trim: true, maxlength: 40, default: 'location-outline' },
        note: { type: String, trim: true, maxlength: 300, default: '' },
      },
    ],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

itineraryDaySchema.index({ group: 1, dayNumber: 1 }, { unique: true });

module.exports = mongoose.model('ItineraryDay', itineraryDaySchema);
