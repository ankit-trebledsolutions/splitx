/**
 * A stand-in for Geoapify's geocoding and Places APIs, for tests and for
 * trying the suggestions in the app without a key. Loads nothing from src/
 * and no .env: it is only an HTTP server on 127.0.0.1.
 *
 *   node scripts/fake-geoapify.js --port 4011 [--slow-ms 5000]
 *
 * Point a LOCAL backend at it (never production, which ignores GEOAPIFY_BASE_URL):
 *
 *   GEOAPIFY_BASE_URL=http://127.0.0.1:4011
 *   GEOAPIFY_API_KEY=fake-ok
 *
 * The "key" picks what the server plays back:
 *
 *   fake-ok          a city and a page of hotels / sights for any destination
 *   fake-slow        the same, after --slow-ms (past GEOAPIFY_TIMEOUT_MS it is a timeout)
 *   fake-nocity      the geocoder knows no such place (results: [])
 *   fake-nobbox      a city without a bounding box (the search uses a circle)
 *   fake-noboundary  nothing inside the bounding box, results for the circle fallback
 *   fake-empty       a city, but no places at all
 *   fake-401         invalid key
 *   fake-429         daily allowance used up
 *   fake-500         server error
 *   fake-garbage     a 200 whose body is not JSON
 *
 * In tests: const fake = await require('./fake-geoapify').start();
 * then fake.url, fake.requests, fake.lastRequest() and await fake.close().
 */
const http = require('http');

const DEFAULT_SLOW_MS = 5000;

const CITY = {
  place_id: '51c0f4bd2d9f5e5340594a2d8a1a2b3c4d5e',
  name: 'Jaipur',
  city: 'Jaipur',
  state: 'Rajasthan',
  country: 'India',
  country_code: 'in',
  formatted: 'Jaipur, Rajasthan, India',
  result_type: 'city',
  lat: 26.9154576,
  lon: 75.8189817,
  bbox: { lon1: 75.6589817, lat1: 26.7554576, lon2: 75.9789817, lat2: 27.0754576 },
};

const feature = (id, name, categories, extra = {}) => ({
  type: 'Feature',
  properties: {
    name,
    place_id: id,
    categories,
    lat: 26.9 + Math.random() * 0.05,
    lon: 75.8 + Math.random() * 0.05,
    formatted: `${name}, Jaipur, Rajasthan, India`,
    address_line1: name,
    address_line2: 'Jaipur, Rajasthan, India',
    ...extra,
  },
});

const STAYS = [
  feature('h1', 'Rambagh Palace', ['accommodation', 'accommodation.hotel'], { distance: 3200 }),
  feature('h2', 'Hotel Pearl Palace', ['accommodation', 'accommodation.hotel'], { distance: 1500 }),
  feature('h3', 'Zostel Jaipur', ['accommodation', 'accommodation.hostel'], { distance: 900 }),
  feature('h4', 'Pink City Guest House', ['accommodation', 'accommodation.guest_house'], { distance: 2100 }),
  // No name: the server must drop it even though the provider sent it.
  feature('h5', '', ['accommodation', 'accommodation.hotel'], { distance: 400 }),
  feature('h6', 'Hotel Pearl Palace', ['accommodation', 'accommodation.hotel'], { distance: 1500 }),
];

