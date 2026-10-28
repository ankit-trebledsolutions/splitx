const asyncHandler = require('../utils/asyncHandler');
const appRelease = require('../services/appRelease.service');

// Public. What the calling build is told about updates: the platform comes
// from the header the app sends on every request, or ?platform= for anyone
// else, and the build from the header, so the answer says outright whether
// an update is required or merely available. An old build is never refused
// here: this is how it learns where the new one is.
const getRelease = asyncHandler(async (req, res) => {
  const platform =
    appRelease.platformOf(req.query.platform) ?? appRelease.platformOf(req.get('X-App-Platform')) ?? 'android';
  const build = appRelease.buildOf(req.get('X-App-Build'));
  const release = await appRelease.cachedRelease();
  res.json({ success: true, data: { release: appRelease.verdictFor(release, platform, build) } });
});

// Admin panel, owners only.
const getSettings = asyncHandler(async (_req, res) => {
  const settings = await appRelease.getRelease();
  res.json({ success: true, data: { settings } });
});

const updateSettings = asyncHandler(async (req, res) => {
  const settings = await appRelease.updateRelease(req.body, req.user);
  res.json({ success: true, data: { settings } });
});

module.exports = { getRelease, getSettings, updateSettings };
