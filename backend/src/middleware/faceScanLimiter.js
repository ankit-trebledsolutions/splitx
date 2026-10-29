const rateLimit = require('express-rate-limit');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');

/**
 * A brake in front of Face Scan. Each scan costs the face service a detector
 * and a recogniser pass on the CPU it shares with every upload, so one account
 * must not be able to hold it. Per signed-in user, like aiLimiter, so it must
 * run after `protect`. `overrides` is for tests.
 */
const buildFaceScanLimiter = (overrides = {}) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => String(req.user._id),
    validate: { xForwardedForHeader: false },
    skip: () => env.nodeEnv === 'test',
    handler: (_req, _res, next) =>
      next(
        new ApiError(429, 'Too many scans. Try again in a few minutes.', {
          code: 'FACE_SCAN_RATE_LIMITED',
        })
      ),
    ...overrides,
  });

module.exports = buildFaceScanLimiter();
module.exports.buildFaceScanLimiter = buildFaceScanLimiter;
