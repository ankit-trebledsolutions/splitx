const PlaceCache = require('../models/PlaceCache');
const PlaceLookup = require('../models/PlaceLookup');
const Stay = require('../models/Stay');
const Attraction = require('../models/Attraction');
const ApiError = require('../utils/ApiError');
const integrations = require('../integrations/store');
const groupService = require('./group.service');
const regions = require('./regions.service');
const places = require('./places.service');

/**
 * "Suggested in Rajasthan": the hotels and sights the Stays and Attractions
 * tabs offer for a trip's destination, and the name search on those tabs.
 *
 * Where they look is the group's destination. A group whose destination was
 * picked from the country and state lists is kept to that state's boundary
 * (or the country's, when no state was picked); a group with only typed text
 * is kept to the city the geocoder makes of it, as before.
 *
 * The expensive part, asking the provider, happens once per destination per
 * day and is shared by every group going there (models/PlaceCache). Caps and
 * a rate limit sit in front of that one path only, so a thousand people
 * opening the tab for the same state cost one lookup, and one person cannot
 * make the server look up a thousand states. Name searches are cached the
 * same way, per (type, destination, name), under caps of their own.
 *
 * Nothing here knows which provider answers: places.service does.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
// A resolved destination is a fact about the world; keep it for a month.
const DESTINATION_TTL_MS = 30 * DAY_MS;
// A destination the geocoder did not know: asked again after a few hours,
// not on every open of the tab.
const UNKNOWN_TTL_MS = 6 * HOUR_MS;
// A forced refresh younger than this returns the cached copy: the button is
// for "something changed", not for tapping.
const REFRESH_MIN_AGE_MS = 10 * 60 * 1000;
const MIN_DESTINATION_LENGTH = 2;
// Fewer letters than this match half the hotels in a state: not worth a call.
const SEARCH_MIN_LENGTH = 2;

const MESSAGES = {
  PLACES_UNAVAILABLE: 'Suggestions are unavailable right now. You can still add places by hand.',
  PLACES_BUSY: 'Suggestions are busy right now. Try again in a minute.',
  PLACES_LIMIT: "You have reached today's limit for new destinations. Try again tomorrow.",
  PLACES_SEARCH_LIMIT: "You have reached today's limit for place searches. Try again tomorrow.",
};

// Which API error a provider failure becomes. AUTH also opened the breaker in
// places.service, so the next opens answer without a call.
const codeFor = (kind) => (kind === 'RATE_LIMIT' ? 'PLACES_BUSY' : 'PLACES_UNAVAILABLE');

const unavailable = (code = 'PLACES_UNAVAILABLE') => new ApiError(503, MESSAGES[code], { code });

// "  Jaipur, Rajasthan " and "jaipur,rajasthan" are the same destination.
const normalizeDestination = (text) =>
  String(text ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

const cacheKey = (type, destinationKey) => `${type}|${destinationKey}`;

const cacheHoursOf = () => Math.max(0, Number(integrations.geoapify().cacheHours) || 0);

const liveEntry = async (key) => PlaceCache.findOne({ key, expiresAt: { $gt: new Date() } }).lean();

const saveEntry = (key, fields, ttlMs) =>
  PlaceCache.findOneAndUpdate(
    { key },
    { $set: { key, ...fields, fetchedAt: new Date(), expiresAt: new Date(Date.now() + ttlMs) } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();

// Seconds until the oldest counted lookup leaves the 24-hour window.
const retryAfterSeconds = (oldestAt, now = Date.now()) =>
  Math.max(1, Math.ceil((new Date(oldestAt).getTime() + DAY_MS - now) / 1000));

/**
 * Daily caps, counted from the lookup rows of the given kinds. Both come from
 * the admin panel when set there (integrations/store), else from config/env.
 * A cap of 0 switches fresh lookups off while leaving cached answers working.
 */
const assertWithinCaps = async (userId, { kinds, userCap, globalCap, limitCode }) => {
  const since = new Date(Date.now() - DAY_MS);
  const counted = { type: { $in: kinds }, at: { $gte: since } };

  const mine = await PlaceLookup.find({ user: userId, ...counted })
    .sort({ at: 1 })
    .select('at')
    .lean();
  if (mine.length >= Number(userCap)) {
    throw new ApiError(429, MESSAGES[limitCode], {
      code: limitCode,
      data: { retryAfter: mine.length ? retryAfterSeconds(mine[0].at) : DAY_MS / 1000 },
    });
  }
  if ((await PlaceLookup.countDocuments(counted)) >= Number(globalCap)) {
    throw unavailable();
  }
};

