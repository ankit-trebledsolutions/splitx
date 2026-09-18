const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const env = require('../config/env');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const emailService = require('./email.service');
const { assertUsableEmail } = require('../utils/emailCheck');

// ---- One-time codes ---------------------------------------------------------
const OTP_TTL_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5; // wrong guesses before a code is dead
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const OTP_MAX_PER_HOUR = 5; // codes emailed to one account per hour
const HOUR_MS = 60 * 60 * 1000;

const PURPOSE = { VERIFY: 'verify-email', RESET: 'reset-password' };

const hashOtp = (otp) => crypto.createHash('sha256').update(otp).digest('hex');

// Seconds until another code may be requested; 0 when one can be sent now.
const retryAfterSeconds = (user) => {
  const last = user.otp?.lastSentAt?.getTime();
  if (!last) return 0;
  return Math.max(0, Math.ceil((last + OTP_RESEND_COOLDOWN_MS - Date.now()) / 1000));
};

/**
 * Creates a fresh code for the user, stores its hash and emails it.
 * Expects `user` loaded with `+otp`. Throws 429 inside the cooldown or once the
 * hourly cap is hit, so nobody can use Splix to flood someone's inbox.
 */
const issueOtp = async (user, purpose) => {
  const wait = retryAfterSeconds(user);
  if (wait > 0) {
    throw new ApiError(429, `Please wait ${wait}s before requesting another code`, {
      code: 'OTP_COOLDOWN',
      data: { retryAfter: wait },
    });
  }

  const now = Date.now();
  const windowOpen = user.otp?.windowStart && now - user.otp.windowStart.getTime() < HOUR_MS;
  const sentInWindow = windowOpen ? user.otp.sentInWindow : 0;
  if (sentInWindow >= OTP_MAX_PER_HOUR) {
    throw new ApiError(429, 'Too many codes requested. Please try again in an hour.', {
      code: 'OTP_LIMIT',
    });
  }

  const code = String(crypto.randomInt(100000, 1000000));
  user.otp = {
    hash: hashOtp(code),
    purpose,
    expiresAt: new Date(now + OTP_TTL_MINUTES * 60 * 1000),
    attempts: 0,
    lastSentAt: new Date(now),
    windowStart: windowOpen ? user.otp.windowStart : new Date(now),
    sentInWindow: sentInWindow + 1,
  };
  await user.save({ validateBeforeSave: false });

  if (purpose === PURPOSE.VERIFY) await emailService.sendVerificationCode(user, code, OTP_TTL_MINUTES);
  else await emailService.sendPasswordResetCode(user, code, OTP_TTL_MINUTES);

  const result = { sent: true, retryAfter: OTP_RESEND_COOLDOWN_MS / 1000 };
  // With no mail provider configured nothing reaches an inbox, so development
  // builds get the code back to show on screen. Never in production.
  if (!emailService.isConfigured && env.nodeEnv !== 'production') result.devOtp = code;
  return result;
};

/**
 * Checks a submitted code. Wrong guesses are counted against the code, and it
 * dies after a few, so a 6-digit code can't be brute-forced.
 * Returns the user (loaded with +otp) on success; throws otherwise.
 */
const consumeOtp = async (email, code, purpose) => {
  const invalid = () => ApiError.badRequest('Invalid or expired code');

  const user = await User.findOne({ email: email.toLowerCase() }).select('+otp');
  const otp = user?.otp;
  if (!otp?.hash || otp.purpose !== purpose || otp.expiresAt < new Date()) throw invalid();

  if (otp.attempts >= OTP_MAX_ATTEMPTS) {
    throw ApiError.badRequest('Too many wrong attempts. Please request a new code.');
  }
  if (otp.hash !== hashOtp(code)) {
    user.otp.attempts += 1;
    await user.save({ validateBeforeSave: false });
    const left = OTP_MAX_ATTEMPTS - user.otp.attempts;
    throw ApiError.badRequest(
      left > 0
        ? `That code isn't right. ${left} attempt${left === 1 ? '' : 's'} left.`
        : 'Too many wrong attempts. Please request a new code.'
    );
  }
  return user;
};

// A used code must never work twice; the send counters stay so limits still hold.
const burnOtp = (user) => {
  user.otp.hash = undefined;
  user.otp.expiresAt = undefined;
};

// Verifies Google ID tokens against Google's public keys — no client secret needed.
const googleClient = new OAuth2Client();

const signToken = (userId) =>
  jwt.sign({ sub: userId.toString() }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });

/**
 * Step 1 of sign-up: create the account as unverified and email a code. No
 * session is issued here; that only happens once the code is entered
 * (verifyEmail), which is what proves the address is real and theirs.
 */
