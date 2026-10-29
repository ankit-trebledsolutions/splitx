const integrations = require('../integrations/store');

/**
 * The one file that talks to the places provider (Geoapify, OpenStreetMap
 * data). Three questions are asked of it: "where is this destination",
 * "what hotels / sights are there" and "which of them is called this". Everything it answers is turned into the
 * app's own shape here, so swapping the provider (for Google Places, say)
 * means rewriting this file and nothing above it.
 *
 * Callers get items or a PlacesError whose `kind` says what went wrong;
 * the provider's own error text is logged here and goes no further.
 */

class PlacesError extends Error {
  constructor(kind, { message, status } = {}) {
    super(message || kind);
    this.name = 'PlacesError';
    this.kind = kind; // AUTH | RATE_LIMIT | SERVER | NETWORK | TIMEOUT | BAD_RESPONSE
    this.status = status;
  }
}

const isConfigured = () => Boolean(integrations.geoapify().apiKey);

// A wrong or revoked key fails every request the same way. While the breaker
// is open the tabs show no suggestions instead of each open burning a call.
const BREAKER_MS = 10 * 60 * 1000;
let breakerOpenUntil = 0;
const isBreakerOpen = () => Date.now() < breakerOpenUntil;
const resetBreaker = () => {
  breakerOpenUntil = 0;
};
integrations.onChange((key) => {
  if (key === 'geoapify') resetBreaker();
});

// Tests must never reach the real provider, even with a real key in the environment.
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost']);
const assertLocalInTests = (baseUrl) => {
  if (process.env.NODE_ENV !== 'test') return;
  if (!LOCAL_HOSTS.has(new URL(baseUrl).hostname)) {
    throw new Error(`Refusing to call ${baseUrl} while NODE_ENV is test`);
  }
};

// ---- What is asked for, per type ------------------------------------------------

const TYPES = {
  stay: {
    categories: [
      'accommodation.hotel',
      'accommodation.guest_house',
      'accommodation.hostel',
      'accommodation.motel',
      'accommodation.apartment',
      'accommodation.chalet',
    ],
    // Two provider pages (20 results is one credit): room for the duplicates
    // OpenStreetMap carries and for guest houses behind the hotels.
    fetch: 40,
    keep: 20,
  },
  attraction: {
    categories: [
      'heritage',
      'tourism.sights',
      'tourism.attraction',
      'entertainment.museum',
      'entertainment.zoo',
      'entertainment.aquarium',
      'entertainment.theme_park',
      'entertainment.culture.gallery',
      'national_park',
      'beach',
    ],
    // Over-fetch, then rank: the provider has no notion of "famous", so the
    // ranking below picks the forts and temples out of the fountains. Five
    // credits; Jaipur answers about 60 of these in total.
    fetch: 100,
    keep: 20,
  },
};

