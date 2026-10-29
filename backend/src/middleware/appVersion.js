const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const appRelease = require('../services/appRelease.service');

/**
 * The force-update gate. The app names its platform and build number on every
 * request (X-App-Platform, X-App-Build; see mobile/src/api/client.js), and a
 * build below the lowest one an owner still allows is refused with 426 and
 * the code APP_UPDATE_REQUIRED, whatever it asked for. The app watches for
 * that code and shows its update wall, with the download link sent here.
 *
 * A request that does not name a build passes: the admin panel, /health,
 * curl, and every app build from before the headers existed. Those last ones
 * can never be forced, which is why the wall only works from the first build
 * that sends the headers.
 *
 * Mounted ahead of the routes in routes/index.js, after the public release
 * endpoint, which an old build must still be able to read.
 */
const APP_UPDATE_REQUIRED = 'APP_UPDATE_REQUIRED';

const appVersionGate = asyncHandler(async (req, _res, next) => {
  const build = appRelease.buildOf(req.get('X-App-Build'));
  const platform = appRelease.platformOf(req.get('X-App-Platform'));
  if (build === null || !platform) return next();

  let release;
  try {
    release = await appRelease.cachedRelease();
  } catch (err) {
    // Nothing to compare against: let the request through to whatever it was
    // for, which will fail in its own way if the database really is down.
    console.error('App release settings could not be read:', err.message);
    return next();
  }

  const verdict = appRelease.verdictFor(release, platform, build);
  if (verdict.updateRequired) {
    throw new ApiError(426, 'Please update Splix to continue.', {
      code: APP_UPDATE_REQUIRED,
      data: {
        platform,
        build,
        minBuild: verdict.minBuild,
        latestBuild: verdict.latestBuild,
        latestVersion: verdict.latestVersion,
        downloadUrl: verdict.downloadUrl,
        notes: verdict.notes,
      },
    });
  }
  return next();
});

module.exports = { appVersionGate, APP_UPDATE_REQUIRED };
