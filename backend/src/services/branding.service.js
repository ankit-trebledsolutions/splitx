const sharp = require('sharp');
const Branding = require('../models/Branding');
const ApiError = require('../utils/ApiError');
const storage = require('../storage');

const { DEFAULTS } = Branding;

/**
 * The app's name and logo (General Settings > Branding). Read by every phone
 * when the app opens and by the admin panel on every page, so like the
 * release settings they are cached in memory for a short while. A change in
 * the panel reaches this process at once and every other within CACHE_MS.
 */
const CACHE_MS = 60 * 1000;

// Where uploaded logos go in the file store, next to the gallery folders.
const LOGO_FOLDER = 'splix/branding';
// Logos are drawn small (a 64 to 88 point badge in the app, 28 pixels in the
// panel's sidebar). Anything larger than this is shrunk before it is stored.
const LOGO_MAX_SIDE = 512;

const withDefaults = (doc) => ({
  appName: (doc?.appName ?? '').trim() || DEFAULTS.appName,
  logo: doc?.logo?.url ? doc.logo : DEFAULTS.logo,
  updatedAt: doc?.updatedAt ?? null,
});

const getBranding = async () => withDefaults(await Branding.findOne({ key: 'app' }).lean());

let cache = null; // { value, expires }

const resetCache = () => {
  cache = null;
};

// The current branding, from memory when it was read lately. When the
// database cannot be asked, the last known value is kept rather than failing
// a request that was only ever about the name on a screen.
const cachedBranding = async () => {
  const now = Date.now();
  if (cache && cache.expires > now) return cache.value;
  try {
    const value = await getBranding();
    cache = { value, expires: now + CACHE_MS };
    return value;
  } catch (err) {
    if (cache) return cache.value;
    throw err;
  }
};

const save = async ($set) => {
  const doc = await Branding.findOneAndUpdate(
    { key: 'app' },
    { $set },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();
  resetCache();
  return withDefaults(doc);
};

const updateName = (values, actor) => save({ appName: values.appName.trim(), updatedBy: actor._id });

// The logo as stored, or null. Read separately from the update so the file
// being replaced can be removed once the new one is in place.
const currentLogo = async () => {
  const doc = await Branding.findOne({ key: 'app' }).select('logo').lean();
  return doc?.logo?.key ? doc.logo : null;
};

const removeFile = (logo) => (logo ? storage.remove(logo.key, logo.provider) : Promise.resolve());

/**
 * A new logo: the uploaded image (a multer memory file) is put the right way
 * up, shrunk to at most LOGO_MAX_SIDE on its longer side and re-encoded as
 * PNG, so what is stored is a known size and format with no camera metadata.
 * Transparency survives. The previous logo's file goes once the new one is
 * saved.
 */
const setLogo = async (file, actor) => {
  if (!file?.buffer) throw ApiError.badRequest('Choose an image to upload');
  let png;
  try {
    png = await sharp(file.buffer, { failOn: 'none' })
      .rotate()
      .resize(LOGO_MAX_SIDE, LOGO_MAX_SIDE, { fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer();
  } catch {
    throw ApiError.badRequest('That file could not be read as an image');
  }
  const previous = await currentLogo();
  const stored = await storage.upload(
    { buffer: png, mimetype: 'image/png', originalname: 'logo.png', size: png.length },
    { folder: LOGO_FOLDER }
  );
  const logo = { url: stored.url, thumbUrl: stored.thumbUrl, key: stored.key, provider: stored.provider };
  let branding;
  try {
    branding = await save({ logo, updatedBy: actor._id });
  } catch (err) {
    // The row could not be written: the file would sit in the bucket unreferenced.
    await removeFile(logo);
    throw err;
  }
  // storage.remove never throws, and the new logo is already in place.
  await removeFile(previous);
  return branding;
};

// Back to the built-in mark. The file goes too.
const removeLogo = async (actor) => {
  const previous = await currentLogo();
  const branding = await save({ logo: null, updatedBy: actor._id });
  await removeFile(previous);
  return branding;
};

module.exports = {
  CACHE_MS,
  LOGO_FOLDER,
  LOGO_MAX_SIDE,
  getBranding,
  cachedBranding,
  resetCache,
  updateName,
  setLogo,
  removeLogo,
};
