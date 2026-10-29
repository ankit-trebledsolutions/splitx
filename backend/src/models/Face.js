const mongoose = require('mongoose');

/**
 * One face found in one gallery photo, written by the Face Scan worker (see
 * services/faceScan.worker.js) and read by a scan (services/faceScan.service.js).
 *
 * `embedding` is the face's fingerprint: little-endian float32 numbers (128
 * of them, 512 bytes, with the current model) from the face service, scaled
 * to unit length so two faces compare with a dot product. Only the numbers
 * are kept, never a crop of the face; the box says where in the photo it was.
 * Rows go with their photo, and with the group.
 */
const faceSchema = new mongoose.Schema(
  {
    photo: { type: mongoose.Schema.Types.ObjectId, ref: 'Photo', required: true, index: true },
    group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true, index: true },
    // x1, y1, x2, y2 as fractions (0..1) of the photo's width and height, the
    // photo taken the right way up.
    box: { type: [Number], required: true },
    // The detector's confidence, 0..1.
    score: { type: Number, default: 0 },
    // Which model made the fingerprint (the service names it). Fingerprints
    // from different models do not compare, so a scan only looks at its own.
    model: { type: String, default: '', maxlength: 60 },
    embedding: { type: Buffer, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

module.exports = mongoose.model('Face', faceSchema);
