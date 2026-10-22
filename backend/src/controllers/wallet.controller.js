const asyncHandler = require('../utils/asyncHandler');
const walletService = require('../services/wallet.service');

// The balance, its two pots and today's prices, for Profile > Wallet.
const get = asyncHandler(async (req, res) => {
  const wallet = await walletService.getForUser(req.user._id);
  res.json({ success: true, data: { wallet } });
});

const transactions = asyncHandler(async (req, res) => {
  const data = await walletService.listForUser(req.user._id, req.query);
  res.json({ success: true, data });
});

module.exports = { get, transactions };
