require('../testkit/safeEnv');

/**
 * The pure rules of the suggestions service: how a destination becomes a
 * cache key, which error a provider failure becomes, and the retry arithmetic.
 * The flows that touch the database run against a local MongoDB and the fake
 * provider through `npm run dev:local` (see scripts/fake-geoapify.js).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const env = require('../src/config/env');
require('../testkit/safeEnv').assertSafe(env);
const { normalizeDestination, cacheKey, codeFor, retryAfterSeconds, MESSAGES } = require('../src/services/placeSuggestion.service');

test('the same destination written differently shares one cache entry', () => {
  const key = normalizeDestination('Jaipur, Rajasthan');
  assert.equal(key, 'jaipur rajasthan');
  for (const variant of ['  jaipur,rajasthan ', 'JAIPUR - Rajasthan', 'Jaipur   Rajasthan', 'Jaípur, Rajasthan']) {
    assert.equal(normalizeDestination(variant), key, variant);
  }
  assert.equal(normalizeDestination(null), '');
  assert.equal(cacheKey('stay', key), 'stay|jaipur rajasthan');
  assert.notEqual(cacheKey('stay', key), cacheKey('attraction', key));
});

test('scripts other than Latin are kept, so two different cities never merge', () => {
  assert.equal(normalizeDestination('東京'), '東京');
  assert.notEqual(normalizeDestination('東京'), normalizeDestination('京都'));
});

test('a provider over its allowance reads as busy; everything else as unavailable', () => {
  assert.equal(codeFor('RATE_LIMIT'), 'PLACES_BUSY');
  for (const kind of ['AUTH', 'SERVER', 'NETWORK', 'TIMEOUT', 'BAD_RESPONSE', undefined]) {
    assert.equal(codeFor(kind), 'PLACES_UNAVAILABLE', String(kind));
  }
  for (const message of Object.values(MESSAGES)) assert.ok(message.length <= 200);
});

test('retryAfter counts to the moment the oldest lookup leaves the 24-hour window', () => {
  const now = Date.now();
  const hour = 60 * 60 * 1000;
  assert.equal(retryAfterSeconds(new Date(now - 23 * hour), now), 3600);
  // Already outside the window: at least one second, never zero or negative.
  assert.equal(retryAfterSeconds(new Date(now - 25 * hour), now), 1);
});

test('the Geoapify block of config/env has the documented defaults', () => {
  assert.equal(env.geoapify.cacheHours, 24);
  assert.equal(env.geoapify.userDailyCap, 30);
  assert.equal(env.geoapify.globalDailyCap, 400);
  // safeEnv pins these for tests.
  assert.equal(env.geoapify.timeoutMs, 1500);
  assert.equal(env.geoapify.baseUrl, 'http://127.0.0.1:9');
});

const { scopeOf, scopeKeyOf, SEARCH_MIN_LENGTH } = require('../src/services/placeSuggestion.service');

test('a picked destination scopes to its state, keyed by the codes, shown by its text', () => {
  const picked = { countryCode: 'IN', countryName: 'India', stateCode: 'RJ', stateName: 'Rajasthan' };
  const scope = scopeOf({ location: 'Rajasthan, India', destination: picked });
  assert.equal(scope.kind, 'region');
  assert.equal(scope.key, 'in|rj');
  assert.equal(scope.text, 'Rajasthan, India');
  assert.deepEqual(scope.region, picked);
  assert.equal(scopeKeyOf(scope), 'region:in|rj');
  // A country alone.
  const country = scopeOf({ location: '', destination: { countryCode: 'SG', countryName: 'Singapore' } });
  assert.equal(country.key, 'sg|');
  assert.equal(country.text, 'Singapore');
  assert.equal(country.region.stateCode, '');
});

test('typed text scopes as it always did, with the key it always had', () => {
  const scope = scopeOf({ location: ' Jaipur, Rajasthan ', destination: null });
  assert.equal(scope.kind, 'text');
  assert.equal(scope.key, 'jaipur rajasthan');
  assert.equal(scopeKeyOf(scope), 'jaipur rajasthan');
  assert.equal(scope.text, 'Jaipur, Rajasthan');
  assert.equal(scope.region, null);
  // Typed text can never look like a region key: its separators become spaces.
  assert.equal(scopeOf({ location: 'region:in|rj' }).key, 'region in rj');
});

test('a group with nothing usable has no scope', () => {
  assert.equal(scopeOf({ location: '', destination: null }), null);
  assert.equal(scopeOf({ location: 'x' }), null);
  assert.equal(scopeOf({}), null);
});

test('a name search needs at least two letters', () => {
  assert.equal(SEARCH_MIN_LENGTH, 2);
});
