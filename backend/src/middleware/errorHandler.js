const env = require('../config/env');

const notFound = (req, res) => {
  res.status(404).json({ success: false, message: `Route not found: ${req.originalUrl}` });
};

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, _req, res, _next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error';

  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = Object.values(err.errors).map((e) => e.message).join(', ');
  } else if (err.name === 'CastError') {
    statusCode = 400;
    message = `Invalid ${err.path}: ${err.value}`;
  } else if (err.name === 'MulterError') {
    // Upload problems are the sender's to fix, not a server fault.
    statusCode = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    message = err.code === 'LIMIT_FILE_SIZE' ? 'That file is too large (max 10MB)' : err.message;
  } else if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    message = `Duplicate value for ${field}`;
  }

  if (statusCode === 500) {
    console.error(err);
    if (env.nodeEnv === 'production') message = 'Internal server error';
  }

  // err.code is also set by Mongo/Multer errors (numbers, LIMIT_*); only pass on
  // the app's own string codes from ApiError.
  const extra = err.isOperational && typeof err.code === 'string' ? { code: err.code, ...err.data } : {};
  res.status(statusCode).json({ success: false, message, ...extra });
};

module.exports = { notFound, errorHandler };
