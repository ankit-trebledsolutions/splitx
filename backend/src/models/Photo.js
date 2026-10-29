const mongoose = require('mongoose');

/**
 * A gallery tile: an uploaded image or video, or (older rows) an emoji on a
 * coloured tile. A video keeps the file in `imageUrl` like a photo does, and
 * its poster frame (if the phone could make one) in `thumbUrl`.
 */
const photoSchema = new mongoose.Schema(
  {
    group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Group',
      required: true,
      index: true,
    },
    emoji: { type: String, trim: true, maxlength: 8, default: '🖼️' },
    color: { type: String, trim: true, maxlength: 9, default: '#173A33' },
    imageUrl: { type: String, trim: true, maxlength: 2000, default: '' },
    // Small square version for the grid; the full image is only fetched when
    // someone opens or downloads the photo.
    thumbUrl: { type: String, trim: true, maxlength: 2000, default: '' },
    // Which storage provider holds the file and its id there, needed to delete
    // it. Kept per photo so images survive a later change of provider.
    storageProvider: { type: String, trim: true, maxlength: 20, default: '' },
    storageKey: { type: String, trim: true, maxlength: 500, default: '', select: false },
    caption: { type: String, trim: true, maxlength: 200, default: '' },
    mediaType: { type: String, enum: ['image', 'video'], default: 'image' },
    // Videos only: length of the clip, shown on its tile before it is played.
    durationMs: { type: Number, min: 0, default: 0 },
    // Members who appear in the photo — drives the "👥 3" badge and, later,
    // the Face Scan filter.
    taggedMembers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Face Scan (services/faceScan.worker.js). Every image waits for the
    // worker as `pending`, is `running` while in hand, then `done` with its
    // faces fingerprinted (`faces` says how many; 0 is a photo with nobody in
    // it). `skipped`: a video, an emoji tile or a row with no stored file.
    // `failed`: given up after the worker's attempts (`error` says why).
    faceScan: {
      status: {
        type: String,
        enum: ['pending', 'running', 'done', 'skipped', 'failed'],
        default: 'pending',
      },
      faces: { type: Number, default: 0 },
      attempts: { type: Number, default: 0 },
      startedAt: { type: Date, default: null },
      scannedAt: { type: Date, default: null },
      error: { type: String, default: null, maxlength: 200 },
    },
  },
  { timestamps: true }
);

photoSchema.index({ group: 1, createdAt: -1 });
// The worker's queue: the newest pending photo first.
photoSchema.index({ 'faceScan.status': 1, createdAt: -1 });

// `select: false` only hides storageKey on reads; a just-created document still
// carries it, so strip it from anything that is sent to a client.
photoSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.storageKey;
    return ret;
  },
});

module.exports = mongoose.model('Photo', photoSchema);
