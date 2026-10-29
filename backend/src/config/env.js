require('dotenv').config();

const isProduction = (process.env.NODE_ENV || 'development') === 'production';

// Fallbacks are for local development only — in production the real value
// must come from the environment, so a missing secret fails loudly instead
// of silently running with a known default.
const required = (key, devFallback) => {
  const value = process.env[key] ?? (isProduction ? undefined : devFallback);
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
};

// File storage (Cloudflare R2). All four values or none: with none, uploads
// fall back to the local uploads folder, which is fine for development but is
// only as safe as this server's disk.
const r2Keys = {
  accountId: process.env.R2_ACCOUNT_ID || '',
  accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  bucket: process.env.R2_BUCKET || '',
};
const r2 = Object.values(r2Keys).every(Boolean) ? r2Keys : null;
if (!r2 && Object.values(r2Keys).some(Boolean)) {
  throw new Error('R2 is half configured: set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET');
}
if (!r2 && isProduction) {
  console.warn('[storage] Cloudflare R2 is not configured: uploads are kept on this server\'s disk instead');
}

// Where stored files are fetched from. Each file's address is saved with it,
// so this is fixed per upload: the server's own /media (which hands out
// short-lived R2 links) until there is a domain, then R2's public domain.
// Empty means "/media" on whatever origin the client used, for development.
const mediaBaseUrl = (process.env.MEDIA_BASE_URL || '').trim().replace(/\/+$/, '');

// Outgoing email (Resend). Without a key, emails are printed to the console
// instead, which is fine for development but means nobody receives codes.
const email = {
  resendApiKey: process.env.RESEND_API_KEY || '',
  // Must be an address on a domain verified in Resend. Their shared test sender
  // only delivers to the Resend account owner's own inbox.
  from: process.env.EMAIL_FROM || 'Splix <onboarding@resend.dev>',
};
if (!email.resendApiKey && isProduction) {
  console.warn('[email] RESEND_API_KEY is not set: verification and reset codes will NOT reach users');
}

// AI itinerary planning (OpenAI). Deliberately optional, like Google sign-in:
// without a key the API still boots and the planner answers "not configured".
const OPENAI_OFFICIAL = 'https://api.openai.com/v1';
// A value that is not a number falls back to the default. NaN compares false
// with every count, so a typo in a cap would otherwise switch that cap off.
const intEnv = (key, fallback) => {
  const value = parseInt(process.env[key], 10);
  return Number.isNaN(value) ? fallback : value;
};
const floatEnv = (key, fallback) => {
  const value = parseFloat(process.env[key]);
  return Number.isNaN(value) ? fallback : value;
};
const openai = {
  apiKey: process.env.OPENAI_API_KEY || '',
  model: process.env.OPENAI_MODEL || 'gpt-5.6-luna',
  // Tried once when OpenAI says the main model does not exist for this key.
  fallbackModel: process.env.OPENAI_FALLBACK_MODEL || 'gpt-5.4-mini',
  // Per attempt. A whole job gets this plus a minute before it is given up on.
  timeoutMs: intEnv('OPENAI_TIMEOUT_MS', 90000),
  // Tests only. Ignored in production so the key can never be sent elsewhere.
  baseUrl: isProduction ? OPENAI_OFFICIAL : process.env.OPENAI_BASE_URL || OPENAI_OFFICIAL,
  // Spend control: paid runs allowed per rolling 24 hours.
  userDailyCap: intEnv('AI_ITINERARY_USER_DAILY_CAP', 5),
  groupDailyCap: intEnv('AI_ITINERARY_GROUP_DAILY_CAP', 3),
  globalDailyCap: intEnv('AI_ITINERARY_GLOBAL_DAILY_CAP', 200),
};
if (!openai.apiKey && isProduction) {
  console.warn('[ai] OPENAI_API_KEY is not set: AI itinerary planning answers "not configured"');
}

