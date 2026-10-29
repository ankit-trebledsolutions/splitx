/**
 * Why an AI planning run failed, as a short `kind` the job runner maps to a
 * user-safe error code (see codeFor in aiItinerary.service). The message is for
 * the server log only and never reaches the app.
 *
 * kind       AUTH | QUOTA | MODEL_NOT_FOUND | RATE_LIMIT | SERVER | NETWORK |
 *            TIMEOUT | BAD_REQUEST | REFUSED | TRUNCATED | EMPTY | BAD_OUTPUT |
 *            BAD_DESTINATION
 * retryable  worth one more attempt (rate limit, server error, network)
 * billed     OpenAI may have charged for the call, so it counts towards the caps
 * retryAfter seconds the server asked us to wait, when it said
 * usage, aiModel  token counts and the model that answered, when known
 *
 * Kept free of config/env so the sanitizer and the prompt module can be loaded
 * without any environment at all.
 */
class AiError extends Error {
  constructor(kind, { message, retryable = false, billed = false, retryAfter, usage, aiModel } = {}) {
    super(message || kind);
    this.name = 'AiError';
    this.kind = kind;
    this.retryable = retryable;
    this.billed = billed;
    this.retryAfter = retryAfter;
    this.usage = usage;
    this.aiModel = aiModel;
  }
}

module.exports = AiError;
