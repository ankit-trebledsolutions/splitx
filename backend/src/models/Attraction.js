const mongoose = require('mongoose');

// A nearby place the group is considering ("TeamLab Planets · Art & Immersive").
const attractionSchema = new mongoose.Schema(
  {
    group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Group',
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    category: { type: String, trim: true, maxlength: 60, default: '' },
    rating: { type: Number, min: 0, max: 5, default: null },
    distanceKm: { type: Number, min: 0, max: 10000, default: null },
    emoji: { type: String, trim: true, maxlength: 8, default: '📍' },
    // Members who bookmarked it; the card shows the filled bookmark when the
    // current user is in here.
    savedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Attraction', attractionSchema);