// Longest matching prefix wins. Weight is how high a place of that kind ranks
// among attractions; label and emoji are what the card shows.
const CATEGORY_RULES = [
  ['heritage.unesco', 'UNESCO World Heritage', '🏛️', 100],
  ['heritage', 'Heritage site', '🏛️', 90],
  ['tourism.sights.castle', 'Castle', '🏰', 85],
  ['tourism.sights.fort', 'Fort', '🏰', 85],
  ['tourism.sights.archaeological_site', 'Archaeological site', '🏺', 82],
  ['tourism.sights.place_of_worship.temple', 'Temple', '🛕', 75],
  ['tourism.sights.place_of_worship.cathedral', 'Cathedral', '⛪', 75],
  ['tourism.sights.place_of_worship.mosque', 'Mosque', '🕌', 75],
  ['tourism.sights.place_of_worship.synagogue', 'Synagogue', '🕍', 75],
  ['tourism.sights.place_of_worship.church', 'Church', '⛪', 55],
  ['tourism.sights.place_of_worship.chapel', 'Chapel', '⛪', 50],
  ['tourism.sights.place_of_worship.shrine', 'Shrine', '⛩️', 55],
  ['tourism.sights.place_of_worship', 'Place of worship', '🛐', 55],
  ['tourism.sights.monastery', 'Monastery', '🛐', 72],
  ['tourism.sights.manor', 'Manor', '🏛️', 70],
  ['entertainment.museum', 'Museum', '🖼️', 62],
  ['national_park', 'National park', '🏞️', 66],
  ['beach', 'Beach', '🏖️', 58],
  ['entertainment.zoo', 'Zoo', '🦁', 56],
  ['entertainment.aquarium', 'Aquarium', '🐠', 56],
  ['entertainment.theme_park', 'Theme park', '🎡', 56],
  ['tourism.sights.memorial.monument', 'Monument', '🗿', 55],
  ['tourism.sights.memorial.tomb', 'Tomb', '🪦', 50],
  ['tourism.sights.memorial', 'Memorial', '🗿', 40],
  ['tourism.sights.tower', 'Tower', '🗼', 52],
  ['tourism.sights.bridge', 'Bridge', '🌉', 52],
  ['tourism.sights.lighthouse', 'Lighthouse', '🗼', 52],
  ['tourism.sights.city_gate', 'City gate', '🏯', 52],
  ['tourism.sights.city_hall', 'City hall', '🏛️', 45],
  ['tourism.sights.ruines', 'Ruins', '🏺', 60],
  ['tourism.sights.windmill', 'Windmill', '🌾', 45],
  ['tourism.sights.building', 'Historic building', '🏛️', 60],
  // Tagged on the building itself (Hawa Mahal), not always as a sight.
  ['building.historic', 'Historic building', '🏛️', 64],
  ['tourism.sights', 'Sight', '📍', 60],
  ['tourism.attraction.viewpoint', 'Viewpoint', '🔭', 50],
  ['tourism.attraction.fountain', 'Fountain', '⛲', 25],
  ['tourism.attraction.artwork', 'Artwork', '🎨', 25],
  ['tourism.attraction.clock', 'Clock', '🕰️', 20],
  ['tourism.attraction', 'Attraction', '📍', 35],
  ['entertainment.culture.gallery', 'Art gallery', '🎨', 48],
  ['entertainment.culture.theatre', 'Theatre', '🎭', 40],
  ['accommodation.hotel', 'Hotel', '🏨', 50],
  ['accommodation.guest_house', 'Guest house', '🏡', 40],
  ['accommodation.hostel', 'Hostel', '🛏️', 35],
  ['accommodation.motel', 'Motel', '🏩', 35],
  ['accommodation.apartment', 'Apartment', '🏢', 30],
  ['accommodation.chalet', 'Chalet', '🏡', 30],
  ['accommodation', 'Stay', '🏨', 20],
];

// A place known to Wikipedia is the kind people travel for.
const WIKI_BONUS = 12;

// The most specific rule that covers one category.
const ruleForCategory = (category) => {
  let best = null;
  for (const rule of CATEGORY_RULES) {
    const [prefix] = rule;
    if ((category === prefix || category.startsWith(`${prefix}.`)) && (!best || prefix.length > best[0].length)) {
      best = rule;
    }
  }
  return best;
};

// A feature lists its whole chain ("tourism", "tourism.sights",
// "tourism.sights.memorial"). Only the leaves say what the place is; among
// them, the kind that ranks highest decides (a fort that is also UNESCO
// heritage is shown as heritage).
const ruleFor = (categories = []) => {
  const leaves = categories.filter(
    (category) => !categories.some((other) => other !== category && other.startsWith(`${category}.`))
  );
  let best = null;
  for (const leaf of leaves) {
    const rule = ruleForCategory(leaf);
    if (rule && (!best || rule[3] > best[3])) best = rule;
  }
  return best;
};

const round1 = (value) => Math.round(value * 10) / 10;

// One provider feature as the app sees it. Null when it is not worth showing.
const toItem = (feature) => {
  const props = feature?.properties ?? {};
  // `name` is in the local script where OpenStreetMap has it that way (Hindi
  // for half of Jaipur's sights); the English name sits beside it when known.
  const name = String(props.name_international?.en || props.name || '').trim();
  if (!name || !props.place_id) return null;
  const rule = ruleFor(props.categories);
  if (!rule) return null;
  const [categoryKey, label, emoji, weight] = rule;
  const hasWiki = Boolean(props.wiki_and_media?.wikipedia || props.wiki_and_media?.wikidata);
  return {
    placeId: String(props.place_id),
    name: name.slice(0, 120),
    category: label,
    categoryKey,
    emoji,
    address: String(props.address_line2 || props.formatted || '')
      .trim()
      .slice(0, 200),
    lat: typeof props.lat === 'number' ? props.lat : null,
    lon: typeof props.lon === 'number' ? props.lon : null,
    distanceKm: typeof props.distance === 'number' ? round1(props.distance / 1000) : null,
    // Internal: dropped before the items leave this file.
    weight: weight + (hasWiki ? WIKI_BONUS : 0),
  };
};

