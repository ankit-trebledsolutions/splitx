const mongoose = require('mongoose');

/**
 * A gallery tile. Real image upload does not exist yet (see Avatar.js), so a
 * photo is an emoji on a coloured tile until storage lands; `imageUrl` is
 * already in the schema for when it does.
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
    caption: { type: String, trim: true, maxlength: 200, default: '' },
    // Members who appear in the photo — drives the "👥 3" badge and, later,
    // the Face Scan filter.
    taggedMembers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

photoSchema.index({ group: 1, createdAt: -1 });

module.exports = mongoose.model('Photo', photoSchema);
