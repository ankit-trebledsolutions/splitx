const asyncHandler = require('../utils/asyncHandler');
const authService = require('../services/auth.service');

const register = asyncHandler(async (req, res) => {
  const { user, token } = await authService.register(req.body);
  res.status(201).json({ success: true, data: { user, token } });
});

const login = asyncHandler(async (req, res) => {
  const { user, token } = await authService.login(req.body);
  res.json({ success: true, data: { user, token } });
});

const me = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { user: req.user } });
});

const forgotPassword = asyncHandler(async (req, res) => {
  const data = await authService.forgotPassword(req.body.email);
  res.json({ success: true, data });
});

const verifyOtp = asyncHandler(async (req, res) => {
  const data = await authService.verifyOtp(req.body.email, req.body.otp);
  res.json({ success: true, data });
});

const resetPassword = asyncHandler(async (req, res) => {
  const data = await authService.resetPassword(req.body.resetToken, req.body.password);
  res.json({ success: true, data });
});

module.exports = { register, login, me, forgotPassword, verifyOtp, resetPassword };
