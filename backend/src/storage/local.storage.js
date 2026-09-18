const fs = require('fs');
const path = require('path');

// Development fallback: files in backend/uploads, served by express.static in
// app.js. Not for production: hosts like Render wipe this folder on every deploy.
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');

const upload = async (file) => {
  await fs.promises.mkdir(UPLOAD_DIR, { recursive: true });
  const safe = file.originalname.replace(/[^a-z0-9._-]/gi, '_').slice(-60);
  const filename = `${Date.now()}-${Math.round(Math.random() * 1e6)}-${safe}`;
  await fs.promises.writeFile(path.join(UPLOAD_DIR, filename), file.buffer);
  const url = `/uploads/${filename}`;
  // No resizing locally, so the grid just uses the full image.
  return { url, thumbUrl: url, key: filename };
};

const remove = async (key) => {
  // basename: a stored key can never reach outside the uploads folder.
  await fs.promises.rm(path.join(UPLOAD_DIR, path.basename(key)), { force: true });
};

module.exports = { upload, remove };
