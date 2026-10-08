const os = require('os');
const multer = require('multer');
const ApiError = require('../utils/ApiError');

// Phones compress before uploading, so 10MB is plenty; the Nginx in front
// allows a little more than the video cap (deploy/nginx) so these limits are
// the ones hit.
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
// Phones do not shrink videos when sharing them, so a clip needs far more room
// than a photo. Kept under the 100 MB a request may carry through Cloudflare's
// proxy (the domain setup in deploy/), with room for the poster and the form.
const MAX_VIDEO_BYTES = 90 * 1024 * 1024;
// The frame a phone sends along with a video, for its tile. Phones save it at
// the video's own resolution, so a 4K clip's frame can run to a few MB; it is
// shrunk to a small square either way. A bigger one is left out, not refused.
const MAX_POSTER_BYTES = 10 * 1024 * 1024;

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

// Gallery videos: a `video` file plus an optional `poster` image. Written to a
// temp file rather than held in memory, so a few large uploads at once cannot
// fill the server's RAM; the controller deletes the temp files when done.
const videoUpload = multer({
  storage: multer.diskStorage({ destination: os.tmpdir() }),
  limits: { fileSize: MAX_VIDEO_BYTES, files: 2 },
  fileFilter: (_req, file, cb) => {
    if (file.fieldname === 'video' && /^video\//.test(file.mimetype)) cb(null, true);
    else if (file.fieldname === 'poster' && /^image\//.test(file.mimetype)) cb(null, true);
    else if (file.fieldname === 'poster') cb(ApiError.badRequest('The poster must be an image'));
    else cb(ApiError.badRequest('Only video files can be uploaded here'));
  },
});

module.exports = {
  photoUpload,
  chatUpload,
  videoUpload,
  MAX_UPLOAD_BYTES,
  MAX_VIDEO_BYTES,
  MAX_POSTER_BYTES,
};
