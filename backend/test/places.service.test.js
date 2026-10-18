require('../testkit/safeEnv');

/**
 * places.service against the fake Geoapify on 127.0.0.1: how a destination is
 * resolved, how hotels and sights are read and ranked, and how each kind of
 * failure is classified. No database. The "API key" picks the fake's scenario.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const env = require('../src/config/env');
require('../testkit/safeEnv').assertSafe(env);
const places = require('../src/services/places.service');
const fakeGeoapify = require('../scripts/fake-geoapify');

let fake;

const failure = async (scenario, run) => {
  env.geoapify.apiKey = scenario;
  const err = await run().then(
    () => assert.fail(`${scenario} should have failed`),
    (caught) => caught
  );
  assert.ok(err instanceof places.PlacesError, `${scenario}: ${err.message}`);
  return err;
};

test.before(async () => {
  fake = await fakeGeoapify.start({ slowMs: 8000 });
});
test.after(() => fake.close());

test.beforeEach(() => {
  env.geoapify.baseUrl = fake.url;
  env.geoapify.apiKey = 'fake-ok';
  fake.requests.length = 0;
  places.resetBreaker();
  test.mock.method(console, 'error', () => {});
});
test.afterEach(() => test.mock.restoreAll());

test('isConfigured follows the key', () => {
  assert.equal(places.isConfigured(), true);
  env.geoapify.apiKey = '';
  assert.equal(places.isConfigured(), false);
});

// ---- Where is it ------------------------------------------------------------------

test('a typed destination becomes a place with an id and a centre, asked for as a city first', async () => {
  const place = await places.geocodeDestination('  Jaipur ');
  assert.deepEqual(place, {
    placeId: fakeGeoapify.CITY.place_id,
    name: 'Jaipur',
    formatted: 'Jaipur, Rajasthan, India',
    lat: fakeGeoapify.CITY.lat,
    lon: fakeGeoapify.CITY.lon,
  });
  assert.equal(fake.requests.length, 1);
  assert.equal(fake.lastRequest().params.type, 'city');
  assert.equal(fake.lastRequest().params.text, '  Jaipur ');
  // The key travels as a query parameter, the only way Geoapify takes it.
  assert.equal(fake.lastRequest().params.apiKey, 'fake-ok');
});

test('a place the geocoder does not know is null, after one try as a city and one as anything', async () => {
  env.geoapify.apiKey = 'fake-nocity';
  assert.equal(await places.geocodeDestination('Atlantis'), null);
  assert.equal(fake.requests.length, 2);
  assert.equal(fake.requests[0].params.type, 'city');
  assert.equal(fake.requests[1].params.type, undefined);
});

// ---- What is there ------------------------------------------------------------------

const JAIPUR = { placeId: fakeGeoapify.CITY.place_id, lat: fakeGeoapify.CITY.lat, lon: fakeGeoapify.CITY.lon };

test('stays: hotels first and nearest first, labelled, nameless and duplicates dropped', async () => {
  const items = await places.searchPlaces('stay', JAIPUR);
  assert.equal(fake.requests.length, 1);
  const { params } = fake.lastRequest();
  assert.equal(params.filter, `place:${JAIPUR.placeId}`);
  assert.equal(params.bias, `proximity:${JAIPUR.lon},${JAIPUR.lat}`);
  assert.equal(params.conditions, 'named');
  assert.ok(params.categories.split(',').every((category) => category.startsWith('accommodation.')));

  assert.deepEqual(
    items.map((item) => [item.name, item.category, item.emoji]),
    [
      ['Hotel Pearl Palace', 'Hotel', '🏨'],
      ['Rambagh Palace', 'Hotel', '🏨'],
      ['Pink City Guest House', 'Guest house', '🏡'],
      ['Zostel Jaipur', 'Hostel', '🛏️'],
    ]
  );
  // The fake lists Hotel Pearl Palace twice under two ids; the first one stays.
  const [first] = items;
  assert.equal(first.placeId, 'h2');
  assert.equal(first.address, 'Jaipur, Rajasthan, India');
  assert.equal(first.distanceKm, 1.5);
  assert.equal(first.categoryKey, 'accommodation.hotel');
  assert.equal('weight' in first, false);
});

test('attractions: the famous ones first, at most twenty, nameless dropped', async () => {
  const items = await places.searchPlaces('attraction', JAIPUR);
  assert.equal(fake.lastRequest().params.limit, '60');
  assert.equal(items.length, 20);
  // UNESCO beats a fort beats a temple beats a museum; a fountain is last of the named kinds.
  assert.deepEqual(
    items.slice(0, 6).map((item) => item.name),
    ['Jantar Mantar', 'Amber Fort', 'Hawa Mahal', 'Govind Dev Ji Temple', 'Albert Hall Museum', 'Jaipur Zoo']
  );
  assert.equal(items.find((item) => item.name === 'Jantar Mantar').category, 'UNESCO World Heritage');
  assert.equal(items.find((item) => item.name === 'Amber Fort').emoji, '🏛️');
  assert.equal(items.find((item) => item.name === 'Govind Dev Ji Temple').category, 'Temple');
  assert.ok(!items.some((item) => item.name === ''));
  // Twenty-five named candidates arrived; the fountain and the statue did not make the cut.
  assert.ok(!items.some((item) => item.name === 'Birla Fountain'));
});

test('ranking: equal weight falls back to distance, Wikipedia adds weight', () => {
  const near = { name: 'a', weight: 60, distanceKm: 1 };
  const far = { name: 'b', weight: 60, distanceKm: 5 };
  const heavy = { name: 'c', weight: 61, distanceKm: 50 };
  assert.deepEqual(places.rank([far, heavy, near], 10).map((item) => item.name), ['c', 'a', 'b']);

  const plain = places.toItem({ properties: { name: 'X', place_id: '1', categories: ['tourism.sights'] } });
  const known = places.toItem({
    properties: { name: 'X', place_id: '1', categories: ['tourism.sights'], wiki_and_media: { wikidata: 'Q1' } },
  });
  assert.equal(known.weight - plain.weight, 12);
});

test('a category chain is read at its leaf, and the best leaf wins', () => {
  assert.equal(places.ruleFor(['tourism', 'tourism.sights', 'tourism.sights.memorial'])[1], 'Memorial');
  assert.equal(places.ruleFor(['tourism', 'tourism.sights'])[1], 'Sight');
  assert.equal(places.ruleFor(['tourism.sights.fort', 'heritage', 'heritage.unesco'])[1], 'UNESCO World Heritage');
  assert.equal(places.ruleFor(['accommodation', 'accommodation.hotel'])[1], 'Hotel');
  assert.equal(places.ruleFor(['commercial.shop']), null);
});

test('toItem: no name, no id or no known category means nothing to show', () => {
  assert.equal(places.toItem({ properties: { place_id: '1', categories: ['tourism.sights'] } }), null);
  assert.equal(places.toItem({ properties: { name: 'X', categories: ['tourism.sights'] } }), null);
  assert.equal(places.toItem({ properties: { name: 'X', place_id: '1', categories: ['commercial.shop'] } }), null);
  assert.equal(places.toItem(null), null);
});

test('a destination that is a point rather than an area falls back to a circle around it', async () => {
  env.geoapify.apiKey = 'fake-noboundary';
  const items = await places.searchPlaces('stay', JAIPUR);
  assert.equal(items.length, 4);
  assert.equal(fake.requests.length, 2);
  assert.match(fake.requests[1].params.filter, /^circle:/);
});

test('no places at all is an empty list, not an error', async () => {
  env.geoapify.apiKey = 'fake-empty';
  assert.deepEqual(await places.searchPlaces('attraction', JAIPUR), []);
});

// ---- Failures ------------------------------------------------------------------------

test('a refused key: AUTH, and the breaker opens so the next opens cost nothing', async () => {
  const err = await failure('fake-401', () => places.geocodeDestination('Jaipur'));
  assert.equal(err.kind, 'AUTH');
  assert.equal(places.isBreakerOpen(), true);
});

test('over the allowance: RATE_LIMIT, breaker untouched', async () => {
  const err = await failure('fake-429', () => places.searchPlaces('stay', JAIPUR));
  assert.equal(err.kind, 'RATE_LIMIT');
  assert.equal(places.isBreakerOpen(), false);
});

test('a provider error: SERVER', async () => {
  assert.equal((await failure('fake-500', () => places.searchPlaces('stay', JAIPUR))).kind, 'SERVER');
});

test('a 200 that is not JSON reads as nothing found, not a crash', async () => {
  env.geoapify.apiKey = 'fake-garbage';
  assert.equal(await places.geocodeDestination('Jaipur'), null);
  assert.deepEqual(await places.searchPlaces('stay', JAIPUR), []);
});

test('a provider that does not answer in time: TIMEOUT', async () => {
  const err = await failure('fake-slow', () => places.geocodeDestination('Jaipur'));
  assert.equal(err.kind, 'TIMEOUT');
});

test('nothing listening: NETWORK', async () => {
  env.geoapify.baseUrl = 'http://127.0.0.1:9';
  const err = await failure('fake-ok', () => places.geocodeDestination('Jaipur'));
  assert.equal(err.kind, 'NETWORK');
});

test('in tests the provider must be local, whatever the key', async () => {
  env.geoapify.baseUrl = 'https://api.geoapify.com';
  await assert.rejects(() => places.geocodeDestination('Jaipur'), /Refusing to call/);
});

test('an unknown type is a programming error, not a provider call', async () => {
  await assert.rejects(() => places.searchPlaces('restaurant', JAIPUR), /Unknown place type/);
  assert.equal(fake.requests.length, 0);
});
