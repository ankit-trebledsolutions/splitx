require('../testkit/safeEnv');

/**
 * The country and state lists a trip's destination is picked from, and how a
 * picked pair is checked and named. Pure: the data ships with the server.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const env = require('../src/config/env');
require('../testkit/safeEnv').assertSafe(env);
const regions = require('../src/services/regions.service');

test('every country once, by name, with a two-letter code and no states attached', () => {
  const countries = regions.listCountries();
  assert.ok(countries.length > 200);
  assert.deepEqual(
    countries.map((c) => c.name),
    [...countries.map((c) => c.name)].sort((a, b) => a.localeCompare(b, 'en'))
  );
  assert.equal(new Set(countries.map((c) => c.code)).size, countries.length);
  for (const country of countries) {
    assert.match(country.code, /^[A-Z]{2}$/, country.name);
    assert.deepEqual(Object.keys(country), ['code', 'name'], country.name);
  }
  assert.ok(countries.some((c) => c.code === 'IN' && c.name === 'India'));
});

test('a country lists its states by name, each with a code; the code is case-insensitive', () => {
  const states = regions.listStates('in');
  assert.ok(states.length >= 28);
  assert.ok(states.some((s) => s.name === 'Rajasthan' && s.code === 'RJ'));
  assert.equal(new Set(states.map((s) => s.code)).size, states.length);
  assert.deepEqual(states, regions.listStates('IN'));
  assert.equal(regions.listStates('XX'), null);
  assert.equal(regions.listStates(''), null);
});

test('a state the data lists without a code gets one made from its name', () => {
  assert.equal(regions.slugOf('Île-de-France'), 'ILE-DE-FRANCE');
  assert.equal(regions.slugOf('  Nuevo León '), 'NUEVO-LEON');
  assert.ok(regions.slugOf('a'.repeat(40)).length <= 24);
  for (const country of regions.listCountries()) {
    for (const state of regions.listStates(country.code)) {
      assert.match(state.code, /^[A-Z0-9-]{1,24}$/, `${country.name} / ${state.name}`);
    }
  }
});

test('resolve checks the codes against the lists and fills in the names', () => {
  assert.deepEqual(regions.resolve({ countryCode: 'in', stateCode: 'rj' }), {
    countryCode: 'IN',
    countryName: 'India',
    stateCode: 'RJ',
    stateName: 'Rajasthan',
  });
  // A country alone is a destination too.
  assert.deepEqual(regions.resolve({ countryCode: 'SG' }), {
    countryCode: 'SG',
    countryName: 'Singapore',
    stateCode: '',
    stateName: '',
  });
  assert.throws(
    () => regions.resolve({ countryCode: 'XX' }),
    (err) => err.statusCode === 400 && err.code === 'UNKNOWN_COUNTRY'
  );
  assert.throws(
    () => regions.resolve({ countryCode: 'IN', stateCode: 'NOPE' }),
    (err) => err.statusCode === 400 && err.code === 'UNKNOWN_STATE'
  );
  assert.throws(() => regions.resolve({}), (err) => err.code === 'UNKNOWN_COUNTRY');
});

test('the label is what every screen shows: "State, Country", or the country alone', () => {
  assert.equal(regions.labelOf(regions.resolve({ countryCode: 'IN', stateCode: 'RJ' })), 'Rajasthan, India');
  assert.equal(regions.labelOf(regions.resolve({ countryCode: 'SG' })), 'Singapore');
  assert.equal(regions.labelOf(null), '');
});
