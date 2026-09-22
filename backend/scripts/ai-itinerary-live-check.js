/**
 * A one-off check against the REAL OpenAI API, to run by hand once the key
 * exists: does OpenAI accept our output schema, and do both model ids work for
 * this key? It sends exactly what the server sends (buildRequest) for a made-up
 * two-day trip, once with the main model and once with the fallback, and prints
 * what each answer used. Costs about two cents.
 *
 *   PowerShell:  $env:OPENAI_API_KEY = 'sk-...'; node scripts/ai-itinerary-live-check.js
 *   bash:        OPENAI_API_KEY=sk-... node scripts/ai-itinerary-live-check.js
 *
 * OPENAI_MODEL and OPENAI_FALLBACK_MODEL override the two ids, as on the server.
 *
 * Loads no .env and nothing that would (so neither config/env nor ai.service),
 * and needs no database. The key is read from this process's own environment,
 * is never printed, and goes nowhere except api.openai.com. Exits 0 only when
 * both models return a plan the sanitizer accepts.
 */
const { buildFacts, buildRequest } = require('../src/services/aiItinerary.prompt');
const { sanitizeItinerary } = require('../src/services/aiItinerary.sanitizer');

const OPENAI_URL = 'https://api.openai.com/v1/responses';
// The server's defaults, from src/config/env.js, which cannot be loaded here
// because it reads .env. test/liveCheck.test.js fails if the two drift apart.
const DEFAULT_MODEL = 'gpt-5.6-luna';
const DEFAULT_FALLBACK_MODEL = 'gpt-5.4-mini';
const TIMEOUT_MS = 90000;
const DAY_COUNT = 2;
const DAY_MS = 86400000;

const print = console.log.bind(console);

// A small, ordinary trip: enough to exercise every field of the facts and the schema.
const tripFacts = (startDate) =>
  buildFacts({
    resolved: {
      destination: 'Jaipur, India',
      startDate,
      days: DAY_COUNT,
      groupSize: 4,
      tripContinuesAfter: false,
    },
    prefs: {
      travellers: 'friends',
      interests: ['sightseeing', 'food'],
      pace: 'relaxed',
      budget: 'mid',
      transport: 'cab',
      arrivalTime: '10:00 AM',
      departureTime: '6:00 PM',
      food: 'vegetarian',
      notes: 'Sunset at a fort is a must.',
      dayStart: 'normal',
      accessibility: 'none',
    },
  });

const requestFor = (model, startDate = new Date(Date.now() + 14 * DAY_MS)) =>
  buildRequest({ model, facts: tripFacts(startDate), dayCount: DAY_COUNT, userId: 'live-check' });

// What went wrong, without echoing anything that could carry the key: OpenAI
// quotes part of a rejected key in its 401 message.
const describeFailure = (status, error) => {
  if (status === 401) return 'OpenAI rejected the key. Check OPENAI_API_KEY.';
  return `${error?.code ?? error?.type ?? 'error'}: ${String(error?.message ?? 'no error body').slice(0, 500)}`;
};

// Resolves to true when this model returned a usable plan.
const check = async (model, apiKey) => {
  print(`\n${model}`);
  const startDate = new Date(Date.now() + 14 * DAY_MS);
  const startedAt = Date.now();

  let res;
  let json;
  try {
    res = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(requestFor(model, startDate)),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    json = await res.json().catch(() => null);
  } catch (err) {
    print(`  FAILED  no answer within ${TIMEOUT_MS / 1000} s, or no network (${err.name})`);
    return false;
  }
  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  print(`  HTTP ${res.status} after ${seconds} s (request ${res.headers.get('x-request-id') ?? 'unknown'})`);

  if (!res.ok) {
    print(`  FAILED  ${describeFailure(res.status, json?.error)}`);
    return false;
  }

  const usage = json?.usage ?? {};
  print(`  answered by   ${json?.model ?? 'unknown'}`);
  print(
    `  tokens        ${usage.input_tokens ?? '?'} in, ${usage.output_tokens ?? '?'} out ` +
      `(${usage.output_tokens_details?.reasoning_tokens ?? '?'} of them reasoning)`
  );

  if (json?.status !== 'completed') {
    print(`  FAILED  response is "${json?.status}" (${json?.incomplete_details?.reason ?? 'no reason given'})`);
    return false;
  }
  // Reasoning models put a "reasoning" item first, so never read output[0].
  const message = (json.output ?? []).find((item) => item.type === 'message');
  const text = message?.content?.find((part) => part.type === 'output_text')?.text;
  try {
    const days = sanitizeItinerary(JSON.parse(text), { dayCount: DAY_COUNT, startDate });
    const activities = days.reduce((sum, day) => sum + day.activities.length, 0);
    print(`  plan          ${days.length} day(s), ${activities} activities`);
    const first = days[0].activities[0];
    print(`  first stop    ${first.time} ${first.title} (${first.location})`);
    return days.length === DAY_COUNT;
  } catch (err) {
    print(`  FAILED  the answer is not a usable plan (${err.kind ?? err.message})`);
    return false;
  }
};

const main = async () => {
  const apiKey = (process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey || apiKey.startsWith('fake-')) {
    print('Set OPENAI_API_KEY to the real key in this shell first. Nothing was sent.');
    return false;
  }
  const models = [
    process.env.OPENAI_MODEL || DEFAULT_MODEL,
    process.env.OPENAI_FALLBACK_MODEL || DEFAULT_FALLBACK_MODEL,
  ];

  print(`Asking OpenAI for a ${DAY_COUNT}-day plan, once per model. This is billed (about a cent each).`);
  const passed = [];
  for (const model of [...new Set(models)]) {
    // One after the other on purpose: two answers interleaved would be unreadable.
    // eslint-disable-next-line no-await-in-loop
    passed.push(await check(model, apiKey));
  }

  const ok = passed.every(Boolean);
  print(ok ? '\nReady: every model accepted the schema and returned a plan.' : '\nNot ready: see FAILED above.');
  return ok;
};

module.exports = { DEFAULT_MODEL, DEFAULT_FALLBACK_MODEL, requestFor };

if (require.main === module) {
  main()
    .then((ok) => process.exit(ok ? 0 : 1))
    .catch((err) => {
      console.error('The live check crashed:', err.message);
      process.exit(1);
    });
}
