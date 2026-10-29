require('../testkit/safeEnv');

/**
 * The pure rules of the job service: which error code a failure becomes, how
 * the trip facts are settled, and the cap arithmetic. Nothing here touches a
 * database; the flows that do are covered by scripts/smoke-ai-itinerary.js.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const env = require('../src/config/env');
require('../testkit/safeEnv').assertSafe(env);
const { codeFor, resolveTrip, retryAfterSeconds, ERROR_MESSAGES } = require('../src/services/aiItinerary.service');

const HOUR_MS = 60 * 60 * 1000;
const DAY_SECONDS = 24 * 60 * 60;

test('every failure kind maps to its job error code', () => {
  const expected = {
    AUTH: 'AI_UNAVAILABLE',
    QUOTA: 'AI_UNAVAILABLE',
    MODEL_NOT_FOUND: 'AI_UNAVAILABLE',
    RATE_LIMIT: 'AI_BUSY',
    SERVER: 'AI_BUSY',
    NETWORK: 'AI_BUSY',
    TIMEOUT: 'AI_TIMEOUT',
    REFUSED: 'AI_REFUSED',
    TRUNCATED: 'AI_TRUNCATED',
    BAD_DESTINATION: 'AI_BAD_DESTINATION',
    BAD_OUTPUT: 'AI_BAD_OUTPUT',
    EMPTY: 'AI_BAD_OUTPUT',
    BAD_REQUEST: 'AI_FAILED',
    SOMETHING_NEW: 'AI_FAILED',
  };
  for (const [kind, code] of Object.entries(expected)) assert.equal(codeFor(kind), code, kind);
  assert.equal(codeFor(undefined), 'AI_FAILED');
});

test('the fixed messages are exactly the contract, one per code', () => {
  assert.deepEqual(ERROR_MESSAGES, {
    AI_UNAVAILABLE: 'AI planner is unavailable right now. You can still add days by hand.',
    AI_BUSY: 'The AI planner is busy. Try again in a minute.',
    AI_TIMEOUT: 'That took longer than expected. Try again.',
    AI_STALE: 'That took longer than expected. Try again.',
    AI_REFUSED: 'AI could not plan this trip. Check the destination and your notes, then try again.',
    AI_BAD_DESTINATION: 'AI did not recognise that destination. Correct it and try again.',
    AI_TRUNCATED: 'The plan came out too long. Try a more relaxed pace.',
    AI_BAD_OUTPUT: 'AI returned a plan we could not read. Try again.',
    AI_CONFLICT: 'The itinerary changed while AI was planning. Nothing was replaced. Try again.',
    AI_CANCELLED: 'Planning was cancelled.',
    AI_FAILED: 'Something went wrong while planning. Try again.',
  });
  // The job model rejects anything longer.
  for (const message of Object.values(ERROR_MESSAGES)) assert.ok(message.length <= 200);
});

// ---- retryAfter ---------------------------------------------------------------

test('retryAfter: with the cap exactly reached, the oldest counted job leaving frees a slot', () => {
  const now = Date.now();
  const startedAts = [now - 2 * HOUR_MS, now - 23 * HOUR_MS, now - 5 * HOUR_MS].map((at) => new Date(at));
  assert.equal(retryAfterSeconds(startedAts, 3, now), 3600);
});

test('retryAfter: over the cap (it was lowered), enough jobs must leave to get under it', () => {
  const now = Date.now();
  const startedAts = [23, 20, 10, 5, 1].map((hours) => new Date(now - hours * HOUR_MS));
  // Five counted and a cap of 3: a slot opens when the third oldest (10 h ago) leaves.
  assert.equal(retryAfterSeconds(startedAts, 3, now), 14 * 3600);
});

test('retryAfter: rounds up, is never less than a second, and a cap of zero waits a full day', () => {
  const now = Date.now();
  assert.equal(retryAfterSeconds([new Date(now - 24 * HOUR_MS + 1500)], 1, now), 2);
  assert.equal(retryAfterSeconds([new Date(now - 24 * HOUR_MS - 5000)], 1, now), 1);
  assert.equal(retryAfterSeconds([], 0, now), DAY_SECONDS);
  // Dates read back from lean() rows and ISO strings work alike.
  assert.equal(retryAfterSeconds([new Date(now - HOUR_MS).toISOString()], 1, now), 23 * 3600);
});

// ---- resolveTrip ----------------------------------------------------------------

const START = new Date('2026-12-10T06:30:00.000Z');
const group = (overrides = {}) => ({
  location: 'Jaipur, India',
  startDate: START,
  totalDays: 3,
  members: ['a', 'b', 'c'],
  ...overrides,
});
const failedWith = (errorCode) => ({ status: 'failed', errorCode });

test('the group\'s own values win over what the requester typed, and nothing is written back', () => {
  const typed = { destination: 'Goa, India', startDate: new Date('2027-01-01T06:30:00.000Z'), days: 9 };
  const { resolved, writeBack, missing } = resolveTrip(group(), typed, null);
  assert.deepEqual(missing, []);
  assert.deepEqual(resolved, {
    destination: 'Jaipur, India',
    startDate: START,
    days: 3,
    groupSize: 3,
    tripContinuesAfter: false,
  });
  assert.deepEqual(writeBack, {});
});

test('typed values fill a blank group and are queued for write-back', () => {
  const typed = { destination: 'Goa, India', startDate: START, days: 5, groupSize: 2 };
  const blank = group({ location: '', startDate: null, totalDays: null });
  const { resolved, writeBack, missing } = resolveTrip(blank, typed, null);
  assert.deepEqual(missing, []);
  assert.equal(resolved.destination, 'Goa, India');
  assert.equal(resolved.days, 5);
  assert.equal(resolved.groupSize, 2);
  assert.deepEqual(writeBack, { location: 'Goa, India', startDate: START, totalDays: 5 });
});

test('a group location of one character counts as blank', () => {
  assert.deepEqual(resolveTrip(group({ location: ' ? ' }), {}, null).missing, ['destination']);
  const typed = resolveTrip(group({ location: '-' }), { destination: 'Goa, India' }, null);
  assert.equal(typed.resolved.destination, 'Goa, India');
  assert.equal(typed.writeBack.location, 'Goa, India');
});

test('nothing known about the trip: both details are reported missing', () => {
  const blank = group({ location: '', startDate: null, totalDays: null });
  assert.deepEqual(resolveTrip(blank, {}, null).missing, ['destination', 'days']);
});

test('the destination unlocks only after a destination failure, and only when one is typed', () => {
  const typed = { destination: 'Jaipur, Rajasthan' };
  for (const code of ['AI_BAD_DESTINATION', 'AI_REFUSED']) {
    const unlocked = resolveTrip(group({ location: 'Jaipr' }), typed, failedWith(code));
    assert.equal(unlocked.resolved.destination, 'Jaipur, Rajasthan', code);
    assert.deepEqual(unlocked.writeBack, { location: 'Jaipur, Rajasthan' }, code);
  }
  // Unlocked but nothing typed: the group's value is used again.
  assert.equal(resolveTrip(group(), {}, failedWith('AI_REFUSED')).resolved.destination, 'Jaipur, India');
  // Any other outcome keeps it locked.
  for (const latest of [failedWith('AI_TIMEOUT'), { status: 'done', errorCode: null }, { status: 'running', errorCode: 'AI_REFUSED' }]) {
    assert.equal(resolveTrip(group(), typed, latest).resolved.destination, 'Jaipur, India');
  }
});

test('at most 14 days are planned, and a longer trip is marked as continuing', () => {
  const long = resolveTrip(group({ totalDays: 20 }), {}, null);
  assert.equal(long.resolved.days, 14);
  assert.equal(long.resolved.tripContinuesAfter, true);
  // The group already knows its length: the cut-off is not written back over it.
  assert.deepEqual(long.writeBack, {});

  const exact = resolveTrip(group({ totalDays: 14 }), {}, null);
  assert.equal(exact.resolved.days, 14);
  assert.equal(exact.resolved.tripContinuesAfter, false);
});

test('group size defaults to the member count and is clamped to 50', () => {
  assert.equal(resolveTrip(group(), {}, null).resolved.groupSize, 3);
  assert.equal(resolveTrip(group(), { groupSize: 51 }, null).resolved.groupSize, 50);
  const crowd = group({ members: Array.from({ length: 80 }, (_, i) => `m${i}`) });
  assert.equal(resolveTrip(crowd, {}, null).resolved.groupSize, 50);
});
