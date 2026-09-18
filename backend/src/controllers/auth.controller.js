const asyncHandler = require('../utils/asyncHandler');
const authService = require('../services/auth.service');

// Creates the account and emails a code; no session until verifyEmail.
const register = asyncHandler(async (req, res) => {
  const data = await authService.register(req.body);
  res.status(201).json({ success: true, data });
});

const verifyEmail = asyncHandler(async (req, res) => {
  const { user, token } = await authService.verifyEmail(req.body.email, req.body.otp);
  res.json({ success: true, data: { user, token } });
});

const resendCode = asyncHandler(async (req, res) => {
  const data = await authService.resendCode(req.body.email, req.body.purpose);
  res.json({ success: true, data });
});

const login = asyncHandler(async (req, res) => {
  const { user, token } = await authService.login(req.body);
  res.json({ success: true, data: { user, token } });
});

// One endpoint serves both Google sign-up and sign-in.
const googleLogin = asyncHandler(async (req, res) => {
  const { user, token } = await authService.loginWithGoogle(req.body.idToken);
  res.json({ success: true, data: { user, token } });
});

const me = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { user: req.user } });
});

const inviteCode = asyncHandler(async (req, res) => {
  const data = await authService.getInviteCode(req.user._id);
  res.json({ success: true, data });
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

module.exports = {
  register,
  verifyEmail,
  resendCode,
  login,
  googleLogin,
  me,
  inviteCode,
  forgotPassword,
  verifyOtp,
  resetPassword,
};