const register = async ({ name, email: rawEmail, password }) => {
  const email = await assertUsableEmail(rawEmail);

  let user = await User.findOne({ email }).select('+otp');
  if (user && user.emailVerified !== false) {
    throw ApiError.conflict('An account with this email already exists');
  }

  if (user) {
    // An earlier sign-up with this address was never verified, so nobody has
    // proved they own it. Let this attempt take it over; otherwise anyone
    // could block a stranger's email just by typing it in.
    user.name = name;
    user.password = password;
    await user.save();
  } else {
    user = await User.create({ name, email, password, emailVerified: false });
  }

  const sent = await issueOtp(user, PURPOSE.VERIFY);
  return { verificationRequired: true, email, ...sent };
};

// Step 2 of sign-up: the emailed code. Success logs the person in.
const verifyEmail = async (email, code) => {
  const user = await consumeOtp(email, code, PURPOSE.VERIFY);
  burnOtp(user);
  user.emailVerified = true;
  await user.save({ validateBeforeSave: false });

  emailService.sendWelcome(user);
  return { user, token: signToken(user._id) };
};

// "Resend code" on the OTP screen, for either kind of code.
const resendCode = async (email, purpose) => {
  const user = await User.findOne({ email: email.toLowerCase() }).select('+otp');
  // Same answer whether or not the account exists, so this can't be used to
  // find out who has a Splix account.
  const silent = { sent: true, retryAfter: OTP_RESEND_COOLDOWN_MS / 1000 };
  if (!user) return silent;
  if (purpose === PURPOSE.VERIFY && user.emailVerified !== false) return silent;
  return issueOtp(user, purpose);
};

const login = async ({ email, password }) => {
  const user = await User.findOne({ email: email.toLowerCase() }).select('+password +otp');
  // An account created with Google has no password to check.
  if (user && !user.password) {
    throw ApiError.unauthorized('This account uses Google sign-in. Please continue with Google.');
  }
  if (!user || !(await user.comparePassword(password))) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  // Right password, but the address was never confirmed: send them back to the
  // code screen. A fresh code goes out unless one was sent moments ago.
  if (user.emailVerified === false) {
    let sent = { retryAfter: retryAfterSeconds(user) };
    if (sent.retryAfter === 0) {
      try {
        sent = await issueOtp(user, PURPOSE.VERIFY);
      } catch (err) {
        if (err.statusCode !== 429) throw err;
      }
    }
    throw new ApiError(403, 'Please verify your email to continue. We sent you a code.', {
      code: 'EMAIL_NOT_VERIFIED',
      data: { email: user.email, retryAfter: sent.retryAfter, devOtp: sent.devOtp },
    });
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
      // Google has verified this address, which settles it for us too.
      user.emailVerified = true;
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
      emailVerified: true,
      avatar: picture || null,
    });
  }

  return { user, token: signToken(user._id) };
};

const forgotPassword = (email) => resendCode(email, PURPOSE.RESET);

// The reset code is exchanged for a short-lived token that authorises exactly
// one thing: setting a new password.
const verifyOtp = async (email, otp) => {
  const user = await consumeOtp(email, otp, PURPOSE.RESET);

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

  // The code stays live until the password is actually changed, which is what
  // makes the reset token single-use: a second attempt finds it burned.
  const user = await User.findById(payload.sub).select('+otp');
  if (!user || !user.otp?.hash || user.otp.purpose !== PURPOSE.RESET) {
    throw ApiError.unauthorized('Reset request no longer valid');
  }

  user.password = password;
  burnOtp(user);
  // They just read a code from this inbox, so the address is proven too.
  user.emailVerified = true;
  await user.save();

  emailService.sendPasswordChanged(user);
  return { changed: true };
};

/**
 * The person's own invite code, created on first use and then permanent.
 * SPLIX-<first letters of their name>-<3 digits>, so it reads as theirs.
 */
const getInviteCode = async (userId) => {
  const user = await User.findById(userId).select('name inviteCode');
  if (!user) throw ApiError.notFound('User not found');
  if (user.inviteCode) return { code: user.inviteCode };

  const tag = (user.name.toUpperCase().replace(/[^A-Z]/g, '') + 'XXXX').slice(0, 4);
  // The unique index is the referee: on the rare clash, roll new digits.
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = `SPLIX-${tag}-${crypto.randomInt(100, 1000)}`;
    try {
      const updated = await User.findOneAndUpdate(
        { _id: userId, inviteCode: { $exists: false } },
        { $set: { inviteCode: code } },
        { new: true }
      ).select('inviteCode');
      // Null means another request of theirs set it first; use that one.
      if (updated) return { code: updated.inviteCode };
      const current = await User.findById(userId).select('inviteCode');
      return { code: current.inviteCode };
    } catch (err) {
      if (err.code !== 11000) throw err;
    }
  }
  throw new ApiError(503, 'Could not create an invite code. Please try again.');
};

module.exports = {
  getInviteCode,
  register,
  verifyEmail,
  resendCode,
  login,
  loginWithGoogle,
  forgotPassword,
  verifyOtp,
  resetPassword,
};