// Hotel and attraction suggestions at a trip's destination (Geoapify Places,
// OpenStreetMap data). Optional like the planner: without a key the app shows
// no suggestions and everything else works. The provider is behind one file
// (services/places.service.js), so these names are the only Geoapify-specific
// thing outside it.
const GEOAPIFY_OFFICIAL = 'https://api.geoapify.com';
const geoapify = {
  apiKey: process.env.GEOAPIFY_API_KEY || '',
  // Per request. A suggestion load is two or three of these at most.
  timeoutMs: intEnv('GEOAPIFY_TIMEOUT_MS', 8000),
  // Tests and the local fake only. Ignored in production, like OPENAI_BASE_URL.
  baseUrl: isProduction ? GEOAPIFY_OFFICIAL : process.env.GEOAPIFY_BASE_URL || GEOAPIFY_OFFICIAL,
  // How long one destination's suggestions are kept before Geoapify is asked
  // again. Everybody heading to the same place shares one copy.
  cacheHours: intEnv('PLACES_CACHE_HOURS', 24),
  // Spend control, counted only when Geoapify is actually called (a cache miss).
  userDailyCap: intEnv('PLACES_USER_DAILY_CAP', 30),
  globalDailyCap: intEnv('PLACES_GLOBAL_DAILY_CAP', 400),
  // The name search on the Stays and Attractions tabs: every new name typed is
  // one call, so these run higher than the suggestion caps above.
  searchUserDailyCap: intEnv('PLACES_SEARCH_USER_DAILY_CAP', 150),
  searchGlobalDailyCap: intEnv('PLACES_SEARCH_GLOBAL_DAILY_CAP', 2000),
};
if (!geoapify.apiKey && isProduction) {
  console.warn('[places] GEOAPIFY_API_KEY is not set: stay and attraction suggestions are off');
}

// Face Scan in the gallery (face-service/ at the project root). The face
// service is a container next to the API that finds the faces in a photo and
// fingerprints each; the API calls it once per uploaded photo and once per
// scan. Optional like the others: with no URL, the gallery's Face Scan answers
// "not available" and no photo is ever scanned. docker-compose.yml sets the URL.
const faceScan = {
  serviceUrl: (process.env.FACE_SERVICE_URL || '').trim().replace(/\/+$/, ''),
  // Per photo. A group photo at the detector's larger size takes a second or two on a small CPU.
  timeoutMs: intEnv('FACE_SERVICE_TIMEOUT_MS', 30000),
  // Two faces are the same person at or above this similarity (0..1). Lower
  // finds more photos and more wrong ones; tune on real trip photos. OpenCV
  // suggests 0.363 for the SFace model; on clean portraits the same person
  // scores about 0.7 to 0.8 and different people under 0.3.
  matchThreshold: floatEnv('FACE_MATCH_THRESHOLD', 0.4),
  // The detector's working size: uploads (group photos with small faces) and
  // the scanned picture (one face, close up). Bigger finds smaller faces, slower.
  indexDetSize: intEnv('FACE_INDEX_DET_SIZE', 960),
  queryDetSize: intEnv('FACE_QUERY_DET_SIZE', 640),
  // The upload scanner is a loop in this process (one copy only, like the
  // reminder sweep). FACE_SCAN_WORKER=off leaves scans working but scans no
  // uploads, for a second API process or a machine pointed at a shared database.
  worker: (process.env.FACE_SCAN_WORKER || 'on') !== 'off',
};
if (!faceScan.serviceUrl && isProduction) {
  console.warn('[face-scan] FACE_SERVICE_URL is not set: the gallery\'s Face Scan is off');
}

// Admin panel > Third-Party APIs. Keys saved there are encrypted with this
// before they reach the database, so the database on its own gives nothing
// away. It is the one secret that can never be moved into the panel: stored
// next to what it protects, it would protect nothing.
//
// Optional, like the other services: without it the API runs exactly as it
// always has, on the values in this file, and the panel cannot save keys.
// Changing it later makes every key saved under the old one unreadable, and
// the services fall back to the values here until they are saved again.
const settingsKey = process.env.SETTINGS_ENCRYPTION_KEY || '';
if (settingsKey && settingsKey.length < 32) {
  throw new Error('SETTINGS_ENCRYPTION_KEY is too short: use at least 32 random characters');
}
if (!settingsKey && isProduction) {
  console.warn('[settings] SETTINGS_ENCRYPTION_KEY is not set: API keys cannot be changed from the admin panel');
}

