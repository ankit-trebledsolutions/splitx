const mongoose = require('mongoose');
const { INTEGRATION_KEYS } = require('../integrations/definitions');

// What an admin has set for one outside service (Resend, OpenAI, ...) in the
// panel. A document exists only for a service somebody has changed there:
// everything else runs on the values the server was set up with.
const integrationSettingSchema = new mongoose.Schema(
  {
    // Which service. One of integrations/definitions.js, and never changes.
    key: { type: String, required: true, unique: true, enum: INTEGRATION_KEYS, immutable: true },
    // Values that are not secret (a sender address, a model name), as typed.
    values: { type: Map, of: { type: String, maxlength: 500 }, default: {} },
    // API keys and secrets, locked by integrations/vault.js. Never sent to the
    // panel, and never readable without SETTINGS_ENCRYPTION_KEY.
    secrets: { type: Map, of: { type: String, maxlength: 2000 }, default: {} },
    // The last four characters of each secret: all the panel shows of one.
    hints: { type: Map, of: { type: String, maxlength: 8 }, default: {} },
    // A name rather than a reference, as on email templates: it is only shown.
    updatedBy: { type: String, trim: true, maxlength: 60, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('IntegrationSetting', integrationSettingSchema);
