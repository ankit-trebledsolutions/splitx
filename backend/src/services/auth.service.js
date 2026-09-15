const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const env = require('../config/env');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');

const OTP_TTL_MS = 10 * 60 * 1000;
const hashOtp = (otp) => crypto.createHash('sha256').update(otp).digest('hex');

// Verifies Google ID tokens against Google's public keys — no client secret needed.
const googleClient = new OAuth2Client();

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
  // An account created with Google has no password to check.
  if (user && !user.password) {
    throw ApiError.unauthorized('This account uses Google sign-in. Please continue with Google.');
  }
  if (!user || !(await user.comparePassword(password))) {
    throw ApiError.unauthorized('Invalid email or password');
  }
  return { user, token: signToken(user._id) };
};

/**
 * Google Sign-In covers both "sign up" and "log in": the app sends the ID
 * token Google gave it, we verify it's genuine and meant for this app, then
 * find the matching account (or create one) and issue our normal JWT.
 */
const loginWithGoogle = async (idToken) => {
  if (env.googleClientIds.length === 0) {
    throw new ApiError(503, 'Google sign-in is not configured on the server');
  }

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: env.googleClientIds,
    });
    payload = ticket.getPayload();
  } catch {
    // Bad signature, wrong audience, expired, or not from Google.
    throw ApiError.unauthorized('Google sign-in could not be verified. Please try again.');
  }

  const { sub: googleId, email, email_verified: emailVerified, name, picture } = payload;
  if (!email || !emailVerified) {
    throw ApiError.unauthorized('Your Google account email is not verified');
  }

  // 1. Returning Google user.
  let user = await User.findOne({ googleId });

  // 2. Same email already registered with a password — link Google to it so
  //    the person ends up with one account, not two.
  if (!user) {
    user = await User.findOne({ email: email.toLowerCase() });
    if (user) {
      user.googleId = googleId;
      if (!user.avatar && picture) user.avatar = picture;
      await user.save({ validateBeforeSave: false });
    }
  }

  // 3. Brand-new person — this is the "sign up with Google" path.
  if (!user) {
    user = await User.create({
      name: name || email.split('@')[0],
      email,
      googleId,
      avatar: picture || null,
    });
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

module.exports = { register, login, loginWithGoogle, forgotPassword, verifyOtp, resetPassword };
