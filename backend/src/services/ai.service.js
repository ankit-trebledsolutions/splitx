const env = require('../config/env');
const AiError = require('../utils/AiError');
const { buildRequest } = require('./aiItinerary.prompt');

/**
 * The one place that talks to OpenAI: a single Responses API call with a strict
 * JSON schema, over plain fetch like the email and push services, so there is
 * no SDK to keep up to date.
 *
 * Callers get parsed JSON or an AiError. Every AiError says whether OpenAI may
 * have charged for the attempt (`billed`), because the daily caps count those
 * and only those. OpenAI's own error text is logged here and goes no further.
 */

// A function, not a constant, so tests can switch the key on and off.
const isConfigured = () => Boolean(env.openai.apiKey);

// A whole call may use the per-attempt timeout plus this, however many attempts it takes.
const DEADLINE_GRACE_MS = 60 * 1000;
// Too little time left to be worth another paid attempt.
const MIN_ATTEMPT_MS = 5 * 1000;
const MIN_RETRY_MS = 20 * 1000;
const MAX_RETRY_WAIT_MS = 10 * 1000;

/**
 * Circuit breaker for failures that no retry can fix: a bad or revoked key, no
 * access, an empty balance. While it is open the planner answers "unavailable"
 * without creating a job, so a broken key cannot burn everyone's daily runs.
 * In memory on purpose: a restart is a fair moment to try again.
 */
const BREAKER_MS = 10 * 60 * 1000;
const BREAKER_KINDS = new Set(['AUTH', 'QUOTA', 'MODEL_NOT_FOUND']);
let breakerOpenUntil = 0;

const isBreakerOpen = () => Date.now() < breakerOpenUntil;

const openBreaker = (kind) => {
  breakerOpenUntil = Date.now() + BREAKER_MS;
  console.error(`[ai] ${kind}: planner switched off for ${BREAKER_MS / 60000} minutes`);
};

// Tests only: lets one case open the breaker without failing the next.
const resetBreaker = () => {
  breakerOpenUntil = 0;
};

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost']);

