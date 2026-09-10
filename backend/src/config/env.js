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

module.exports = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: required('MONGODB_URI', 'mongodb://127.0.0.1:27017/splity'),
  jwtSecret: required('JWT_SECRET', 'dev-only-secret'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
};
