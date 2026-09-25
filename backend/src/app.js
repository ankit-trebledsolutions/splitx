const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const env = require('./config/env');

const app = express();

// cross-origin-resource-policy relaxed so the mobile app can load /uploads images.
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
// The mobile app sends no Origin header and no cookies, so it keeps the open
// policy it has always had. The admin panel is a browser on another origin and
// authenticates with a cookie, which a wildcard cannot be combined with — so
// its origins are named explicitly (ADMIN_ORIGINS) and only those are granted
// credentials. An unknown browser origin still reaches public endpoints, but
// never with a session attached.
app.use(
  cors((req, callback) => {
    const origin = req.header('Origin');
    if (origin && env.adminOrigins.includes(origin)) {
      callback(null, { origin: true, credentials: true });
    } else {
      callback(null, { origin: '*', credentials: false });
    }
  })
);

// Uploaded gallery photos are served as static files.
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));
app.use(express.json({ limit: '1mb' }));
if (env.nodeEnv !== 'test') {
  app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));
}

app.use(
  '/api/v1/auth',
  rateLimit({ windowMs: 15 * 60 * 1000, limit: 50, standardHeaders: true, legacyHeaders: false })
);

app.use('/api/v1', routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
