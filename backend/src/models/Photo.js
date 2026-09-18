const mongoose = require('mongoose');

/**
 * A gallery tile: an uploaded image, or (older rows) an emoji on a coloured tile.
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
    // Members who appear in the photo — drives the "👥 3" badge and, later,
    // the Face Scan filter.
    taggedMembers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

photoSchema.index({ group: 1, createdAt: -1 });

// `select: false` only hides storageKey on reads; a just-created document still
// carries it, so strip it from anything that is sent to a client.
photoSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.storageKey;
    return ret;
  },
});

module.exports = mongoose.model('Photo', photoSchema);