// Deliberately in a poor order, with more than the page the app keeps.
const ATTRACTIONS = [
  feature('a1', 'Birla Fountain', ['tourism', 'tourism.attraction', 'tourism.attraction.fountain'], { distance: 2500 }),
  // Real Geoapify ids are 86 to 152 characters long; this one is 150.
  feature(`a2${'f'.repeat(148)}`, 'Amber Fort', ['tourism', 'tourism.sights', 'tourism.sights.fort', 'heritage', 'heritage.unesco'], {
    distance: 9800,
    wiki_and_media: { wikipedia: 'en:Amer Fort', wikidata: 'Q2468236' },
  }),
  feature('a3', 'Hawa Mahal', ['tourism', 'tourism.sights', 'tourism.sights.building', 'heritage'], {
    distance: 600,
    wiki_and_media: { wikipedia: 'en:Hawa Mahal' },
  }),
  // Named in Hindi, with the English name beside it, as OpenStreetMap has it.
  feature('a4', 'एल्बर्ट हॉल', ['entertainment', 'entertainment.museum'], {
    distance: 1800,
    name_international: { en: 'Albert Hall Museum', hi: 'एल्बर्ट हॉल' },
  }),
  feature('a5', 'Govind Dev Ji Temple', ['tourism', 'tourism.sights', 'tourism.sights.place_of_worship', 'tourism.sights.place_of_worship.temple'], { distance: 700 }),
  feature('a6', 'Nahargarh Viewpoint', ['tourism', 'tourism.attraction', 'tourism.attraction.viewpoint'], { distance: 6000 }),
  feature('a7', 'Statue of a Horse', ['tourism', 'tourism.attraction', 'tourism.attraction.artwork', 'tourism.attraction.artwork.statue'], { distance: 1200 }),
  feature('a8', 'Jantar Mantar', ['tourism', 'tourism.sights', 'heritage', 'heritage.unesco'], {
    distance: 800,
    wiki_and_media: { wikipedia: 'en:Jantar Mantar, Jaipur' },
  }),
  feature('a9', '', ['tourism', 'tourism.sights'], { distance: 300 }),
  feature('a10', 'Jaipur Zoo', ['entertainment', 'entertainment.zoo'], { distance: 1900 }),
  ...Array.from({ length: 16 }, (_, i) =>
    feature(`f${i}`, `Memorial ${i + 1}`, ['tourism', 'tourism.sights', 'tourism.sights.memorial'], { distance: 3000 + i * 10 })
  ),
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const start = async ({ port = 0, slowMs = DEFAULT_SLOW_MS } = {}) => {
  const requests = [];

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const params = Object.fromEntries(url.searchParams);
    const scenario = params.apiKey || '';
    requests.push({ path: url.pathname, params });

    const send = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(typeof body === 'string' ? body : JSON.stringify(body));
    };

    if (scenario === 'fake-401') return send(401, { statusCode: 401, error: 'Unauthorized', message: 'Invalid apiKey' });
    if (scenario === 'fake-429') return send(429, { statusCode: 429, error: 'Too Many Requests', message: 'Daily limit reached' });
    if (scenario === 'fake-500') return send(500, { statusCode: 500, error: 'Internal Server Error' });
    if (scenario === 'fake-garbage') return send(200, 'this is not json');
    if (scenario === 'fake-slow') await sleep(slowMs);

    if (url.pathname === '/v1/geocode/search') {
      if (scenario === 'fake-nocity') return send(200, { results: [], query: { text: params.text } });
      if (scenario === 'fake-nobbox') {
        const { bbox, ...withoutBox } = CITY;
        return send(200, { results: [withoutBox], query: { text: params.text } });
      }
      // Only a city is ever asked for first; the fallback query has no type.
      return send(200, { results: [CITY], query: { text: params.text } });
    }

    if (url.pathname === '/v2/places') {
      if (scenario === 'fake-empty') return send(200, { type: 'FeatureCollection', features: [] });
      if (scenario === 'fake-noboundary' && String(params.filter).startsWith('rect:')) {
        return send(200, { type: 'FeatureCollection', features: [] });
      }
      const isStay = String(params.categories).startsWith('accommodation');
      const limit = parseInt(params.limit, 10) || 20;
      return send(200, { type: 'FeatureCollection', features: (isStay ? STAYS : ATTRACTIONS).slice(0, limit) });
    }

    return send(404, { statusCode: 404, error: 'Not Found' });
  });

  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  const { port: boundPort } = server.address();
  return {
    url: `http://127.0.0.1:${boundPort}`,
    requests,
    lastRequest: () => requests[requests.length - 1],
    close: () => new Promise((resolve) => server.close(resolve)),
  };
};

module.exports = { start, CITY, STAYS, ATTRACTIONS };

if (require.main === module) {
  const flag = (name, fallback) => {
    const index = process.argv.indexOf(`--${name}`);
    return index === -1 ? fallback : process.argv[index + 1];
  };
  start({ port: parseInt(flag('port', '4011'), 10), slowMs: parseInt(flag('slow-ms', DEFAULT_SLOW_MS), 10) }).then(
    (fake) => console.log(`fake Geoapify listening on ${fake.url} (GEOAPIFY_BASE_URL=${fake.url})`)
  );
}
