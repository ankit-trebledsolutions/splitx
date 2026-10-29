const mongoose = require('mongoose');

/**
 * Which builds of the app are still allowed in, per platform. One document,
 * edited by owners in the admin panel; whatever it does not hold comes from
 * DEFAULTS.
 *
 * Builds are compared by their number (Android versionCode, iOS build
 * number), never by the "1.2.0" label: the number is a plain integer that
 * goes up with every release, so "older" is just "less than".
 *
 *   minBuild      the lowest build still allowed to talk to the server. A
 *                 build below it is answered 426 APP_UPDATE_REQUIRED on every
 *                 request and the app shows its update wall. 0 = nobody is
 *                 forced, which is how it starts.
 *   latestBuild   the newest build that exists. A build below it is told an
 *                 update is available, once, and left alone.
 *   latestVersion the label of that build, for people ("1.2.0").
 *   downloadUrl   where "Update now" sends them: the APK for now, the store
 *                 page once the app is listed. Required to force an update.
 *   notes         what is new, shown on the update wall.
 */
const PLATFORMS = ['android', 'ios'];

const PLATFORM_DEFAULTS = {
  minBuild: 0,
  latestBuild: 0,
  latestVersion: '',
  downloadUrl: '',
  notes: '',
};

const DEFAULTS = {
  android: { ...PLATFORM_DEFAULTS },
  ios: { ...PLATFORM_DEFAULTS },
};

const platformSchema = {
  minBuild: { type: Number, min: 0, default: 0 },
  latestBuild: { type: Number, min: 0, default: 0 },
  latestVersion: { type: String, default: '' },
  downloadUrl: { type: String, default: '' },
  notes: { type: String, default: '' },
};

const appReleaseSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'app', unique: true },
    android: platformSchema,
    ios: platformSchema,
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AppRelease', appReleaseSchema);
module.exports.DEFAULTS = DEFAULTS;
module.exports.PLATFORMS = PLATFORMS;
