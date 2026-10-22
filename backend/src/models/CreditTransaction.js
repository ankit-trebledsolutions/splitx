const mongoose = require('mongoose');

const { ObjectId } = mongoose.Schema.Types;

/**
 * One change to someone's credits. Written only by wallet.service, never
 * edited or deleted afterwards (except with the account itself): this is the
 * record that explains every balance.
 *
 *   bonus    the one-time signup bonus
 *   monthly  this month's free credits topped up (the amount is the change)
 *   spend    a paid feature was used
 *   refund   a spend given back because the feature failed
 *   grant    added by an admin
 *   deduct   taken away by an admin
 *
 * `free` and `paid` are what changed in each pot; `amount` is their sum.
 */
const TYPES = ['bonus', 'monthly', 'spend', 'refund', 'grant', 'deduct'];

// What a spend paid for. The price of each lives in WalletSettings.
const FEATURES = ['ai_itinerary', 'call'];

const creditTransactionSchema = new mongoose.Schema(
  {
    user: { type: ObjectId, ref: 'User', required: true },
    // Unique, so nothing is ever applied twice: a retried request, a double
    // tap or two servers doing the same job all land on the same key.
    key: { type: String, required: true, unique: true, maxlength: 200 },
    type: { type: String, enum: TYPES, required: true },
    amount: { type: Number, required: true },
    free: { type: Number, required: true },
    paid: { type: Number, required: true },
    freeAfter: { type: Number, required: true },
    paidAfter: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    feature: { type: String, enum: [...FEATURES, null], default: null },
    // What it was for: an AI job id, a call session id.
    ref: { type: String, default: null, maxlength: 100 },
    // Why an admin granted or deducted. Shown in the panel, never in the app.
    note: { type: String, default: null, maxlength: 300 },
    by: { type: ObjectId, ref: 'User', default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

creditTransactionSchema.index({ user: 1, createdAt: -1 });
creditTransactionSchema.index({ createdAt: -1 });
creditTransactionSchema.index({ type: 1, createdAt: -1 });

module.exports = mongoose.model('CreditTransaction', creditTransactionSchema);
module.exports.TYPES = TYPES;
module.exports.FEATURES = FEATURES;
