const mongoose = require('mongoose');

const { ObjectId, Mixed } = mongoose.Schema.Types;

/**
 * One AI planning run for a group's itinerary. The row is the whole job system:
 * the per-group lock, the daily spend counters, restart recovery, the
 * requester's last answers and the safety copy of a replaced itinerary all read
 * from here, so nothing about a run lives only in one server's memory.
 *
 * Only what toClient() in aiItinerary.service picks ever reaches the app.
 */
const itineraryJobSchema = new mongoose.Schema(
  {
    group: { type: ObjectId, ref: 'Group', required: true },
    requestedBy: { type: ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['running', 'done', 'failed'], default: 'running' },
    replace: { type: Boolean, default: false },
    // The validated request body minus `replace`. Never AI text.
    prefs: { type: Mixed, default: {} },
    // { destination, startDate, days, groupSize, tripContinuesAfter }, fixed at
    // the start so the run plans exactly what the requester confirmed.
    resolved: { type: Mixed, default: {} },
    // Group fields to fill in once the plan is saved: { location?, startDate?, totalDays? }.
    writeBack: { type: Mixed, default: {} },
    // The old days, copied here just before a replace deletes them, and the ids
    // of the days taking their place. Present only while that swap is under way.
    backupDays: { type: [Mixed], default: undefined },
    newDayIds: { type: [ObjectId], default: undefined },
    dayCount: { type: Number, default: 0 },
    errorCode: { type: String, default: null },
    // Always one of the fixed messages, never OpenAI's own text.
    errorMessage: { type: String, default: null, maxlength: 200 },
    // Not "model": that name clashes with Mongoose's own document members.
    aiModel: { type: String, default: null },
    usage: { inputTokens: Number, outputTokens: Number, reasoningTokens: Number },
    // OpenAI may have charged for this run, so it counts towards the daily caps
    // even though it failed.
    billed: { type: Boolean, default: false },
    startedAt: { type: Date, default: Date.now },
    finishedAt: { type: Date, default: null },
  },
  { timestamps: false }
);

// The lock: a group can hold one running job. A second create() fails with a
// duplicate-key error, which also holds across server instances.
itineraryJobSchema.index(
  { group: 1 },
  { unique: true, partialFilterExpression: { status: 'running' } }
);
itineraryJobSchema.index({ group: 1, startedAt: -1 });
itineraryJobSchema.index({ requestedBy: 1, startedAt: -1 });
itineraryJobSchema.index({ startedAt: -1 });

module.exports = mongoose.model('ItineraryJob', itineraryJobSchema);
