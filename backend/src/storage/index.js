const env = require('../config/env');
const cloudinaryStorage = require('./cloudinary.storage');
const localStorage = require('./local.storage');

/**
 * Where uploaded images live. Everything outside this folder talks to storage
 * through these three functions only, so moving to another provider (S3 is the
 * plan) means adding one file here and nothing else.
 *
 * A provider exports:
 *   upload(file, { folder })  -> { url, thumbUrl, key }
 *       file is a multer memory file: { buffer, mimetype, originalname }
 *       url      full-size image
 *       thumbUrl small square for grids (may equal url if the provider can't resize)
 *       key      whatever the provider needs later to delete the image
 *   remove(key)               -> void   (must not throw if already gone)
 *
 * Each photo records which provider stored it, so images uploaded before a
 * switch keep working and can still be deleted afterwards.
 */
const providers = {
  cloudinary: cloudinaryStorage,
  local: localStorage,
};

// Cloudinary once its keys are present; the local uploads folder otherwise, so
// the API still runs on a machine that has no storage account set up.
const activeName = env.cloudinary ? 'cloudinary' : 'local';

const upload = async (file, options) => {
  const stored = await providers[activeName].upload(file, options);
  return { ...stored, provider: activeName };
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

module.exports = { upload, remove, activeProvider: activeName };
