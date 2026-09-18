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

module.exports = {
  cloudinary,
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: required('MONGODB_URI', 'mongodb://127.0.0.1:27017/splity'),
  jwtSecret: required('JWT_SECRET', 'dev-only-secret'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
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
