const rateLimit = require('express-rate-limit');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');

const jsonHandler = (message) => (_req, _res, next) =>
  next(new ApiError(429, message, { code: 'RATE_LIMITED' }));

const base = {
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  skip: () => env.nodeEnv === 'test',
};

/**
 * Sign-in brake, counted per email address rather than per IP.
 *
 * `trust proxy` is unset, so behind the host's proxy every caller shares one
 * address and one counter — an IP key would let a single noisy client lock the
 * whole panel out. Keying on the email stops a password being guessed against a
 * known account, which is the attack that matters here. A spread-out attempt
 * across many accounts is not caught by this; that is what the password rules
 * and the audit log are for.
 */
const adminLoginLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  limit: 10,
  keyGenerator: (req) => String(req.body?.email || '').toLowerCase().trim() || 'anonymous',
  handler: jsonHandler('Too many sign-in attempts. Try again in a few minutes.'),
});

// Ordinary reads, counted per signed-in admin. Must run after adminProtect.
const adminReadLimiter = rateLimit({
  ...base,
  windowMs: 60 * 1000,
  limit: 120,
  keyGenerator: (req) => String(req.user._id),
  handler: jsonHandler('Too many requests. Slow down a moment.'),
});

// Anything that writes. Tighter, because these are the actions worth abusing.
const adminWriteLimiter = rateLimit({
  ...base,
  windowMs: 60 * 1000,
  limit: 30,
  keyGenerator: (req) => String(req.user._id),
  handler: jsonHandler('Too many changes at once. Slow down a moment.'),
});

module.exports = { adminLoginLimiter, adminReadLimiter, adminWriteLimiter };
