require('../testkit/safeEnv');

/**
 * End-to-end smoke test of the suggested stays and attractions: the real
 * Express app over HTTP, a throwaway local database, and the fake Geoapify
 * server. Nothing real is touched (see testkit/safeEnv.js), and it costs
 * nothing.
 *
 *   npm run smoke:places                          needs a local mongod on 27017
 *   SMOKE_MONGO_BASE=mongodb://127.0.0.1:27018 npm run smoke:places
 *   node scripts/smoke-places.js --verbose        also print the server's logs
 *
 * The database is named splix_places_smoke_<timestamp> and dropped at the end.
 * Exits 0 only when every case passes.
 */
const assert = require('node:assert/strict');
const fakeGeoapify = require('./fake-geoapify');

const DB_PREFIX = 'splix_places_smoke_';
const MONGO_BASE = (process.env.SMOKE_MONGO_BASE || 'mongodb://127.0.0.1:27017').replace(/\/+$/, '');
const VERBOSE = process.argv.includes('--verbose');
const MINUTE_MS = 60 * 1000;

const print = console.log.bind(console);

let dropThrowawayDatabase = async () => {};

const main = async () => {
  const fake = await fakeGeoapify.start({ slowMs: 10000 });
  process.env.MONGODB_URI = `${MONGO_BASE}/${DB_PREFIX}${Date.now()}`;
  process.env.GEOAPIFY_BASE_URL = fake.url;

  const env = require('../src/config/env');
  require('../testkit/safeEnv').assertSafe(env);

  const mongoose = require('mongoose');
  const jwt = require('jsonwebtoken');
  const app = require('../src/app');
  const connectDB = require('../src/config/db');
  const realtime = require('../src/realtime/socket');
  const places = require('../src/services/places.service');
  const User = require('../src/models/User');
  const Group = require('../src/models/Group');
  const PlaceCache = require('../src/models/PlaceCache');
  const PlaceLookup = require('../src/models/PlaceLookup');

  await connectDB();
  const dbName = mongoose.connection.name;
  dropThrowawayDatabase = async () => {
    assert.ok(dbName.startsWith(DB_PREFIX), `refusing to drop "${dbName}"`);
    await mongoose.connection.dropDatabase();
  };
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));

  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;

  // Socket events are not under test here; keep them off the wire.
  realtime.emitToGroup = () => {};
  realtime.emitToUser = () => {};

  // ---- Fixtures ------------------------------------------------------------

  const DEFAULT_CAPS = {
    userDailyCap: env.geoapify.userDailyCap,
    globalDailyCap: env.geoapify.globalDailyCap,
    searchUserDailyCap: env.geoapify.searchUserDailyCap,
    searchGlobalDailyCap: env.geoapify.searchGlobalDailyCap,
  };

  let userCount = 0;
  const makeUser = (name = 'Smoke Tester') => {
    userCount += 1;
    return User.create({ name, email: `smoke${userCount}@example.test`, googleId: `smoke-${userCount}` });
  };
  const makeGroup = async (admin, fields = {}) =>
    Group.create({
      name: 'Smoke Trip',
      groupType: 'trip',
      location: 'Jaipur, India',
      createdBy: admin._id,
      admin: admin._id,
      members: [admin._id],
      ...fields,
    });

  const call = async (user, method, url, body) => {
    const res = await fetch(`${base}${url}`, {
      method,
      headers: {
        Authorization: `Bearer ${jwt.sign({ sub: String(user._id) }, env.jwtSecret)}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };
  const suggest = (user, group, type, query = '') => call(user, 'GET', `/groups/${group._id}/suggestions/${type}${query}`);

  const expectError = (res, status, code) => {
    assert.equal(res.status, status, `expected HTTP ${status}, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.success, false);
    assert.equal(res.body.code, code);
  };
  const expectOk = (res) => {
    assert.equal(res.status, 200, `expected HTTP 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    return res.body.data;
  };
  const providerCalls = () => fake.requests.length;
  // Suggestion lookups only: name searches are counted under their own caps.
  const SUGGESTION_LOOKUPS = { type: { $in: ['stay', 'attraction'] } };
  const lookups = () => PlaceLookup.countDocuments(SUGGESTION_LOOKUPS);

  // ---- Runner --------------------------------------------------------------

  const results = [];
  let currentGroup = '';
  const section = (title) => {
    currentGroup = title;
    print(`\n${title}`);
  };
  const check = async (name, fn) => {
    places.resetBreaker();
    env.geoapify.apiKey = 'fake-ok';
    Object.assign(env.geoapify, DEFAULT_CAPS);
    fake.requests.length = 0;

    const logs = [];
    const real = { error: console.error, warn: console.warn };
    if (!VERBOSE) {
      console.error = (...args) => logs.push(args.map(String).join(' '));
      console.warn = console.error;
    }
    try {
      await fn();
      results.push({ group: currentGroup, name, ok: true });
      print(`  ok    ${name}`);
    } catch (err) {
      results.push({ group: currentGroup, name, ok: false });
      print(`  FAIL  ${name}\n        ${err.message.split('\n').join('\n        ')}`);
      for (const line of logs) print(`        log: ${line}`);
    } finally {
      Object.assign(console, real);
    }
  };

  const admin = await makeUser('Zaphod Beeblebrox');
  const member = await makeUser('Trillian Astra');
  const stranger = await makeUser('Arthur Dent');

  // ---- Cases ---------------------------------------------------------------

  section('Who can ask');

  await check('no key on the server: configured false, nothing else', async () => {
    const group = await makeGroup(admin);
    env.geoapify.apiKey = '';
    const data = expectOk(await suggest(admin, group, 'stay'));
    assert.equal(data.configured, false);
    assert.deepEqual(data.items, []);
    assert.equal(providerCalls(), 0);
  });

  await check('a home group has no suggestions: TRIP_ONLY', async () => {
    const group = await makeGroup(admin, { groupType: 'home', location: '' });
    expectError(await suggest(admin, group, 'stay'), 400, 'TRIP_ONLY');
  });

  await check('a non-member is refused, an unknown type is a 400', async () => {
    const group = await makeGroup(admin);
    assert.equal((await suggest(stranger, group, 'stay')).status, 403);
    assert.equal((await suggest(admin, group, 'restaurant')).status, 400);
    assert.equal(providerCalls(), 0);
  });

  await check('a trip with no destination: NO_DESTINATION, no provider call', async () => {
    const group = await makeGroup(admin, { location: '' });
    const data = expectOk(await suggest(admin, group, 'attraction'));
    assert.equal(data.configured, true);
    assert.equal(data.reason, 'NO_DESTINATION');
    assert.equal(data.destination, null);
    assert.deepEqual(data.items, []);
    assert.equal(providerCalls(), 0);
  });

  section('Suggestions and the shared cache');

  const jaipur = await makeGroup(admin, { members: [admin._id, member._id] });

  await check('stays for Jaipur: one geocode, one search, four hotels, the destination as resolved', async () => {
    const data = expectOk(await suggest(admin, jaipur, 'stay'));
    assert.equal(data.type, 'stay');
    assert.deepEqual(data.destination, { text: 'Jaipur, India', resolved: 'Jaipur, Rajasthan, India' });
    assert.equal(data.reason, null);
    assert.deepEqual(
      data.items.map((item) => item.name),
      ['Hotel Pearl Palace', 'Rambagh Palace', 'Pink City Guest House', 'Zostel Jaipur']
    );
    assert.equal(data.items[0].placeId, 'h2');
    assert.deepEqual(data.addedPlaceIds, []);
    assert.equal(data.provider.name, 'Geoapify');
    assert.match(data.provider.attribution, /OpenStreetMap/);
    assert.equal(providerCalls(), 2);
    assert.equal(fake.requests[0].path, '/v1/geocode/search');
    assert.equal(fake.requests[1].path, '/v2/places');
    assert.equal(await PlaceCache.countDocuments({}), 2);
    assert.equal(await lookups(), 1);
  });

  await check('the same tab again, and another member: served from the cache', async () => {
    expectOk(await suggest(admin, jaipur, 'stay'));
    const data = expectOk(await suggest(member, jaipur, 'stay'));
    assert.equal(data.items.length, 4);
    assert.equal(providerCalls(), 0);
    assert.equal(await lookups(), 1);
  });

  await check('another group going to " jaipur,india ": the same cache entry, no provider call', async () => {
    const other = await makeGroup(member, { location: ' jaipur,india ' });
    const data = expectOk(await suggest(member, other, 'stay'));
    assert.equal(data.destination.text, 'jaipur,india');
    assert.equal(data.items.length, 4);
    assert.equal(providerCalls(), 0);
    assert.equal(await lookups(), 1);
  });

  await check('attractions for Jaipur: the destination is already known, famous places first, twenty at most', async () => {
    const data = expectOk(await suggest(admin, jaipur, 'attraction'));
    assert.equal(data.items.length, 20);
    assert.deepEqual(
      data.items.slice(0, 3).map((item) => [item.name, item.category]),
      [
        ['Jantar Mantar', 'UNESCO World Heritage'],
        ['Amber Fort', 'UNESCO World Heritage'],
        ['Hawa Mahal', 'Heritage site'],
      ]
    );
    // No second geocode: the destination was cached by the stays lookup.
    assert.equal(providerCalls(), 1);
    assert.equal(fake.requests[0].path, '/v2/places');
    assert.equal(await lookups(), 2);
  });

  section('Adding a suggestion');

  await check('a stay added from a suggestion carries its place id and is then marked as added', async () => {
    const created = await call(admin, 'POST', `/groups/${jaipur._id}/stays`, {
      name: 'Hotel Pearl Palace',
      address: 'Jaipur, Rajasthan, India',
      checkIn: '2026-12-10T06:30:00.000Z',
      checkOut: '2026-12-12T06:30:00.000Z',
      pricePerNight: 60,
      placeId: 'h2',
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.data.stay.placeId, 'h2');
    const data = expectOk(await suggest(member, jaipur, 'stay'));
    assert.deepEqual(data.addedPlaceIds, ['h2']);

    const again = await call(member, 'POST', `/groups/${jaipur._id}/stays`, {
      name: 'Hotel Pearl Palace',
      checkIn: '2026-12-10T06:30:00.000Z',
      checkOut: '2026-12-12T06:30:00.000Z',
      pricePerNight: 60,
      placeId: 'h2',
    });
    expectError(again, 409, 'PLACE_ALREADY_ADDED');
  });

  await check('the same for an attraction; a hand-typed one has no place id', async () => {
    const created = await call(member, 'POST', `/groups/${jaipur._id}/attractions`, {
      name: 'Jantar Mantar',
      category: 'UNESCO World Heritage',
      distanceKm: 0.8,
      emoji: '🏛️',
      placeId: 'a8',
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const data = expectOk(await suggest(admin, jaipur, 'attraction'));
    assert.deepEqual(data.addedPlaceIds, ['a8']);
    expectError(
      await call(admin, 'POST', `/groups/${jaipur._id}/attractions`, { name: 'Jantar Mantar', placeId: 'a8' }),
      409,
      'PLACE_ALREADY_ADDED'
    );
    const typed = await call(admin, 'POST', `/groups/${jaipur._id}/attractions`, { name: 'Chai stall' });
    assert.equal(typed.status, 201);
    assert.equal(typed.body.data.attraction.placeId, null);
  });

  await check('a provider id as long as the real ones (150 characters) is accepted', async () => {
    const suggestions = expectOk(await suggest(admin, jaipur, 'attraction'));
    const amber = suggestions.items.find((item) => item.name === 'Amber Fort');
    assert.equal(amber.placeId.length, 150);
    const created = await call(admin, 'POST', `/groups/${jaipur._id}/attractions`, {
      name: amber.name,
      category: amber.category,
      emoji: amber.emoji,
      placeId: amber.placeId,
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.data.attraction.placeId, amber.placeId);
    assert.ok(expectOk(await suggest(member, jaipur, 'attraction')).addedPlaceIds.includes(amber.placeId));
  });

  section('Refreshing');

  await check('a refresh within ten minutes is the cached copy; after that it asks again', async () => {
    expectOk(await suggest(admin, jaipur, 'stay', '?refresh=1'));
    assert.equal(providerCalls(), 0);

    await PlaceCache.updateOne({ key: 'stay|jaipur india' }, { $set: { fetchedAt: new Date(Date.now() - 11 * MINUTE_MS) } });
    const data = expectOk(await suggest(admin, jaipur, 'stay', '?refresh=1'));
    assert.equal(data.items.length, 4);
    assert.equal(providerCalls(), 1);
    assert.equal(await lookups(), 3);
  });

  await check('a provider failure during a refresh keeps the cached copy', async () => {
    await PlaceCache.updateOne({ key: 'stay|jaipur india' }, { $set: { fetchedAt: new Date(Date.now() - 11 * MINUTE_MS) } });
    env.geoapify.apiKey = 'fake-500';
    const data = expectOk(await suggest(admin, jaipur, 'stay', '?refresh=1'));
    assert.equal(data.items.length, 4);
    assert.equal(providerCalls(), 1);
  });

  section('A destination picked from the lists');

  const search = (user, group, type, q) =>
    call(user, 'GET', `/groups/${group._id}/places/search?type=${type}&q=${encodeURIComponent(q)}`);

  await check('the country and state lists are served, a day cacheable; an unknown country is a 404', async () => {
    const countries = await call(admin, 'GET', '/places/countries');
    assert.equal(countries.status, 200);
    assert.ok(countries.body.data.countries.length > 200);
    assert.ok(countries.body.data.countries.some((c) => c.code === 'IN' && c.name === 'India'));
    const states = await call(admin, 'GET', '/places/countries/in/states');
    assert.equal(states.status, 200);
    assert.equal(states.body.data.countryCode, 'IN');
    assert.ok(states.body.data.states.some((s) => s.code === 'RJ' && s.name === 'Rajasthan'));
    assert.equal((await call(admin, 'GET', '/places/countries/XX/states')).status, 404);
    assert.equal((await call(admin, 'GET', '/places/countries/IND/states')).status, 400);
    assert.equal(providerCalls(), 0);
  });

  let rajasthan;
  await check('creating a trip with a picked country and state: names filled in, the text written too', async () => {
    const created = await call(admin, 'POST', '/groups', {
      name: 'Rajasthan Trip',
      groupType: 'trip',
      totalDays: 3,
      startDate: '2026-12-10T00:00:00.000Z',
      destination: { countryCode: 'in', stateCode: 'rj' },
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const { group } = created.body.data;
    assert.deepEqual(group.destination, { countryCode: 'IN', countryName: 'India', stateCode: 'RJ', stateName: 'Rajasthan' });
    assert.equal(group.location, 'Rajasthan, India');
    // The member joins, for the checks below that ask as them.
    rajasthan = await Group.findByIdAndUpdate(group._id, { $addToSet: { members: member._id } }, { new: true });

    expectError(
      await call(admin, 'POST', '/groups', { name: 'Nowhere', groupType: 'trip', destination: { countryCode: 'IN', stateCode: 'NOPE' } }),
      400,
      'UNKNOWN_STATE'
    );
    expectError(
      await call(admin, 'POST', '/groups', { name: 'Nowhere', groupType: 'trip', destination: { countryCode: 'XX' } }),
      400,
      'UNKNOWN_COUNTRY'
    );
    // Not a trip: the destination is dropped, not refused.
    const home = await call(admin, 'POST', '/groups', { name: 'Flat', groupType: 'home', destination: { countryCode: 'IN' } });
    assert.equal(home.status, 201);
    assert.equal(home.body.data.group.destination, null);
    assert.equal(home.body.data.group.location, '');
  });

  await check('stays in the state: geocoded as a state within the country, searched within its boundary', async () => {
    const data = expectOk(await suggest(admin, rajasthan, 'stay'));
    assert.deepEqual(data.destination, { text: 'Rajasthan, India', resolved: 'Rajasthan, India' });
    assert.equal(data.items.length, 4);
    assert.ok(data.items.every((item) => item.distanceKm === null));
    assert.equal(providerCalls(), 2);
    const [geocode, places] = fake.requests;
    assert.equal(geocode.path, '/v1/geocode/search');
    assert.equal(geocode.params.type, 'state');
    assert.equal(geocode.params.filter, 'countrycode:in');
    assert.equal(geocode.params.text, 'Rajasthan, India');
    assert.equal(places.path, '/v2/places');
    assert.equal(places.params.filter, `place:${fakeGeoapify.STATE.place_id}`);
    assert.equal(places.params.bias, undefined);
    assert.ok(await PlaceCache.findOne({ key: 'region|in|rj', type: 'region' }));
    assert.ok(await PlaceCache.findOne({ key: 'stay|region:in|rj', type: 'stay' }));
  });

  await check('another group picking the same state shares the cache', async () => {
    const other = await makeGroup(member, {
      location: 'Rajasthan, India',
      destination: { countryCode: 'IN', countryName: 'India', stateCode: 'RJ', stateName: 'Rajasthan' },
    });
    const data = expectOk(await suggest(member, other, 'stay'));
    assert.equal(data.items.length, 4);
    assert.equal(providerCalls(), 0);
  });

  await check('a country alone is a destination: geocoded as a country', async () => {
    const singapore = await makeGroup(admin, {
      location: 'Singapore',
      destination: { countryCode: 'SG', countryName: 'Singapore', stateCode: '', stateName: '' },
    });
    const data = expectOk(await suggest(admin, singapore, 'attraction'));
    assert.equal(data.destination.text, 'Singapore');
    assert.equal(fake.requests[0].params.type, 'country');
    assert.equal(fake.requests[1].params.filter, `place:${fakeGeoapify.COUNTRY.place_id}`);
    assert.equal(data.items.length, 20);
  });

  await check('changing the destination: a picked one, then typed text (which drops the picked one)', async () => {
    const group = await makeGroup(admin, { location: '', members: [admin._id, member._id] });
    const picked = await call(admin, 'PATCH', `/groups/${group._id}/destination`, {
      destination: { countryCode: 'IN', stateCode: 'GA' },
    });
    assert.equal(picked.status, 200, JSON.stringify(picked.body));
    assert.equal(picked.body.data.group.location, 'Goa, India');
    assert.equal(picked.body.data.group.destination.stateName, 'Goa');

    const typed = await call(admin, 'PATCH', `/groups/${group._id}/destination`, { location: 'Panaji' });
    assert.equal(typed.status, 200);
    assert.equal(typed.body.data.group.location, 'Panaji');
    assert.equal(typed.body.data.group.destination, null);

    assert.equal((await call(admin, 'PATCH', `/groups/${group._id}/destination`, {})).status, 400);
    expectError(
      await call(member, 'PATCH', `/groups/${group._id}/destination`, { destination: { countryCode: 'IN' } }),
      403,
      'DESTINATION_FORBIDDEN'
    );
  });

  section('Searching by name');

  await check('a name search: one provider call, by name, within the state; the same name again is free', async () => {
    const data = expectOk(await search(admin, rajasthan, 'stay', ' palace '));
    assert.equal(data.type, 'stay');
    assert.equal(data.query, 'palace');
    assert.equal(data.destination.text, 'Rajasthan, India');
    assert.deepEqual(
      data.items.map((item) => item.name),
      ['Rambagh Palace', 'Hotel Pearl Palace']
    );
    assert.equal(providerCalls(), 1);
    const { params } = fake.lastRequest();
    assert.equal(params.name, 'palace');
    assert.equal(params.filter, `place:${fakeGeoapify.STATE.place_id}`);
    assert.equal(await PlaceLookup.countDocuments({ type: 'search' }), 1);

    const again = expectOk(await search(member, rajasthan, 'stay', 'PALACE'));
    assert.equal(again.items.length, 2);
    assert.equal(providerCalls(), 1);
    assert.equal(await PlaceLookup.countDocuments({ type: 'search' }), 1);
    assert.ok(await PlaceCache.findOne({ key: 'search|stay|region:in|rj|palace', type: 'search' }));
  });

  await check('what the group already added is marked; attractions search too', async () => {
    await call(admin, 'POST', `/groups/${rajasthan._id}/stays`, {
      name: 'Rambagh Palace',
      checkIn: '2026-12-10T06:30:00.000Z',
      checkOut: '2026-12-12T06:30:00.000Z',
      pricePerNight: 300,
      placeId: 'h1',
    });
    const stays = expectOk(await search(admin, rajasthan, 'stay', 'palace'));
    assert.deepEqual(stays.addedPlaceIds, ['h1']);

    const sights = expectOk(await search(admin, rajasthan, 'attraction', 'fort'));
    assert.deepEqual(sights.items.map((item) => item.name), ['Amber Fort']);
    assert.equal(sights.items[0].category, 'UNESCO World Heritage');
  });

  await check('a single letter is answered empty without a call; a bad request is a 400', async () => {
    const data = expectOk(await search(admin, rajasthan, 'stay', 'p'));
    assert.deepEqual(data.items, []);
    assert.equal(data.query, 'p');
    assert.equal(providerCalls(), 0);
    assert.equal((await search(admin, rajasthan, 'restaurant', 'palace')).status, 400);
    assert.equal((await call(admin, 'GET', `/groups/${rajasthan._id}/places/search?type=stay`)).status, 400);
    assert.equal((await search(stranger, rajasthan, 'stay', 'palace')).status, 403);
  });

  await check('no destination: NO_DESTINATION; a typed city searches within its box', async () => {
    const bare = await makeGroup(admin, { location: '' });
    const none = expectOk(await search(admin, bare, 'stay', 'palace'));
    assert.equal(none.reason, 'NO_DESTINATION');
    assert.equal(providerCalls(), 0);

    const city = expectOk(await search(admin, jaipur, 'attraction', 'mahal'));
    assert.deepEqual(city.items.map((item) => item.name), ['Hawa Mahal']);
    assert.match(fake.lastRequest().params.filter, /^rect:/);
    assert.equal(city.items[0].distanceKm, 0.6);
  });

  await check('the search caps are their own: PLACES_SEARCH_LIMIT, while suggestions still work', async () => {
    env.geoapify.searchUserDailyCap = 1;
    const user = await makeUser('Ford Prefect');
    const group = await makeGroup(user, {
      location: 'Rajasthan, India',
      destination: { countryCode: 'IN', countryName: 'India', stateCode: 'RJ', stateName: 'Rajasthan' },
    });
    expectOk(await search(user, group, 'stay', 'zostel'));
    const limited = await search(user, group, 'stay', 'pink city');
    expectError(limited, 429, 'PLACES_SEARCH_LIMIT');
    assert.ok(limited.body.retryAfter > 0);
    // A name already answered is still free.
    expectOk(await search(user, group, 'stay', 'zostel'));
    // Suggestions count their own lookups.
    env.geoapify.userDailyCap = 1;
    expectOk(await suggest(user, group, 'attraction'));
  });

  await check('a provider failure while searching is PLACES_UNAVAILABLE; a refused key opens the breaker', async () => {
    env.geoapify.apiKey = 'fake-500';
    expectError(await search(admin, rajasthan, 'attraction', 'temple'), 503, 'PLACES_UNAVAILABLE');
    env.geoapify.apiKey = 'fake-401';
    expectError(await search(admin, rajasthan, 'attraction', 'temple'), 503, 'PLACES_UNAVAILABLE');
    assert.equal(places.isBreakerOpen(), true);
    env.geoapify.apiKey = 'fake-ok';
    expectError(await search(admin, rajasthan, 'attraction', 'zoo'), 503, 'PLACES_UNAVAILABLE');
  });

  section('Destinations the provider cannot help with');

  await check('an unknown destination: UNKNOWN_DESTINATION, remembered so it is not asked again at once', async () => {
    const group = await makeGroup(admin, { location: 'Atlantis' });
    env.geoapify.apiKey = 'fake-nocity';
    const data = expectOk(await suggest(admin, group, 'stay'));
    assert.equal(data.reason, 'UNKNOWN_DESTINATION');
    assert.equal(data.destination.text, 'Atlantis');
    assert.deepEqual(data.items, []);
    assert.equal(providerCalls(), 2); // as a city, then as anything

    fake.requests.length = 0;
    const again = expectOk(await suggest(admin, group, 'stay'));
    assert.equal(again.reason, 'UNKNOWN_DESTINATION');
    assert.equal(providerCalls(), 0);
  });

  await check('no places at all is an empty list, cached like any other answer', async () => {
    const group = await makeGroup(admin, { location: 'Emptyville' });
    env.geoapify.apiKey = 'fake-empty';
    const data = expectOk(await suggest(admin, group, 'attraction'));
    assert.deepEqual(data.items, []);
    assert.equal(data.reason, null);
    fake.requests.length = 0;
    expectOk(await suggest(admin, group, 'attraction'));
    assert.equal(providerCalls(), 0);
  });

  section('Failures and spend control');

  await check('provider down: PLACES_UNAVAILABLE; over its allowance: PLACES_BUSY', async () => {
    const down = await makeGroup(admin, { location: 'Udaipur' });
    env.geoapify.apiKey = 'fake-500';
    expectError(await suggest(admin, down, 'stay'), 503, 'PLACES_UNAVAILABLE');
    const busy = await makeGroup(admin, { location: 'Jodhpur' });
    env.geoapify.apiKey = 'fake-429';
    expectError(await suggest(admin, busy, 'stay'), 503, 'PLACES_BUSY');
  });

  await check('a refused key opens the breaker: the next destination costs no call', async () => {
    const first = await makeGroup(admin, { location: 'Agra' });
    env.geoapify.apiKey = 'fake-401';
    expectError(await suggest(admin, first, 'stay'), 503, 'PLACES_UNAVAILABLE');
    assert.equal(places.isBreakerOpen(), true);
    fake.requests.length = 0;
    const second = await makeGroup(admin, { location: 'Delhi' });
    env.geoapify.apiKey = 'fake-ok';
    expectError(await suggest(admin, second, 'stay'), 503, 'PLACES_UNAVAILABLE');
    assert.equal(providerCalls(), 0);
    // Cached destinations keep working meanwhile.
    expectOk(await suggest(admin, jaipur, 'stay'));
  });

  await check('the per-person cap counts fresh lookups only, and answers with retryAfter', async () => {
    const before = await PlaceLookup.countDocuments({ user: admin._id, ...SUGGESTION_LOOKUPS });
    env.geoapify.userDailyCap = before;
    const fresh = await makeGroup(admin, { location: 'Mumbai' });
    const res = await suggest(admin, fresh, 'stay');
    expectError(res, 429, 'PLACES_LIMIT');
    assert.ok(res.body.retryAfter > 0 && res.body.retryAfter <= 24 * 60 * 60);
    assert.equal(providerCalls(), 0);
    // Cached destinations are free.
    expectOk(await suggest(admin, jaipur, 'attraction'));
    // Another person is not affected.
    await Group.updateOne({ _id: fresh._id }, { $addToSet: { members: member._id } });
    expectOk(await suggest(member, fresh, 'stay'));
  });

  await check('the server-wide cap reads as unavailable', async () => {
    env.geoapify.globalDailyCap = await lookups();
    const fresh = await makeGroup(stranger, { location: 'Goa' });
    expectError(await suggest(stranger, fresh, 'stay'), 503, 'PLACES_UNAVAILABLE');
    assert.equal(providerCalls(), 0);
  });

  section('Setting the destination');

  await check('the admin fills in a missing destination, and suggestions follow', async () => {
    const group = await makeGroup(admin, { location: '', members: [admin._id, member._id] });
    assert.equal(expectOk(await suggest(member, group, 'stay')).reason, 'NO_DESTINATION');

    expectError(
      await call(member, 'PATCH', `/groups/${group._id}/destination`, { location: 'Jaipur, India' }),
      403,
      'DESTINATION_FORBIDDEN'
    );
    const tooShort = await call(admin, 'PATCH', `/groups/${group._id}/destination`, { location: 'J' });
    assert.equal(tooShort.status, 400);

    const set = await call(admin, 'PATCH', `/groups/${group._id}/destination`, { location: '  Jaipur, India ' });
    assert.equal(set.status, 200, JSON.stringify(set.body));
    assert.equal(set.body.data.group.location, 'Jaipur, India');

    const data = expectOk(await suggest(member, group, 'stay'));
    assert.equal(data.items.length, 4);
    assert.equal(providerCalls(), 0); // Jaipur is cached
  });

  await check('a home group has no destination to set', async () => {
    const group = await makeGroup(admin, { groupType: 'home', location: '' });
    expectError(await call(admin, 'PATCH', `/groups/${group._id}/destination`, { location: 'Jaipur' }), 400, 'TRIP_ONLY');
  });

  // ---- Teardown ------------------------------------------------------------

  section('Clean-up');

  await new Promise((resolve) => server.close(resolve));
  await fake.close();

  await check(`throwaway database ${dbName} is dropped`, async () => {
    await dropThrowawayDatabase();
    const { databases } = await mongoose.connection.getClient().db('admin').admin().listDatabases();
    assert.equal(databases.some((db) => db.name === dbName), false);
  });
  await mongoose.disconnect();

  // ---- Summary -------------------------------------------------------------

  print('');
  const groups = [...new Set(results.map((result) => result.group))];
  for (const group of groups) {
    const inGroup = results.filter((result) => result.group === group);
    const passed = inGroup.filter((result) => result.ok).length;
    print(`${passed === inGroup.length ? 'PASS' : 'FAIL'}  ${group} (${passed}/${inGroup.length})`);
  }
  const failed = results.filter((result) => !result.ok).length;
  print(`\nSMOKE places: ${results.length - failed} passed, ${failed} failed, ${results.length} cases`);
  return failed;
};

main()
  .then((failed) => process.exit(failed ? 1 : 0))
  .catch(async (err) => {
    console.error(`Smoke test could not run: ${err.message}`);
    await dropThrowawayDatabase().catch(() => {});
    process.exit(1);
  });
