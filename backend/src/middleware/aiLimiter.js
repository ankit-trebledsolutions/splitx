const rateLimit = require('express-rate-limit');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');

/**
 * A light brake in front of the AI planner. The real spend control is the daily
 * caps counted from the database (see aiItinerary.service); this only stops one
 * account from hammering the endpoint.
 *
 * Must run after `protect`, because it counts per signed-in user. `overrides`
 * exists for tests, which need a tiny limit and no skip.
 */
const buildAiLimiter = (overrides = {}) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    // Never the IP: trust proxy is unset, so behind the host's proxy every
    // request would share one address and one counter.
    keyGenerator: (req) => String(req.user._id),
    validate: { xForwardedForHeader: false },
    skip: () => env.nodeEnv === 'test',
    // The library's default answer is a plain string; the app needs the JSON error shape.
    handler: (_req, _res, next) =>
      next(
        new ApiError(429, 'Too many AI requests. Try again in a few minutes.', {
          code: 'AI_RATE_LIMITED',
        })
      ),
    ...overrides,
  });

module.exports = buildAiLimiter();
module.exports.buildAiLimiter = buildAiLimiter;
