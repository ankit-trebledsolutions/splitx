const asyncHandler = require('../utils/asyncHandler');
const branding = require('../services/branding.service');
const { absoluteUrl, inviteBaseUrl } = require('../utils/publicUrl');

// What a phone or a browser is told: the name, the logo as a full address
// (null for the built-in mark) and where invite links point.
const view = (req, settings) => ({
  appName: settings.appName,
  logoUrl: absoluteUrl(req, settings.logo?.url),
  updatedAt: settings.updatedAt,
});

// Public. Read when the app opens (mobile/src/branding) and by the admin
// panel's sign-in page, which has no session yet.
const getPublic = asyncHandler(async (req, res) => {
  const settings = await branding.cachedBranding();
  res.json({
    success: true,
    data: { branding: { ...view(req, settings), inviteBaseUrl: inviteBaseUrl(req) } },
  });
});

// Admin panel, owners only.
const getSettings = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { settings: view(req, await branding.getBranding()) } });
});

const updateSettings = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { settings: view(req, await branding.updateName(req.body, req.user)) } });
});

const uploadLogo = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { settings: view(req, await branding.setLogo(req.file, req.user)) } });
});

const removeLogo = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { settings: view(req, await branding.removeLogo(req.user)) } });
});

module.exports = { getPublic, getSettings, updateSettings, uploadLogo, removeLogo };
