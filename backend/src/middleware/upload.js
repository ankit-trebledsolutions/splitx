const multer = require('multer');
const ApiError = require('../utils/ApiError');

// Held in memory only long enough to hand to the storage provider (see
// src/storage); nothing is written to this server's disk. 10MB is the largest
// image Cloudinary's free plan accepts, and phones compress before uploading.
const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(ApiError.badRequest('Only image files can be uploaded'));
  },
});

module.exports = { photoUpload };
