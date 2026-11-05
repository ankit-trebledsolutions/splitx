const rateLimit = require('express-rate-limit');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');

/**
 * Brakes on guessing, counted per target rather than per IP. The per-IP limit
 * on /auth (app.js) is keyed on the caller's address, which a caller who
 * reaches the server without going through Cloudflare can choose freely
 * (X-Forwarded-For), so it cannot be the only thing standing in front of a
 * password or an invite code.
 *
 * Only failed requests count (skipSuccessfulRequests): someone who signs in or
 * joins at the first try never gets near a limit. `overrides` exists for tests,
 * which need a small limit and no skip.
 */
const base = {
  windowMs: 15 * 60 * 1000,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  validate: { xForwardedForHeader: false },
  skip: () => env.nodeEnv === 'test',
};

const refuse = (message, code) => (_req, _res, next) => next(new ApiError(429, message, { code }));

/**
 * Wrong passwords for one account, from anywhere: ten in a quarter of an hour,
 * then that account's password sign-in waits. Mirrors the admin panel's
 * adminLoginLimiter. Google sign-in and "Forgot password" are unaffected, so
 * the real owner is never stuck.
 */
const buildLoginLimiter = (overrides = {}) =>
  rateLimit({
    ...base,
    limit: 10,
    keyGenerator: (req) => `login:${String(req.body?.email || '').toLowerCase().trim() || 'anonymous'}`,
    handler: refuse('Too many wrong attempts for this account. Try again in a few minutes.', 'LOGIN_RATE_LIMITED'),
    ...overrides,
  });

/**
 * Invite codes that do not exist, per signed-in account. New codes carry 65
 * bits, but groups made before November 2026 keep 8 hex characters (32 bits,
 * utils/inviteCode.js), which are guessable at an unlimited request rate; a
 * few dozen wrong codes is far more than any person mistypes. Must run after
 * `protect`.
 */
const buildInviteLimiter = (overrides = {}) =>
  rateLimit({
    ...base,
    limit: 20,
    keyGenerator: (req) => `invite:${String(req.user._id)}`,
    handler: refuse('Too many invite codes that did not work. Try again in a few minutes.', 'INVITE_RATE_LIMITED'),
    ...overrides,
  });

module.exports = {
  loginLimiter: buildLoginLimiter(),
  inviteLimiter: buildInviteLimiter(),
  buildLoginLimiter,
  buildInviteLimiter,
};