// Reminders ring from the phones themselves. The server's part at reminder time
// (the in-app entry, a backup push, moving weekly ones on) is a timer in this
// process, so it must run in exactly one place: on by default in production,
// off everywhere else. A machine whose .env points at the live database would
// otherwise send pushes to real people. REMINDER_SWEEP=on|off overrides.
const reminderSweep = (process.env.REMINDER_SWEEP || (isProduction ? 'on' : 'off')) === 'on';

// Admin panel. The panel is a browser on a different origin to the API, and it
// authenticates with a cookie, so its origins must be listed explicitly —
// a wildcard is not allowed alongside credentials. The mobile app is
// unaffected: it sends no cookies and no Origin header.
const adminOrigins = (process.env.ADMIN_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// Proxies in front of the API whose X-Forwarded-For may be believed: 1 = Nginx
// only, 2 = Cloudflare + Nginx (docker-compose sets it). 0, the default, trusts
// none, so a bare `node src/server.js` cannot be handed a fake caller address.
const trustProxy = intEnv('TRUST_PROXY', 0);

// The address people see this server at, for the links it hands out: group
// invite links (https://<host>/join/<code>) and the public logo address. No
// trailing slash. Empty means the origin each request came in on, which is
// right as long as the app and the browser reach the API by the same name.
const publicUrl = (process.env.PUBLIC_URL || '').trim().replace(/\/+$/, '');

// Android App Links. For an invite link to open the app straight away, Android
// fetches https://<host>/.well-known/assetlinks.json and checks that the
// installed app is signed with one of the certificates listed there. The
// fingerprint of the keystore the APK is signed with goes in
// ANDROID_CERT_SHA256 (several, comma-separated, are fine):
//   keytool -list -v -keystore <keystore> | grep SHA256
// The default is the stock Android debug keystore that `expo prebuild` writes
// to mobile/android/app/debug.keystore, which every local Gradle build signs
// with today. A release or EAS keystore has a different fingerprint and must
// be set here, or the links fall back to the browser page (which still works,
// through its "Open in Splix" button).
const DEBUG_KEYSTORE_SHA256 =
  'FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C';
const android = {
  package: (process.env.ANDROID_PACKAGE || 'com.splity.app').trim(),
  certFingerprints: (process.env.ANDROID_CERT_SHA256 || DEBUG_KEYSTORE_SHA256)
    .split(',')
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean),
};
if (!process.env.ANDROID_CERT_SHA256 && isProduction) {
  console.warn('[app-links] ANDROID_CERT_SHA256 is not set: assetlinks.json lists the stock debug keystore');
}

module.exports = {
  r2,
  mediaBaseUrl,
  email,
  openai,
  geoapify,
  faceScan,
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: required('MONGODB_URI', 'mongodb://127.0.0.1:27017/splity'),
  jwtSecret: required('JWT_SECRET', 'dev-only-secret'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  adminOrigins,
  trustProxy,
  publicUrl,
  android,
  settingsKey,
  reminderSweep,
  // Admin sessions are shorter-lived than the mobile app's: a panel that can
  // delete accounts should not stay signed in for a week by default.
  adminJwtExpiresIn: process.env.ADMIN_JWT_EXPIRES_IN || '8h',
  // "Remember me" on the admin sign-in form.
  adminJwtRememberExpiresIn: process.env.ADMIN_JWT_REMEMBER_EXPIRES_IN || '30d',
  // Stream (video calling) — no dev fallback: these are real credentials.
  streamApiKey: required('STREAM_API_KEY'),
  streamApiSecret: required('STREAM_API_SECRET'),
  // Google Sign-In. Deliberately optional so a missing value never stops the
  // whole API from booting — /auth/google answers "not configured" instead.
  // The web client id is the token audience; the iOS/Android ids are accepted
  // too so a token minted for either platform's client still verifies.
  googleClientIds: [
    process.env.GOOGLE_WEB_CLIENT_ID,
    process.env.GOOGLE_IOS_CLIENT_ID,
    process.env.GOOGLE_ANDROID_CLIENT_ID,
  ].filter(Boolean),
  // The same three by name, for the admin panel to show which is which.
  google: {
    webClientId: process.env.GOOGLE_WEB_CLIENT_ID || '',
    iosClientId: process.env.GOOGLE_IOS_CLIENT_ID || '',
    androidClientId: process.env.GOOGLE_ANDROID_CLIENT_ID || '',
  },
};
