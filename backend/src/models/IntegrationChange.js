const mongoose = require('mongoose');
const { INTEGRATION_KEYS } = require('../integrations/definitions');

// Who changed which service's keys, and when.
//
// Whoever holds these keys can read every email Splix sends and every photo it
// stores, so a change to them is worth being able to look up afterwards. Only
// the names of the fields are kept. The values never are: a log is read far
// more widely than the settings it describes.
const integrationChangeSchema = new mongoose.Schema(
  {
    integration: { type: String, required: true, enum: INTEGRATION_KEYS },
    action: { type: String, required: true, enum: ['update', 'reset'] },
    // Field labels as the panel shows them, e.g. ['API key', 'Sender address'].
    fields: { type: [String], default: [] },
    // Copied rather than referenced: the entry has to outlive the account.
    actorId: { type: String, required: true },
    actorName: { type: String, required: true, maxlength: 60 },
    actorEmail: { type: String, required: true, maxlength: 120 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

integrationChangeSchema.index({ createdAt: -1 });

module.exports = mongoose.model('IntegrationChange', integrationChangeSchema);
