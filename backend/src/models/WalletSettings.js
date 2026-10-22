const mongoose = require('mongoose');

/**
 * Credit prices and allowances, edited by owners in the admin panel. One
 * document; whatever it does not hold comes from DEFAULTS.
 *
 * A price of 0 means the feature is free, which is also how charging starts:
 * switched off, so deploying the wallet changes nothing until an owner sets a
 * price.
 */
const DEFAULTS = {
  prices: {
    aiItinerary: 0,
    // For each started block of `callBlockMinutes`, paid by whoever started the call.
    callBlock: 0,
  },
  callBlockMinutes: 10,
  signupBonus: 50,
  monthlyFree: 20,
  // The most a co-admin can grant or deduct at once. Owners have no limit.
  coAdminGrantCap: 500,
};

const walletSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'wallet', unique: true },
    prices: {
      aiItinerary: { type: Number, min: 0, default: DEFAULTS.prices.aiItinerary },
      callBlock: { type: Number, min: 0, default: DEFAULTS.prices.callBlock },
    },
    callBlockMinutes: { type: Number, min: 1, default: DEFAULTS.callBlockMinutes },
    signupBonus: { type: Number, min: 0, default: DEFAULTS.signupBonus },
    monthlyFree: { type: Number, min: 0, default: DEFAULTS.monthlyFree },
    coAdminGrantCap: { type: Number, min: 0, default: DEFAULTS.coAdminGrantCap },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('WalletSettings', walletSettingsSchema);
module.exports.DEFAULTS = DEFAULTS;