// The suggestion lookups (a destination's hotels, a destination's sights) and
// the name searches each have their own pair of caps.
const assertWithinSuggestionCaps = (userId) => {
  const { userDailyCap, globalDailyCap } = integrations.geoapify();
  return assertWithinCaps(userId, {
    kinds: ['stay', 'attraction'],
    userCap: userDailyCap,
    globalCap: globalDailyCap,
    limitCode: 'PLACES_LIMIT',
  });
};

const assertWithinSearchCaps = (userId) => {
  const { searchUserDailyCap, searchGlobalDailyCap } = integrations.geoapify();
  return assertWithinCaps(userId, {
    kinds: ['search'],
    userCap: searchUserDailyCap,
    globalCap: searchGlobalDailyCap,
    limitCode: 'PLACES_SEARCH_LIMIT',
  });
};

/**
 * Where a group's suggestions and searches look. Null when the group has
 * nothing usable yet.
 *
 *   kind:   'region' for a destination picked from the lists, 'text' for typed
 *   key:    what the caches are keyed by, shared by every group going there
 *   text:   the destination as shown
 *   region: the picked country and state, for the geocoder; null for text
 *
 * A region key ("in|rj") can never collide with a typed one: normalisation
 * turns every "|" and ":" in typed text into a space.
 */
const scopeOf = (group) => {
  const picked = group.destination;
  if (picked?.countryCode) {
    return {
      kind: 'region',
      key: `${picked.countryCode}|${picked.stateCode || ''}`.toLowerCase(),
      text: String(group.location || '').trim() || regions.labelOf(picked),
      region: {
        countryCode: picked.countryCode,
        countryName: picked.countryName,
        stateCode: picked.stateCode || '',
        stateName: picked.stateName || '',
      },
    };
  }
  const text = String(group.location || '').trim();
  if (text.length < MIN_DESTINATION_LENGTH) return null;
  return { kind: 'text', key: normalizeDestination(text), text, region: null };
};

// The part of a suggestions or search cache key that names the scope. Typed
// destinations keep the key they always had, so nothing cached is lost.
const scopeKeyOf = (scope) => (scope.kind === 'region' ? `region:${scope.key}` : scope.key);

// Where the scope is on the map, from the cache or the geocoder. Null when unknown.
const resolveScope = async (scope) => {
  const rowType = scope.kind === 'region' ? 'region' : 'destination';
  const key = cacheKey(rowType, scope.key);
  const cached = await liveEntry(key);
  if (cached) return cached.resolved;

  const resolved =
    scope.kind === 'region' ? await places.geocodeRegion(scope.region) : await places.geocodeDestination(scope.text);
  await saveEntry(
    key,
    { type: rowType, destination: scope.text, resolved, items: [] },
    resolved ? DESTINATION_TTL_MS : UNKNOWN_TTL_MS
  );
  return resolved;
};

// Which suggestions the group already has, by provider id, so the card can
// say "Added" instead of offering the same hotel twice.
const addedPlaceIds = async (groupId, type, items) => {
  const ids = items.map((item) => item.placeId);
  if (!ids.length) return [];
  const Model = type === 'stay' ? Stay : Attraction;
  return Model.find({ group: groupId, placeId: { $in: ids } }).distinct('placeId');
};

const present = async ({ groupId, type, destination, entry, reason = null, query }) => ({
  configured: true,
  type,
  ...(query !== undefined ? { query } : {}),
  destination: destination
    ? { text: destination, resolved: entry?.resolved?.formatted || entry?.resolved?.name || null }
    : null,
  reason,
  fetchedAt: entry?.fetchedAt ?? null,
  items: entry?.items ?? [],
  addedPlaceIds: entry?.items?.length ? await addedPlaceIds(groupId, type, entry.items) : [],
  provider: places.PROVIDER,
});

/**
 * The suggestions for one tab of one group. Resolves to the API's Suggestions
 * shape; throws only for the caller's own mistakes (not a member, not a trip),
 * the caps, and a provider that could not be used. "Not set up", "no
 * destination" and "unknown destination" are answers, not errors: the tab
 * shows a line for each and the rest of the screen is unaffected.
 */
