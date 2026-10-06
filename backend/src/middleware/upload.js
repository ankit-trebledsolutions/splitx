const multer = require('multer');
const ApiError = require('../utils/ApiError');

// Phones compress before uploading, so 10MB is plenty; the Nginx in front
// allows a little more than this (deploy/nginx) so this limit is the one hit.
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

// Held in memory only long enough to hand to the storage provider (see
// src/storage); nothing is written to this server's disk.
const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(ApiError.badRequest('Only image files can be uploaded'));
  },
});

// Chat attachments: photos, voice notes and documents, so any type is accepted.
const chatUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
});

module.exports = { photoUpload, chatUpload };
