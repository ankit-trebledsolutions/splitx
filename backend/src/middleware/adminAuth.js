// Guards for the admin panel API (/api/v1/admin).
//
// Kept separate from `protect` in ./auth.js on purpose: the mobile app sends a
// Bearer token and must keep working untouched, while the admin panel is a
// browser and holds its token in an httpOnly cookie it cannot read. Mixing the
// two rules into one middleware would risk breaking the app for a feature only
// the panel needs.
//
// Role and permissions are read from the database on every request, never from
// the token. Revoking a co-admin's access therefore takes effect immediately
// instead of whenever their token happens to expire.

const jwt = require('jsonwebtoken');
const env = require('../config/env');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { ROLES, satisfies } = require('../config/permissions');

const ADMIN_COOKIE = 'splitx_admin_token';

// Minimal cookie reader. The API has no cookie-parser (the mobile app never
// sends cookies) and one named cookie does not justify a new dependency.
const readCookie = (req, name) => {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(eq + 1).trim());
    } catch {
      return null; // A malformed cookie is treated as no cookie.
    }
  }
  return null;
};

// Cookie first, Bearer second. The Bearer fallback is what lets curl and the
// test suite drive the admin API without juggling a cookie jar.
const readToken = (req) => {
  const cookie = readCookie(req, ADMIN_COOKIE);
  if (cookie) return cookie;
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
};

// Authenticates, then refuses anyone who is not staff. Mobile accounts hitting
// the admin API get 403 here, before any handler runs.
const adminProtect = asyncHandler(async (req, _res, next) => {
  const token = readToken(req);
  if (!token) throw ApiError.unauthorized('Missing admin session');

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch {
    throw ApiError.unauthorized('Invalid or expired admin session');
  }

  // Admin tokens are marked at sign-in so a mobile app token cannot be replayed
  // against the admin API, even for an account that happens to be staff.
  if (payload.scope !== 'admin') {
    throw ApiError.unauthorized('This token is not valid for the admin panel');
  }

  const user = await User.findById(payload.sub);
  if (!user) throw ApiError.unauthorized('Account no longer exists');
  // Suspended accounts lose the panel immediately, mid-session.
  if (user.isActive === false) throw ApiError.forbidden('This account is suspended');
  if (user.role !== ROLES.ADMIN && user.role !== ROLES.SUPER_ADMIN) {
    throw ApiError.forbidden('Not an admin account');
  }

  req.user = user;
  next();
});

// Module-level access check. Runs after adminProtect, which has already proven
// the caller is staff and active.
const requirePermission = (moduleKey, requiredAccess) => (req, _res, next) => {
  if (req.user.role === ROLES.SUPER_ADMIN) return next();

  const granted = req.user.permissions?.get(moduleKey);
  if (!granted || !satisfies(granted, requiredAccess)) {
    return next(ApiError.forbidden('You do not have access to this module'));
  }
  return next();
};

// For the few actions only an owner may take, such as editing another admin's
// permissions or changing roles.
const requireSuperAdmin = (req, _res, next) => {
  if (req.user.role !== ROLES.SUPER_ADMIN) {
    return next(ApiError.forbidden('Only a super admin can do this'));
  }
  return next();
};

// CSRF defence for cookie authentication.
//
// The cookie rides along automatically on any cross-site request a page can
// make, so a mutating endpoint needs proof the request came from our own
// JavaScript. A custom header is that proof: a form post or <img> cannot set
// one, and a cross-origin fetch that does set one triggers a preflight, which
// the CORS allowlist answers only for the admin origin.
//
// Requests authenticated by Bearer are exempt — a token sent deliberately in a
// header is not something a browser attaches on its own, so there is nothing to
// forge. That is also what keeps curl and the tests usable.
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const requireAdminCsrfHeader = (req, _res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();
  const usedBearer = (req.headers.authorization || '').startsWith('Bearer ');
  if (usedBearer) return next();
  if (req.headers['x-admin-request'] !== '1') {
    return next(ApiError.forbidden('Missing X-Admin-Request header'));
  }
  return next();
};

module.exports = {
  ADMIN_COOKIE,
  adminProtect,
  requirePermission,
  requireSuperAdmin,
  requireAdminCsrfHeader,
};
