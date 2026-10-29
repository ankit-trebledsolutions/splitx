const mongoose = require('mongoose');

/**
 * One fresh call to the places provider: a cache miss or a forced refresh.
 * Nothing else is recorded here. The daily caps count these rows, so they
 * survive restarts and hold across several server instances, the same way
 * the AI planner counts its job rows.
 */
const placeLookupSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
    // 'search' is a name search on one of the tabs; it has its own caps.
    type: { type: String, required: true, enum: ['stay', 'attraction', 'search'] },
    key: { type: String, required: true },
    at: { type: Date, required: true, default: Date.now },
  },
  { timestamps: false }
);

placeLookupSchema.index({ user: 1, at: -1 });
placeLookupSchema.index({ at: -1 });
// Two days is enough for a 24-hour window with room for clock drift.
placeLookupSchema.index({ at: 1 }, { expireAfterSeconds: 2 * 24 * 60 * 60 });

module.exports = mongoose.model('PlaceLookup', placeLookupSchema);
