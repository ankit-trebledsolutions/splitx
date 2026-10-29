const mongoose = require('mongoose');

/**
 * How the app presents itself: its name and its logo. One document, edited by
 * owners in the admin panel (General Settings > Branding); whatever it does
 * not hold comes from DEFAULTS, so with nothing ever saved the app is Splix
 * with the Splix logo, as it always was.
 *
 *   appName  shown wherever the app names itself: the splash screen wordmark,
 *            the admin panel's sidebar and sign-in page, the invite messages.
 *            The wordmark keeps its lettering and its "x" whatever the name is
 *            (see mobile/src/components/BrandWordmark.js).
 *   logo     the uploaded image, stored like any other file (src/storage), or
 *            null for the built-in Splix mark. The app and the panel draw the
 *            uploaded one when there is one and their own asset otherwise.
 */
const NAME_MIN = 2;
const NAME_MAX = 20;

const DEFAULTS = {
  appName: 'Splix',
  logo: null,
};

const logoSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    thumbUrl: { type: String, default: '' },
    // Whatever the storage provider needs to delete the file again.
    key: { type: String, default: '' },
    provider: { type: String, default: '' },
  },
  { _id: false }
);

const brandingSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'app', unique: true },
    appName: { type: String, trim: true, minlength: NAME_MIN, maxlength: NAME_MAX, default: DEFAULTS.appName },
    logo: { type: logoSchema, default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Branding', brandingSchema);
module.exports.DEFAULTS = DEFAULTS;
module.exports.NAME_MIN = NAME_MIN;
module.exports.NAME_MAX = NAME_MAX;
