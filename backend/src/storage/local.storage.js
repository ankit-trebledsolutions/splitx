const fs = require('fs');
const path = require('path');

// Development fallback: files in backend/uploads, served by express.static in
// app.js. Not for production: hosts like Render wipe this folder on every deploy.
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');
// A video's poster frame sits next to it under the same name plus this.
const POSTER_SUFFIX = '.thumb.jpg';

const upload = async (file, { poster = null } = {}) => {
  await fs.promises.mkdir(UPLOAD_DIR, { recursive: true });
  const safe = file.originalname.replace(/[^a-z0-9._-]/gi, '_').slice(-60);
  const filename = `${Date.now()}-${Math.round(Math.random() * 1e6)}-${safe}`;
  const target = path.join(UPLOAD_DIR, filename);
  // Videos arrive in multer's temp folder; everything else is in memory.
  if (file.path) await fs.promises.copyFile(file.path, target);
  else await fs.promises.writeFile(target, file.buffer);
  const url = `/uploads/${filename}`;
  if (poster) {
    await fs.promises.writeFile(`${target}${POSTER_SUFFIX}`, poster);
    return { url, thumbUrl: `${url}${POSTER_SUFFIX}`, key: filename };
  }
  // No resizing locally, so the grid just uses the full image.
  return { url, thumbUrl: url, key: filename };
};

const remove = async (key) => {
  // basename: a stored key can never reach outside the uploads folder.
  const file = path.join(UPLOAD_DIR, path.basename(key));
  // A poster, if the file had one, goes with it.
  await Promise.all([
    fs.promises.rm(file, { force: true }),
    fs.promises.rm(`${file}${POSTER_SUFFIX}`, { force: true }),
  ]);
};

module.exports = { upload, remove };
