const ApiError = require('../utils/ApiError');
const { buildAiLimiter } = require('./aiLimiter');

// A brake in front of the suggestions endpoint, per signed-in user. Most opens
// are answered from the cache and cost nothing; this stops a client in a loop
// from hammering even that. The spend control proper is the daily caps in
// services/placeSuggestion.service.js.
module.exports = buildAiLimiter({
  limit: 60,
  handler: (_req, _res, next) =>
    next(
      new ApiError(429, 'Too many requests for suggestions. Try again in a few minutes.', {
        code: 'PLACES_RATE_LIMITED',
      })
    ),
});
