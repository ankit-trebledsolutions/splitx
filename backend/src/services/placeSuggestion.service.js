const PlaceCache = require('../models/PlaceCache');
const PlaceLookup = require('../models/PlaceLookup');
const Stay = require('../models/Stay');
const Attraction = require('../models/Attraction');
const ApiError = require('../utils/ApiError');
const integrations = require('../integrations/store');
const groupService = require('./group.service');
const places = require('./places.service');

/**
 * "Suggested in Jaipur": the hotels and sights the Stays and Attractions tabs
 * offer for a trip's destination.
 *
 * The expensive part, asking the provider, happens once per destination per
 * day and is shared by every group going there (models/PlaceCache). Caps and
 * a rate limit sit in front of that one path only, so a thousand people
 * opening the tab for the same city cost one lookup, and one person cannot
 * make the server look up a thousand cities.
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

const MESSAGES = {
  PLACES_UNAVAILABLE: 'Suggestions are unavailable right now. You can still add places by hand.',
  PLACES_BUSY: 'Suggestions are busy right now. Try again in a minute.',
  PLACES_LIMIT: "You have reached today's limit for new destinations. Try again tomorrow.",
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
 * Daily caps, counted from the lookup rows. Both come from the admin panel
 * when set there (integrations/store), else from config/env. A cap of 0
 * switches fresh lookups off while leaving cached destinations working.
 */
const assertWithinCaps = async (userId) => {
  const { userDailyCap, globalDailyCap } = integrations.geoapify();
  const since = new Date(Date.now() - DAY_MS);

  const mine = await PlaceLookup.find({ user: userId, at: { $gte: since } })
    .sort({ at: 1 })
    .select('at')
    .lean();
  if (mine.length >= Number(userDailyCap)) {
    throw new ApiError(429, MESSAGES.PLACES_LIMIT, {
      code: 'PLACES_LIMIT',
      data: { retryAfter: mine.length ? retryAfterSeconds(mine[0].at) : DAY_MS / 1000 },
    });
  }
  if ((await PlaceLookup.countDocuments({ at: { $gte: since } })) >= Number(globalDailyCap)) {
    throw unavailable();
  }
};

// Where the destination is, from the cache or the geocoder. Null when unknown.
const resolveDestination = async (destination, destinationKey) => {
  const key = cacheKey('destination', destinationKey);
  const cached = await liveEntry(key);
  if (cached) return cached.resolved;

  const resolved = await places.geocodeDestination(destination);
  await saveEntry(key, { type: 'destination', destination, resolved, items: [] }, resolved ? DESTINATION_TTL_MS : UNKNOWN_TTL_MS);
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

const present = async ({ groupId, type, destination, entry, reason = null }) => ({
  configured: true,
  type,
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

  const destination = String(group.location || '').trim();
  if (destination.length < MIN_DESTINATION_LENGTH) {
    return present({ groupId, type, destination: null, reason: 'NO_DESTINATION' });
  }
  const destinationKey = normalizeDestination(destination);
  const key = cacheKey(type, destinationKey);

  const cached = cacheHoursOf() > 0 ? await liveEntry(key) : null;
  const stale = !cached || (refresh && Date.now() - new Date(cached.fetchedAt).getTime() >= REFRESH_MIN_AGE_MS);
  if (!stale) return present({ groupId, type, destination, entry: cached });

  // A fresh lookup. Costs a provider call, so every gate runs first.
  if (places.isBreakerOpen()) throw unavailable();
  await assertWithinCaps(userId);
  await PlaceLookup.create({ user: userId, group: groupId, type, key: destinationKey });

  let resolved;
  let items;
  try {
    resolved = await resolveDestination(destination, destinationKey);
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

module.exports = {
  suggest,
  // For tests.
  normalizeDestination,
  cacheKey,
  codeFor,
  retryAfterSeconds,
  MESSAGES,
};
