const mongoose = require('mongoose');

/**
 * What the places provider last said about one destination, shared by every
 * group heading there. One row per (type, destination): the hotels, the
 * attractions, and the destination itself as the provider resolved it.
 *
 * Why a cache at all: the provider is asked once per destination per day
 * however many people open the tab, so cost grows with destinations, not
 * with users. The data is OpenStreetMap's, which may be stored; a provider
 * whose terms forbid storing results would set cacheHours to 0 in
 * services/placeSuggestion.service.js and this collection would stay empty.
 *
 * Rows expire on their own (TTL index on expiresAt); readers still check the
 * date, because the TTL sweep runs once a minute.
 */
const placeCacheSchema = new mongoose.Schema(
  {
    // `${type}|${normalized destination}`, see cacheKey() in the service.
    key: { type: String, required: true, unique: true },
    type: { type: String, required: true, enum: ['stay', 'attraction', 'destination'] },
    // The destination as a group typed it, for display.
    destination: { type: String, required: true, maxlength: 120 },
    // What the geocoder made of it: { placeId, name, lat, lon }. Null for a
    // destination it did not recognise, kept briefly so it is not asked again
    // on every open.
    resolved: { type: mongoose.Schema.Types.Mixed, default: null },
    items: { type: [mongoose.Schema.Types.Mixed], default: [] },
    fetchedAt: { type: Date, required: true, default: Date.now },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: false }
);

placeCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('PlaceCache', placeCacheSchema);