// Best first, then nearest the centre. Exported for tests.
const rank = (items, keep) =>
  [...items]
    .sort((a, b) => b.weight - a.weight || (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9))
    .slice(0, keep)
    .map(({ weight, ...item }) => item);

// ---- HTTP ------------------------------------------------------------------------

const request = async (path, params) => {
  const { apiKey, baseUrl, timeoutMs } = integrations.geoapify();
  assertLocalInTests(baseUrl);
  const url = new URL(path, baseUrl);
  url.search = new URLSearchParams({ ...params, apiKey });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(url, { signal: controller.signal });
  } catch (err) {
    clearTimeout(timer);
    if (controller.signal.aborted) throw new PlacesError('TIMEOUT');
    console.error('[places] could not reach the provider:', err.message);
    throw new PlacesError('NETWORK');
  }

  let json;
  try {
    json = await res.json();
  } catch {
    json = null;
  } finally {
    clearTimeout(timer);
  }

  if (res.ok) return json ?? {};

  const detail = JSON.stringify(json?.message ?? json?.error ?? null).slice(0, 200);
  console.error(`[places] provider answered ${res.status} for ${path}:`, detail);
  if (res.status === 401 || res.status === 403) {
    breakerOpenUntil = Date.now() + BREAKER_MS;
    console.error(`[places] key refused: suggestions switched off for ${BREAKER_MS / 60000} minutes`);
    throw new PlacesError('AUTH', { status: res.status });
  }
  if (res.status === 429) throw new PlacesError('RATE_LIMIT', { status: res.status });
  if (res.status >= 500) throw new PlacesError('SERVER', { status: res.status });
  throw new PlacesError('BAD_RESPONSE', { status: res.status });
};

// A geocoder hit as the app keeps it: an id (also the key to its boundary in
// the Places API), a centre and, when known, a bounding box. Null for a hit
// missing any of those.
const toPlace = (hit, fallbackName) => {
  if (!hit?.place_id || typeof hit.lat !== 'number' || typeof hit.lon !== 'number') return null;
  const b = hit.bbox;
  const bbox =
    b && [b.lon1, b.lat1, b.lon2, b.lat2].every((value) => typeof value === 'number')
      ? [b.lon1, b.lat1, b.lon2, b.lat2]
      : null;
  return {
    placeId: String(hit.place_id),
    name: String(hit.city || hit.name || hit.formatted || fallbackName).slice(0, 120),
    formatted: String(hit.formatted || '').slice(0, 200),
    lat: hit.lat,
    lon: hit.lon,
    bbox,
  };
};

/**
 * Where a typed destination is. Resolves to { placeId, name, lat, lon } or
 * null when the geocoder has never heard of it. Tries a city first, which is
 * what people type, then anything (a state, a district, an island).
 */
const geocodeDestination = async (text) => {
  const ask = async (extra) => {
    const json = await request('/v1/geocode/search', { text, limit: '1', format: 'json', ...extra });
    return toPlace(Array.isArray(json.results) ? json.results[0] : null, text);
  };
  return (await ask({ type: 'city', lang: 'en' })) ?? (await ask({ lang: 'en' }));
};

/**
 * Where a picked state or country is: the same shape plus `scope`, and an id
 * that names the boundary the Places API can be kept to. Asked for by kind
 * and within the country, so "Georgia, United States" is the state and not
 * the country, and "Punjab, India" is not the Punjab across the border.
 */
const geocodeRegion = async ({ countryCode, countryName, stateName }) => {
  const filter = `countrycode:${String(countryCode).toLowerCase()}`;
  const ask = async (text, extra) => {
    const json = await request('/v1/geocode/search', { text, limit: '1', format: 'json', lang: 'en', ...extra });
    return toPlace(Array.isArray(json.results) ? json.results[0] : null, text);
  };
  if (stateName) {
    const place =
      (await ask(`${stateName}, ${countryName}`, { type: 'state', filter })) ?? (await ask(stateName, { filter }));
    return place ? { ...place, name: String(stateName).slice(0, 120), scope: 'state' } : null;
  }
  const place = (await ask(countryName, { type: 'country' })) ?? (await ask(countryName, { filter }));
  return place ? { ...place, name: String(countryName).slice(0, 120), scope: 'country' } : null;
};

