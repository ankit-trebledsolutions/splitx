require('../testkit/safeEnv');

/**
 * The itinerary and attractions belong to trips: the one rule that both create
 * paths call before they write anything.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const env = require('../src/config/env');
require('../testkit/safeEnv').assertSafe(env);
const { assertTripGroup } = require('../src/services/group.service');

test('a trip group passes', () => {
  assert.doesNotThrow(() => assertTripGroup({ groupType: 'trip' }, 'Only trip groups have an itinerary.'));
});

test('every other kind of group is refused with 400 TRIP_ONLY and the given message', () => {
  for (const groupType of ['home', 'couple', 'event', 'other']) {
    assert.throws(
      () => assertTripGroup({ groupType }, 'Only trip groups have attractions.'),
      (err) => {
        assert.equal(err.statusCode, 400, groupType);
        assert.equal(err.code, 'TRIP_ONLY', groupType);
        assert.equal(err.message, 'Only trip groups have attractions.');
        return true;
      }
    );
  }
});
