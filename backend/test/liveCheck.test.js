require('../testkit/safeEnv');

/**
 * scripts/ai-itinerary-live-check.js is run by hand against the real API, so it
 * is never executed here. What can be checked without a key: that it cannot
 * load backend/.env, and that it sends what the server sends, to the models the
 * server would use.
 */
// The defaults are what is compared below, so a model exported in the shell must not stand in for them.
delete process.env.OPENAI_MODEL;
delete process.env.OPENAI_FALLBACK_MODEL;

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const env = require('../src/config/env');
require('../testkit/safeEnv').assertSafe(env);
const { ITINERARY_SCHEMA, INSTRUCTIONS } = require('../src/services/aiItinerary.prompt');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'ai-itinerary-live-check.js');

const requiresOf = (file) =>
  [...fs.readFileSync(file, 'utf8').matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)].map((match) => match[1]);

test('the live check loads nothing that reads .env or opens a database', () => {
  assert.deepEqual(requiresOf(SCRIPT), ['../src/services/aiItinerary.prompt', '../src/services/aiItinerary.sanitizer']);
  // Those two, and what they load in turn, must stay free of the environment themselves.
  const src = path.join(__dirname, '..', 'src');
  const loaded = [
    ...requiresOf(path.join(src, 'services', 'aiItinerary.prompt.js')),
    ...requiresOf(path.join(src, 'services', 'aiItinerary.sanitizer.js')),
    ...requiresOf(path.join(src, 'utils', 'AiError.js')),
    ...requiresOf(path.join(src, 'utils', 'itineraryTime.js')),
  ];
  assert.deepEqual([...new Set(loaded)].sort(), ['../utils/AiError', '../utils/itineraryTime', './aiItinerary.prompt', 'crypto']);
});

test('requiring the script sends nothing, and its default models are the server\'s', () => {
  const liveCheck = require(SCRIPT);
  assert.equal(liveCheck.DEFAULT_MODEL, env.openai.model);
  assert.equal(liveCheck.DEFAULT_FALLBACK_MODEL, env.openai.fallbackModel);
});

test('it sends the server\'s own request for a two-day trip', () => {
  const { requestFor } = require(SCRIPT);
  const request = requestFor('some-model');
  assert.equal(request.model, 'some-model');
  assert.equal(request.instructions, INSTRUCTIONS);
  assert.equal(request.text.format.schema, ITINERARY_SCHEMA);
  assert.equal(request.store, false);
  const facts = JSON.parse(request.input[0].content);
  assert.equal(facts.days, 2);
  assert.equal(facts.dates.length, 2);
});
