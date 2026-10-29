const ApiError = require('../utils/ApiError');
const { buildAiLimiter } = require('./aiLimiter');

// A brake in front of the suggestions endpoint, per signed-in user. Most opens
// are answered from the cache and cost nothing; this stops a client in a loop
// from hammering even that. The spend control proper is the daily caps in
// services/placeSuggestion.service.js.
const refused = (_req, _res, next) =>
  next(
    new ApiError(429, 'Too many requests for suggestions. Try again in a few minutes.', {
      code: 'PLACES_RATE_LIMITED',
    })
  );

module.exports = buildAiLimiter({ limit: 60, handler: refused });

// The name search fires as a member types (the app waits for a pause and asks
// once per two letters or more), so its brake is looser. The search caps do
// the real limiting.
module.exports.search = buildAiLimiter({ limit: 300, handler: refused });
