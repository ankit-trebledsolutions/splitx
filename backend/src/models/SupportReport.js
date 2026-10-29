const mongoose = require('mongoose');

/**
 * Something a person told us from inside the app: a bug, an idea, trouble
 * with a payment or their account, a member they want to report, or just a
 * message. Profile > Help & Support > Report a Problem makes one; Contact Us
 * makes one of category `general`. The admin panel's Support module reads
 * them, works them through the statuses below and answers.
 *
 * Stored in the `supportmessages` collection on purpose: that is where the
 * Contact Us form has always written, and the rows it made are kept as
 * `general` reports rather than being left behind in a collection nothing
 * reads any more. Those older rows have `name` and `email` and no category;
 * the schema defaults fill in the rest when they are read.
 */

const CATEGORIES = ['bug', 'feature', 'payment', 'account', 'abuse', 'general'];
const STATUSES = ['open', 'in_progress', 'resolved', 'closed'];
const PRIORITIES = ['low', 'normal', 'high'];
// What one entry in a report's timeline is.
const EVENT_KINDS = ['reply', 'note', 'status', 'priority'];

// Statuses in which somebody still has to do something.
const OPEN_STATUSES = ['open', 'in_progress'];

const MAX_ATTACHMENTS = 3;

// A screenshot the person attached. Same shape as a chat attachment, so the
// same storage code stores and removes it.
const attachmentSchema = new mongoose.Schema(
  {
    url: { type: String, trim: true, maxlength: 2000, required: true },
    thumbUrl: { type: String, trim: true, maxlength: 2000, default: '' },
    mimeType: { type: String, trim: true, maxlength: 120, default: '' },
    size: { type: Number, min: 0, default: 0 },
    storageProvider: { type: String, trim: true, maxlength: 20, default: '' },
    storageKey: { type: String, trim: true, maxlength: 500, default: '', select: false },
  },
  { _id: false }
);

// The report's timeline, oldest first. A `reply` is what the person sees; a
// `note` is for admins only; `status` and `priority` record a change and what
// it was changed to. `byName` is kept as text, like EmailTemplate.updatedBy,
// so the timeline still reads properly after the admin account is gone.
const eventSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: EVENT_KINDS, required: true },
    body: { type: String, trim: true, maxlength: 2000, default: '' },
    status: { type: String, enum: STATUSES },
    priority: { type: String, enum: PRIORITIES },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    byName: { type: String, trim: true, maxlength: 60, default: '' },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

// What the phone said about itself when the report was sent. All optional:
// the server never refuses a report for not knowing the OS.
const deviceSchema = new mongoose.Schema(
  {
    platform: { type: String, trim: true, maxlength: 20, default: '' },
    model: { type: String, trim: true, maxlength: 60, default: '' },
    osVersion: { type: String, trim: true, maxlength: 40, default: '' },
    appVersion: { type: String, trim: true, maxlength: 40, default: '' },
    build: { type: String, trim: true, maxlength: 40, default: '' },
  },
  { _id: false }
);

const supportReportSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    category: { type: String, enum: CATEGORIES, default: 'general' },
    // `subject` and `message` rather than title and description: the field
    // names the Contact Us rows already carry, kept so those rows read back.
    subject: { type: String, required: true, trim: true, maxlength: 150 },
    message: { type: String, required: true, trim: true, maxlength: 2000 },
    attachments: { type: [attachmentSchema], default: [] },
    device: { type: deviceSchema, default: () => ({}) },
    status: { type: String, enum: STATUSES, default: 'open' },
    priority: { type: String, enum: PRIORITIES, default: 'normal' },
    events: { type: [eventSchema], default: [] },
    // Older Contact Us rows only: the name and address typed into the form.
    // New reports carry neither; the reporter is `user`.
    name: { type: String, trim: true, maxlength: 80 },
    email: { type: String, trim: true, lowercase: true, maxlength: 120 },
  },
  { timestamps: true }
);

// A person's own reports, newest first; the panel's queue, by status.
supportReportSchema.index({ user: 1, createdAt: -1 });
supportReportSchema.index({ status: 1, createdAt: -1 });

// `select: false` only hides storageKey on reads; a just-created document still
// carries it, so strip it from anything that is sent to a client.
supportReportSchema.set('toJSON', {
  transform(_doc, ret) {
    for (const attachment of ret.attachments || []) delete attachment.storageKey;
    return ret;
  },
});

const SupportReport = mongoose.model('SupportReport', supportReportSchema, 'supportmessages');

module.exports = SupportReport;
module.exports.CATEGORIES = CATEGORIES;
module.exports.STATUSES = STATUSES;
module.exports.PRIORITIES = PRIORITIES;
module.exports.EVENT_KINDS = EVENT_KINDS;
module.exports.OPEN_STATUSES = OPEN_STATUSES;
module.exports.MAX_ATTACHMENTS = MAX_ATTACHMENTS;
