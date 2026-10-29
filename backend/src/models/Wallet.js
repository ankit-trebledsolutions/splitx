const mongoose = require('mongoose');

const { ObjectId } = mongoose.Schema.Types;

/**
 * A change applied to the balance whose history row is not written yet. It
 * carries everything that row needs, so a crash between the two writes loses
 * nothing: wallet.service copies it across on the next pass.
 */
const pendingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    type: { type: String, required: true },
    free: { type: Number, required: true },
    paid: { type: Number, required: true },
    freeAfter: { type: Number, required: true },
    paidAfter: { type: Number, required: true },
    feature: { type: String, default: null },
    ref: { type: String, default: null },
    note: { type: String, default: null },
    by: { type: ObjectId, ref: 'User', default: null },
    at: { type: Date, required: true },
  },
  { _id: false }
);

/**
 * A person's credits, in two pots that the app shows as one total:
 *   free  this month's free credits: spent first, topped up each month
 *   paid  everything else (signup bonus, admin grants, later purchases): never expires
 *
 * Only wallet.service changes this document, and every change it makes also
 * becomes a CreditTransaction, so the history always explains the balance.
 *
 * No Mongo transactions (a standalone mongod has none). Instead:
 *   version  the optimistic lock: a change is written only if nothing else
 *            changed the wallet since it was read, else it is worked out again
 *   pending  changes applied here whose history row is still to be written
 */
const walletSchema = new mongoose.Schema(
  {
    user: { type: ObjectId, ref: 'User', required: true, unique: true },
    free: { type: Number, default: 0 },
    paid: { type: Number, default: 0 },
    // "2026-10": the month `free` was last topped up for (UTC).
    freeMonth: { type: String, default: null },
    version: { type: Number, default: 0 },
    pending: { type: [pendingSchema], default: [] },
  },
  { timestamps: true }
);

// Finds the changes a crash left half-done (wallet.service, recoverPending).
walletSchema.index({ 'pending.at': 1 });

module.exports = mongoose.model('Wallet', walletSchema);