// Where to look, in the order to try. A picked state or country (a place
// with a `scope`) is its administrative boundary, by the id the geocoder
// gave, with its bounding box as the fallback. A typed city is its bounding
// box, not its boundary: for Jaipur that is a few kilometres across and
// leaves Amber Fort and Jal Mahal outside, while the box the geocoder gives
// reaches them. A city with no box, or an empty box, gets a circle.
const FALLBACK_RADIUS_M = 15000;
const rectOf = (bbox) => `rect:${bbox.join(',')}`;
const circleOf = (place) => `circle:${place.lon},${place.lat},${FALLBACK_RADIUS_M}`;
const boundaryOf = (place) => `place:${place.placeId}`;
const areasOf = (place) =>
  (place.scope
    ? [boundaryOf(place), place.bbox && rectOf(place.bbox)]
    : [place.bbox && rectOf(place.bbox), circleOf(place)]
  ).filter(Boolean);

// Nearest the centre first for a city. A state or a country has no centre
// worth ranking by, so its results come as the provider orders them and
// carry no distance.
const biasFor = (place) => (place.scope ? {} : { bias: `proximity:${place.lon},${place.lat}` });

// The features inside the first of the areas that has any.
const featuresIn = async (params, areas) => {
  for (const filter of areas) {
    const json = await request('/v2/places', { ...params, filter });
    const features = Array.isArray(json.features) ? json.features : [];
    if (features.length) return features;
  }
  return [];
};

// OpenStreetMap often holds one place twice (a point and a building
// outline, or two spellings) under two ids: the same name for the same
// kind of place in one destination is one place. Order is kept.
const dedupe = (features) => {
  const seen = new Set();
  const items = [];
  for (const feature of features) {
    const item = toItem(feature);
    if (!item) continue;
    const identity = `${item.name.toLowerCase()}|${item.categoryKey}`;
    if (seen.has(item.placeId) || seen.has(identity)) continue;
    seen.add(item.placeId);
    seen.add(identity);
    items.push(item);
  }
  return items;
};

const specOf = (type) => {
  const spec = TYPES[type];
  if (!spec) throw new Error(`Unknown place type "${type}"`);
  return spec;
};

const searchPlaces = async (type, place) => {
  const spec = specOf(type);
  const features = await featuresIn(
    {
      categories: spec.categories.join(','),
      conditions: 'named',
      ...biasFor(place),
      limit: String(spec.fetch),
      lang: 'en',
    },
    areasOf(place)
  );
  return rank(dedupe(features), spec.keep);
};

// How many matches a name search shows. Over-fetched a little for the duplicates.
const SEARCH_KEEP = 10;

/**
 * Hotels or sights whose name matches what a member typed, within the place.
 * Only the first area is asked: an empty answer means no such name there,
 * not a boundary to fall back from. The provider's order is kept, since it
 * ranks by how well the name matches; dedupe() drops the doubles.
 */
const searchByName = async (type, place, name) => {
  const spec = specOf(type);
  const [area] = areasOf(place);
  const json = await request('/v2/places', {
    categories: spec.categories.join(','),
    name: String(name).trim(),
    filter: area,
    ...biasFor(place),
    limit: String(SEARCH_KEEP * 2),
    lang: 'en',
  });
  const items = dedupe(Array.isArray(json.features) ? json.features : []).slice(0, SEARCH_KEEP);
  return items.map(({ weight, ...item }) => item);
};

const PROVIDER = {
  name: 'Geoapify',
  attribution: 'Powered by Geoapify · © OpenStreetMap contributors',
  url: 'https://www.geoapify.com/',
};

module.exports = {
  PlacesError,
  PROVIDER,
  TYPES,
  isConfigured,
  isBreakerOpen,
  resetBreaker,
  geocodeDestination,
  geocodeRegion,
  searchPlaces,
  searchByName,
  SEARCH_KEEP,
  // For tests.
  toItem,
  rank,
  ruleFor,
};
