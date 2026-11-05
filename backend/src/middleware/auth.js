const jwt = require('jsonwebtoken');
const env = require('../config/env');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { isAppSession, issuedBeforeReset } = require('../utils/sessionToken');

const protect = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw ApiError.unauthorized('Missing access token');

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch {
    throw ApiError.unauthorized('Invalid or expired token');
  }
  // A password-reset or admin-panel token is signed with the same secret but
  // is not an app session (utils/sessionToken.js).
  if (!isAppSession(payload)) throw ApiError.unauthorized('Invalid or expired token');

  const user = await User.findById(payload.sub);
  if (!user) throw ApiError.unauthorized('User no longer exists');
  // Signed in before the password last changed: that device is signed out.
  if (issuedBeforeReset(payload, user)) throw ApiError.unauthorized('Your session has ended. Please sign in again.');
  // Blocking takes effect on the very next request rather than whenever the
  // token happens to expire, so an administrator can cut someone off straight
  // away. The app watches for this code and signs the person out.
  if (user.isActive === false) {
    throw new ApiError(403, 'Your account has been blocked by an administrator.', {
      code: 'ACCOUNT_SUSPENDED',
    });
  }

  req.user = user;
  next();
});

module.exports = { protect };
