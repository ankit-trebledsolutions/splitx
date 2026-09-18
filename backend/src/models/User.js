const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const otpSchema = new mongoose.Schema(
  {
    hash: String,
    purpose: { type: String, enum: ['verify-email', 'reset-password'] },
    expiresAt: Date,
    attempts: { type: Number, default: 0 }, // wrong guesses against this code
    lastSentAt: Date,
    // Codes sent in the current hour, to stop the app being used to flood an inbox.
    windowStart: Date,
    sentInWindow: { type: Number, default: 0 },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    // Accounts created through Google Sign-In have no password; everyone else
    // must set one. `googleId` is Google's permanent id for the account (the
    // ID token's `sub`), so the link survives the person changing their email.
    password: {
      type: String,
      minlength: 8,
      select: false,
      required: function requirePassword() {
        return !this.googleId;
      },
    },
    googleId: { type: String, unique: true, sparse: true },
    avatar: { type: String, default: null },
    // Personal invite code shown on the Invite Friends screen, e.g. SPLIX-ALEX-482.
    // Created the first time it is asked for; sparse so users without one don't clash.
    inviteCode: { type: String, unique: true, sparse: true },
    // Presence: when this user's last live connection closed. "Online" itself
    // is never stored — it's derived from open sockets (see realtime/socket.js).
    lastSeenAt: { type: Date, default: null },
    // Expo push tokens, one per device this user is logged in on.
    pushTokens: { type: [String], default: [], select: false },
    // False until the person enters the code emailed to them. Accounts from
    // before verification existed have no value here and count as verified, so
    // always test with `=== false`, never with a plain falsy check. No default
    // on purpose: Mongoose applies defaults when loading old documents, which
    // would turn every existing account into an unverified one.
    emailVerified: { type: Boolean },
    // The one-time code currently emailed to this person, if any. Only its hash
    // is kept. One slot serves both purposes: asking for a new code of either
    // kind replaces the old one.
    otp: { type: otpSchema, select: false, default: undefined },
  },
  { timestamps: true }
);

userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  return next();
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  // Google-only accounts have no password to compare against.
  if (!this.password) return Promise.resolve(false);
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.toJSON = function toJSON() {
  const obj = this.toObject();
  delete obj.password;
  delete obj.otp;
  // Older accounts have no flag and are treated as verified everywhere.
  obj.emailVerified = obj.emailVerified !== false;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
