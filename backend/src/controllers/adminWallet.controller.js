const asyncHandler = require('../utils/asyncHandler');
const walletService = require('../services/wallet.service');
const adminService = require('../services/admin.service');

const summary = asyncHandler(async (_req, res) => {
  const data = await walletService.summary();
  res.json({ success: true, data });
});

const getSettings = asyncHandler(async (_req, res) => {
  const settings = await walletService.getSettings();
  res.json({ success: true, data: { settings } });
});

const updateSettings = asyncHandler(async (req, res) => {
  const settings = await walletService.updateSettings(req.body, req.user);
  res.json({ success: true, data: { settings } });
});

const listTransactions = asyncHandler(async (req, res) => {
  const data = await walletService.listForAdmin(req.query, req.user);
  res.json({ success: true, data });
});

// getUser answers "not found" for an owner when a co-admin asks, as it does
// everywhere in the panel.
const getUserWallet = asyncHandler(async (req, res) => {
  const user = await adminService.getUser(req.params.id, req.user);
  const data = await walletService.getForAdmin(user, req.query);
  res.json({ success: true, data });
});

const adjust = asyncHandler(async (req, res) => {
  const user = await adminService.getUser(req.params.id, req.user);
  const data = await walletService.adjust(user, req.body, req.user);
  res.json({ success: true, data });
});

module.exports = { summary, getSettings, updateSettings, listTransactions, getUserWallet, adjust };