const suggest = async ({ groupId, userId, type, refresh = false }) => {
  const group = await groupService.getGroupForMember(groupId, userId);
  groupService.assertTripGroup(group, 'Only trip groups have suggestions.');

  if (!places.isConfigured()) return { configured: false, type, items: [], provider: places.PROVIDER };

  const scope = scopeOf(group);
  if (!scope) return present({ groupId, type, destination: null, reason: 'NO_DESTINATION' });
  const destination = scope.text;
  const key = cacheKey(type, scopeKeyOf(scope));

  const cached = cacheHoursOf() > 0 ? await liveEntry(key) : null;
  const stale = !cached || (refresh && Date.now() - new Date(cached.fetchedAt).getTime() >= REFRESH_MIN_AGE_MS);
  if (!stale) return present({ groupId, type, destination, entry: cached });

  // A fresh lookup. Costs a provider call, so every gate runs first.
  if (places.isBreakerOpen()) throw unavailable();
  await assertWithinSuggestionCaps(userId);
  await PlaceLookup.create({ user: userId, group: groupId, type, key: scopeKeyOf(scope) });

  let resolved;
  let items;
  try {
    resolved = await resolveScope(scope);
    if (!resolved) {
      return present({ groupId, type, destination, reason: 'UNKNOWN_DESTINATION', entry: null });
    }
    items = await places.searchPlaces(type, resolved);
  } catch (err) {
    if (!(err instanceof places.PlacesError)) throw err;
    // The cached copy, even past its time, beats an empty tab.
    if (cached) return present({ groupId, type, destination, entry: cached });
    throw unavailable(codeFor(err.kind));
  }

  const entry =
    cacheHoursOf() > 0
      ? await saveEntry(key, { type, destination, resolved, items }, cacheHoursOf() * HOUR_MS)
      : { resolved, items, fetchedAt: new Date() };
  return present({ groupId, type, destination, entry });
};

/**
 * Hotels or sights whose name matches what a member typed, within the
 * group's destination: the search box on the Stays and Attractions tabs.
 * Same gates and answers as suggest(), under the search caps: every new name
 * is a provider call, so a cache per (type, destination, name) means the
 * second person typing "Taj" in Rajasthan costs nothing. Answers the
 * Suggestions shape plus `query`, the name as it was typed.
 */
const search = async ({ groupId, userId, type, query }) => {
  const group = await groupService.getGroupForMember(groupId, userId);
  groupService.assertTripGroup(group, 'Only trip groups have places to search.');

  const name = String(query ?? '').trim();
  if (!places.isConfigured()) return { configured: false, type, query: name, items: [], provider: places.PROVIDER };

  const scope = scopeOf(group);
  if (!scope) return present({ groupId, type, destination: null, reason: 'NO_DESTINATION', query: name });
  const destination = scope.text;
  const nameKey = normalizeDestination(name);
  if (nameKey.length < SEARCH_MIN_LENGTH) {
    return present({ groupId, type, destination, entry: { items: [] }, query: name });
  }
  const key = cacheKey('search', `${type}|${scopeKeyOf(scope)}|${nameKey}`);

  const cached = cacheHoursOf() > 0 ? await liveEntry(key) : null;
  if (cached) return present({ groupId, type, destination, entry: cached, query: name });

  if (places.isBreakerOpen()) throw unavailable();
  await assertWithinSearchCaps(userId);
  await PlaceLookup.create({ user: userId, group: groupId, type: 'search', key: `${type}|${nameKey}` });

  let items;
  try {
    const resolved = await resolveScope(scope);
    if (!resolved) {
      return present({ groupId, type, destination, reason: 'UNKNOWN_DESTINATION', entry: null, query: name });
    }
    items = await places.searchByName(type, resolved, name);
  } catch (err) {
    if (!(err instanceof places.PlacesError)) throw err;
    throw unavailable(codeFor(err.kind));
  }

  const entry =
    cacheHoursOf() > 0
      ? await saveEntry(key, { type: 'search', destination, query: nameKey, items }, cacheHoursOf() * HOUR_MS)
      : { items, fetchedAt: new Date() };
  return present({ groupId, type, destination, entry, query: name });
};

module.exports = {
  suggest,
  search,
  // For tests.
  normalizeDestination,
  cacheKey,
  codeFor,
  retryAfterSeconds,
  scopeOf,
  scopeKeyOf,
  MESSAGES,
  SEARCH_MIN_LENGTH,
};
