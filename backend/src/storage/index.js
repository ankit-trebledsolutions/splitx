const integrations = require('../integrations/store');
const r2Storage = require('./r2.storage');
const localStorage = require('./local.storage');

/**
 * Where uploaded files live. Everything outside this folder talks to storage
 * through these functions only, so moving to another provider means adding one
 * file here and nothing else.
 *
 * A provider exports:
 *   upload(file, { folder })  -> { url, thumbUrl, key }
 *       file is a multer memory file: { buffer, mimetype, originalname }
 *       url      the file itself
 *       thumbUrl small square for grids (may equal url if no square was made)
 *       key      whatever the provider needs later to delete the file
 *   remove(key)               -> void   (must not throw if already gone)
 *
 * Each photo and message records which provider stored its file, so files
 * uploaded before a switch can still be found and deleted afterwards. Files
 * still marked "cloudinary" belong to an account this server no longer talks
 * to: scripts/migrate-files-to-r2.js copies them over.
 */
const providers = {
  r2: r2Storage,
  local: localStorage,
};

// R2 once its keys are present; the local uploads folder otherwise, so the API
// still runs on a machine that has no storage account set up. Decided per
// upload: the keys can arrive, or change, while the server runs.
const activeName = () => (integrations.r2() ? 'r2' : 'local');

const upload = async (file, options) => {
  const name = activeName();
  const stored = await providers[name].upload(file, options);
  return { ...stored, provider: name };
};

const remove = async (key, providerName) => {
  const provider = providers[providerName];
  if (!provider || !key) return;
  try {
    await provider.remove(key);
  } catch (err) {
    // A photo row must still be deletable if its file is already gone.
    console.error(`[storage] could not remove ${providerName}:${key}:`, err.message);
  }
};

// For GET /media/<key>: a short-lived link to the file in the private bucket,
// or null when there is no bucket to ask.
const linkTo = async (key) => (integrations.r2() ? r2Storage.signedUrl(key) : null);

module.exports = {
  upload,
  remove,
  linkTo,
  get activeProvider() {
    return activeName();
  },
};
