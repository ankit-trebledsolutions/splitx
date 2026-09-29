const mongoose = require('mongoose');
const { TEMPLATE_KEYS } = require('../emails/defaults');

// What an admin has changed about one of Splix's emails.
//
// A document exists only for an email somebody has touched in the panel. The
// designs themselves live in code (emails/defaults.js) and are what is sent
// when there is no document, so an untouched email keeps following the code
// and nothing has to be seeded before the first email can go out.
const emailTemplateSchema = new mongoose.Schema(
  {
    // Which email this is. One of emails/defaults.js, and never changes.
    key: { type: String, required: true, unique: true, enum: TEMPLATE_KEYS, immutable: true },
    // False stops the email being sent. Ignored for the emails that carry a
    // code — see `required` in emails/defaults.js.
    isActive: { type: Boolean, default: true },
    // True once the wording below is the admin's own. False means only the
    // switch above was used and the built-in design still applies.
    customized: { type: Boolean, default: false },
    subject: { type: String, trim: true, maxlength: 200 },
    // The grey line inboxes show next to the subject.
    preheader: { type: String, trim: true, maxlength: 200 },
    // HTML that goes inside the card; the frame around it is emails/layout.js.
    body: { type: String, maxlength: 100000 },
    text: { type: String, maxlength: 20000 },
    // Footer line saying why this person got the email.
    reason: { type: String, trim: true, maxlength: 300 },
    // A name rather than a reference: it is only ever shown, and a reference
    // would be one more thing to clean up when an admin account is deleted.
    updatedBy: { type: String, trim: true, maxlength: 60, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('EmailTemplate', emailTemplateSchema);