// Tests must never reach the real API, even if a real key leaks into their environment.
const assertLocalInTests = () => {
  if (env.nodeEnv !== 'test') return;
  if (!LOCAL_HOSTS.has(new URL(env.openai.baseUrl).hostname)) {
    throw new Error(`Refusing to call ${env.openai.baseUrl} while NODE_ENV is test`);
  }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const QUOTA_CODES = new Set([
  'insufficient_quota',
  'credit_balance_exhausted',
  'organization_usage_limit_exceeded',
]);
const isQuotaError = (error) =>
  error?.type === 'insufficient_quota' ||
  QUOTA_CODES.has(error?.code) ||
  /_spend_limit_exceeded$/.test(error?.code ?? '');

// What a non-200 answer means for us. The order matters: "model not found" can
// arrive as a 403, and must reach the fallback model instead of the breaker.
const kindOf = (status, error) => {
  if (error?.code === 'model_not_found' && (status === 404 || status === 403)) return 'MODEL_NOT_FOUND';
  if (status === 401 || status === 403) return 'AUTH';
  if (status === 429) return isQuotaError(error) ? 'QUOTA' : 'RATE_LIMIT';
  if (status >= 500) return 'SERVER';
  return 'BAD_REQUEST';
};
const RETRYABLE_KINDS = new Set(['RATE_LIMIT', 'SERVER', 'NETWORK']);

const usageOf = (usage) =>
  usage
    ? {
        inputTokens: usage.input_tokens ?? 0,
        outputTokens: usage.output_tokens ?? 0,
        reasoningTokens: usage.output_tokens_details?.reasoning_tokens ?? 0,
      }
    : undefined;

// One HTTP attempt. Resolves to the response JSON of a 200, throws AiError otherwise.
const callOnce = async (body, timeoutMs) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${env.openai.baseUrl}/responses`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.openai.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    // The timer keeps running until the body is read: a stalled body must time out too.
    const json = await res.json().catch(() => null);
    if (res.ok) return json;

    const kind = kindOf(res.status, json?.error);
    console.error(
      `[ai] OpenAI responded ${res.status} (${kind}, request ${res.headers.get('x-request-id') ?? 'unknown'}):`,
      JSON.stringify(json?.error ?? null).slice(0, 300)
    );
    // Seconds. The header can also be a date, which is simply ignored.
    const retryAfter = parseFloat(res.headers.get('retry-after'));
    throw new AiError(kind, {
      retryable: RETRYABLE_KINDS.has(kind),
      retryAfter: retryAfter >= 0 ? retryAfter : undefined,
    });
  } catch (err) {
    if (err instanceof AiError) throw err;
    // Only our own timer aborts, and by then the request has gone out: OpenAI
    // may charge for whatever it generated before we hung up.
    if (controller.signal.aborted) throw new AiError('TIMEOUT', { billed: true });
    console.error('[ai] could not reach OpenAI:', err.message);
    throw new AiError('NETWORK', { retryable: true });
  } finally {
    clearTimeout(timer);
  }
};

// Reads a 200. Whatever is wrong from here on has been paid for.
const parseResponse = (json, model) => {
  const paid = { billed: true, usage: usageOf(json?.usage), aiModel: json?.model ?? model };

  if (json?.status === 'incomplete') {
    // Ran into max_output_tokens (cut-off JSON cannot be parsed) or the content filter.
    const filtered = json.incomplete_details?.reason === 'content_filter';
    throw new AiError(filtered ? 'REFUSED' : 'TRUNCATED', paid);
  }
  if (json?.status !== 'completed') {
    console.error('[ai] OpenAI response did not complete:', JSON.stringify(json?.error ?? null).slice(0, 300));
    throw new AiError('SERVER', paid);
  }

  // Reasoning models put a "reasoning" item first, so never read output[0].
  const message = (json.output ?? []).find((item) => item.type === 'message');
  const parts = message?.content ?? [];
  if (parts.some((part) => part.type === 'refusal')) throw new AiError('REFUSED', paid);
  const text = parts.find((part) => part.type === 'output_text')?.text;
  if (!text) throw new AiError('EMPTY', paid);

  try {
    return { data: JSON.parse(text), ...paid };
  } catch {
    throw new AiError('BAD_OUTPUT', paid);
  }
};

/**
 * Plans one trip. Resolves to { data, aiModel, usage, billed: true }; throws
 * AiError, whose `billed` is true as soon as any attempt may have been charged.
 *
 * At most one retry, and only for failures that were not charged and may pass
 * (rate limit, server error, network). A timeout is never retried: it would
 * double both the wait and the cost, and the app has a "Try again" button.
 */
const generateItinerary = async ({ facts, dayCount, userId }) => {
  assertLocalInTests();

  const deadline = Date.now() + env.openai.timeoutMs + DEADLINE_GRACE_MS;
  let model = env.openai.model;
  let retried = false;
  let billed = false;

  for (;;) {
    const remaining = deadline - Date.now();
    if (remaining < MIN_ATTEMPT_MS) throw new AiError('TIMEOUT', { billed });

    try {
      const json = await callOnce(
        buildRequest({ model, facts, dayCount, userId }),
        Math.min(env.openai.timeoutMs, remaining)
      );
      return parseResponse(json, model);
    } catch (err) {
      if (!(err instanceof AiError)) throw err;
      billed = billed || err.billed;
      err.billed = billed;

      if (err.kind === 'MODEL_NOT_FOUND' && model !== env.openai.fallbackModel) {
        console.warn(`[ai] model "${model}" not found, trying "${env.openai.fallbackModel}"`);
        model = env.openai.fallbackModel;
        continue;
      }
      if (BREAKER_KINDS.has(err.kind)) openBreaker(err.kind);

      const canRetry = err.retryable && !retried && deadline - Date.now() >= MIN_RETRY_MS;
      if (!canRetry) throw err;
      retried = true;
      const waitMs =
        err.retryAfter !== undefined
          ? Math.min(err.retryAfter * 1000, MAX_RETRY_WAIT_MS)
          : 2000 + Math.random() * 1000;
      await sleep(waitMs);
    }
  }
};

module.exports = { isConfigured, isBreakerOpen, resetBreaker, generateItinerary, AiError };
