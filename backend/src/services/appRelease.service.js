const AppRelease = require('../models/AppRelease');

const { DEFAULTS, PLATFORMS } = AppRelease;

/**
 * Which app builds are allowed in. The settings are read on every request the
 * app makes (see middleware/appVersion.js), so unlike the wallet's they are
 * cached in memory for a short while rather than fetched each time. A change
 * made in the admin panel reaches this process at once and every other
 * process within CACHE_MS.
 */
const CACHE_MS = 60 * 1000;

const platformOf = (value) => {
  const name = String(value ?? '').trim().toLowerCase();
  return PLATFORMS.includes(name) ? name : null;
};

// The build number as the app sends it: a positive whole number, or null for
// anything else (no header, a dev build that has none, a hand-made request).
const buildOf = (value) => {
  const text = String(value ?? '').trim();
  if (!/^\d{1,9}$/.test(text)) return null;
  const build = Number(text);
  return build > 0 ? build : null;
};

const withPlatformDefaults = (doc, platform) => ({
  minBuild: doc?.[platform]?.minBuild ?? DEFAULTS[platform].minBuild,
  latestBuild: doc?.[platform]?.latestBuild ?? DEFAULTS[platform].latestBuild,
  latestVersion: doc?.[platform]?.latestVersion ?? DEFAULTS[platform].latestVersion,
  downloadUrl: doc?.[platform]?.downloadUrl ?? DEFAULTS[platform].downloadUrl,
  notes: doc?.[platform]?.notes ?? DEFAULTS[platform].notes,
});

const withDefaults = (doc) => ({
  android: withPlatformDefaults(doc, 'android'),
  ios: withPlatformDefaults(doc, 'ios'),
  updatedAt: doc?.updatedAt ?? null,
});

const getRelease = async () => withDefaults(await AppRelease.findOne({ key: 'app' }).lean());

let cache = null; // { value, expires }

const resetCache = () => {
  cache = null;
};

// The current settings, from memory when they were read lately. When the
// database cannot be asked, the last known value is kept rather than letting
// the gate fall over: whatever the request was, the gate is not its point.
const cachedRelease = async () => {
  const now = Date.now();
  if (cache && cache.expires > now) return cache.value;
  try {
    const value = await getRelease();
    cache = { value, expires: now + CACHE_MS };
    return value;
  } catch (err) {
    if (cache) return cache.value;
    throw err;
  }
};

const updateRelease = async (values, actor) => {
  const $set = { updatedBy: actor._id };
  for (const platform of PLATFORMS) {
    const given = values[platform];
    $set[`${platform}.minBuild`] = given.minBuild;
    $set[`${platform}.latestBuild`] = given.latestBuild;
    $set[`${platform}.latestVersion`] = given.latestVersion;
    $set[`${platform}.downloadUrl`] = given.downloadUrl;
    $set[`${platform}.notes`] = given.notes;
  }
  const doc = await AppRelease.findOneAndUpdate(
    { key: 'app' },
    { $set },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();
  resetCache();
  return withDefaults(doc);
};

// What one build on one platform is told. `build` may be null (unknown), in
// which case nothing is required or offered: there is nothing to compare.
const verdictFor = (release, platform, build) => {
  const target = release[platform];
  return {
    platform,
    build,
    minBuild: target.minBuild,
    latestBuild: target.latestBuild,
    latestVersion: target.latestVersion,
    downloadUrl: target.downloadUrl,
    notes: target.notes,
    updateRequired: build !== null && build < target.minBuild,
    updateAvailable: build !== null && build < target.latestBuild,
  };
};

module.exports = {
  CACHE_MS,
  platformOf,
  buildOf,
  getRelease,
  cachedRelease,
  resetCache,
  updateRelease,
  verdictFor,
};
