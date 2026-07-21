const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const env = require('../config/env');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');

const OTP_TTL_MS = 10 * 60 * 1000;
const hashOtp = (otp) => crypto.createHash('sha256').update(otp).digest('hex');

const signToken = (userId) =>
  jwt.sign({ sub: userId.toString() }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });

const register = async ({ name, email, password }) => {
  const existing = await User.findOne({ email });
  if (existing) throw ApiError.conflict('An account with this email already exists');

  const user = await User.create({ name, email, password });
  return { user, token: signToken(user._id) };
};

const login = async ({ email, password }) => {
  const user = await User.findOne({ email }).select('+password');
  if (!user || !(await user.comparePassword(password))) {
    throw ApiError.unauthorized('Invalid email or password');
  }
  return { user, token: signToken(user._id) };
};

const forgotPassword = async (email) => {
  const user = await User.findOne({ email });
  // Always report success so the endpoint can't be used to enumerate accounts.
  if (!user) return { sent: true };

  const otp = String(crypto.randomInt(100000, 1000000));
  user.resetOtpHash = hashOtp(otp);
  user.resetOtpExpires = new Date(Date.now() + OTP_TTL_MS);
  await user.save({ validateBeforeSave: false });

  // No email provider is configured yet — surface the OTP in dev for testing.
  console.log(`[dev] Password reset OTP for ${email}: ${otp}`);
  const result = { sent: true };
  if (env.nodeEnv !== 'production') result.devOtp = otp;
  return result;
};

const verifyOtp = async (email, otp) => {
  const user = await User.findOne({ email }).select('+resetOtpHash +resetOtpExpires');
  const valid =
    user &&
    user.resetOtpHash === hashOtp(otp) &&
    user.resetOtpExpires &&
    user.resetOtpExpires > new Date();
  if (!valid) throw ApiError.badRequest('Invalid or expired code');

  const resetToken = jwt.sign(
    { sub: user._id.toString(), purpose: 'password-reset' },
    env.jwtSecret,
    { expiresIn: '15m' }
  );
  return { resetToken };
};

const resetPassword = async (resetToken, password) => {
  let payload;
  try {
    payload = jwt.verify(resetToken, env.jwtSecret);
  } catch {
    throw ApiError.unauthorized('Invalid or expired reset token');
  }
  if (payload.purpose !== 'password-reset') {
    throw ApiError.unauthorized('Invalid reset token');
  }

  const user = await User.findById(payload.sub).select('+resetOtpHash');
  if (!user || !user.resetOtpHash) {
    throw ApiError.unauthorized('Reset request no longer valid');
  }

  user.password = password;
  user.resetOtpHash = undefined;
  user.resetOtpExpires = undefined;
  await user.save();
  return { changed: true };
};

module.exports = { register, login, forgotPassword, verifyOtp, resetPassword };
