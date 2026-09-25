const asyncHandler = require('../utils/asyncHandler');
const adminService = require('../services/admin.service');
const env = require('../config/env');
const { ADMIN_COOKIE } = require('../middleware/adminAuth');
const { MODULE_LIST, ACCESS_LEVEL } = require('../config/permissions');

const HOUR = 60 * 60 * 1000;

// httpOnly so page scripts cannot read the token; scoped by path so it is only
// ever sent to the admin API and never rides along on a mobile app request.
//
// sameSite 'lax' is enough while the panel and the API share a site — different
// ports in development, sibling subdomains in production. Hosting them on
// genuinely different domains would need 'none' with secure, and a re-think of
// the CSRF header in middleware/adminAuth.js.
const cookieOptions = (rememberMe) => ({
  httpOnly: true,
  secure: env.nodeEnv === 'production',
  sameSite: 'lax',
  path: '/api/v1/admin',
  maxAge: rememberMe ? 30 * 24 * HOUR : 8 * HOUR,
});

const login = asyncHandler(async (req, res) => {
  const { user, token, rememberMe } = await adminService.login(req.body);
  res.cookie(ADMIN_COOKIE, token, cookieOptions(rememberMe));
  // The token is returned as well so non-browser callers (tests, curl) can use
  // the Bearer path. Browsers should ignore it and rely on the cookie.
  res.json({ success: true, data: { user, token } });
});

const logout = asyncHandler(async (_req, res) => {
  // Cleared with the same path and flags it was set with, or the browser keeps it.
  res.clearCookie(ADMIN_COOKIE, { ...cookieOptions(false), maxAge: undefined });
  res.json({ success: true, data: { message: 'Signed out' } });
});

const me = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { user: req.user } });
});

// Lets the panel render the permission matrix from the server's own list, so a
// module added in config/permissions.js appears without a frontend change.
const modules = asyncHandler(async (_req, res) => {
  res.json({
    success: true,
    data: { modules: MODULE_LIST, accessLevels: Object.values(ACCESS_LEVEL) },
  });
});

const listUsers = asyncHandler(async (req, res) => {
  const data = await adminService.listUsers(req.query);
  res.json({ success: true, data });
});

const getUser = asyncHandler(async (req, res) => {
  const user = await adminService.getUser(req.params.id);
  res.json({ success: true, data: { user } });
});

const createUser = asyncHandler(async (req, res) => {
  const user = await adminService.createUser(req.body, req.user);
  res.status(201).json({ success: true, data: { user } });
});

const updateUser = asyncHandler(async (req, res) => {
  const user = await adminService.updateUser(req.params.id, req.body, req.user);
  res.json({ success: true, data: { user } });
});

const setPermissions = asyncHandler(async (req, res) => {
  const user = await adminService.setPermissions(req.params.id, req.body.permissions);
  res.json({ success: true, data: { user } });
});

const setActive = asyncHandler(async (req, res) => {
  const user = await adminService.setActive(req.params.id, req.body.isActive, req.user);
  res.json({ success: true, data: { user } });
});

const deleteUser = asyncHandler(async (req, res) => {
  await adminService.deleteUser(req.params.id, req.user);
  res.json({ success: true, data: { message: 'Account deleted' } });
});

module.exports = {
  login,
  logout,
  me,
  modules,
  listUsers,
  getUser,
  createUser,
  updateUser,
  setPermissions,
  setActive,
  deleteUser,
};
