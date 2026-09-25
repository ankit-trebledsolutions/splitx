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

// Image storage. All three values or none: with none, uploads fall back to the
// local uploads folder, which is fine for development but is wiped on every
// deploy by hosts like Render.
const cloudinaryKeys = [
  process.env.CLOUDINARY_CLOUD_NAME,
  process.env.CLOUDINARY_API_KEY,
  process.env.CLOUDINARY_API_SECRET,
];
const cloudinary = cloudinaryKeys.every(Boolean)
  ? { cloudName: cloudinaryKeys[0], apiKey: cloudinaryKeys[1], apiSecret: cloudinaryKeys[2] }
  : null;
if (!cloudinary && cloudinaryKeys.some(Boolean)) {
  throw new Error('Cloudinary is half configured: set CLOUDINARY_CLOUD_NAME, _API_KEY and _API_SECRET');
}
if (!cloudinary && isProduction) {
  console.warn('[storage] Cloudinary is not configured: uploaded photos will be lost on the next deploy');
}

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

// Admin panel. The panel is a browser on a different origin to the API, and it
// authenticates with a cookie, so its origins must be listed explicitly —
// a wildcard is not allowed alongside credentials. The mobile app is
// unaffected: it sends no cookies and no Origin header.
const adminOrigins = (process.env.ADMIN_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

module.exports = {
  cloudinary,
  email,
  openai,
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: required('MONGODB_URI', 'mongodb://127.0.0.1:27017/splity'),
  jwtSecret: required('JWT_SECRET', 'dev-only-secret'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  adminOrigins,
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
};
