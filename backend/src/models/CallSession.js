const mongoose = require('mongoose');

const { ObjectId } = mongoose.Schema.Types;

/**
 * One group call being paid for. The person who started it pays for each
 * started block of minutes (WalletSettings.callBlockMinutes); everyone who
 * joins is free.
 *
 * Opened when the app starts a call (callBilling.start), or by the sweep when
 * it finds a call on Stream that nobody announced, so a modified app that
 * skips the announcement is billed all the same.
 */
const callSessionSchema = new mongoose.Schema(
  {
    group: { type: ObjectId, ref: 'Group', required: true },
    startedBy: { type: ObjectId, ref: 'User', required: true },
    startedAt: { type: Date, default: Date.now },
    status: { type: String, enum: ['active', 'ended'], default: 'active' },
    blocksCharged: { type: Number, default: 0 },
    // The payer has been told the call will end soon for lack of credits.
    warned: { type: Boolean, default: false },
    // The billing sweep has seen the call live on Stream. A session closed
    // without ever being seen most likely never connected, so its first block
    // is given back.
    seenLive: { type: Boolean, default: false },
    endedAt: { type: Date, default: null },
    // left: everyone hung up · gone: Stream no longer has it · no_credits: we
    // ended it · replaced: a new call started in the group · free: calls were
    // made free mid-call
    endReason: { type: String, default: null },
  },
  { timestamps: false }
);

// One paid call per group at a time, across servers.
callSessionSchema.index({ group: 1 }, { unique: true, partialFilterExpression: { status: 'active' } });
callSessionSchema.index({ status: 1 });

module.exports = mongoose.model('CallSession', callSessionSchema);
