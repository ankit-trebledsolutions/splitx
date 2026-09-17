const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

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
    // Presence: when this user's last live connection closed. "Online" itself
    // is never stored — it's derived from open sockets (see realtime/socket.js).
    lastSeenAt: { type: Date, default: null },
    // Expo push tokens, one per device this user is logged in on.
    pushTokens: { type: [String], default: [], select: false },
    resetOtpHash: { type: String, select: false },
    resetOtpExpires: { type: Date, select: false },
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
  delete obj.resetOtpHash;
  delete obj.resetOtpExpires;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
