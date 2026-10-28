const env = require('../config/env');

/**
 * Addresses the server hands out for people and phones to open: the origin
 * from PUBLIC_URL when one is set, otherwise the one the request came in on
 * (behind Nginx that is the real scheme and host, since app.js trusts the
 * proxy's forwarded headers).
 */
const publicOrigin = (req) => env.publicUrl || `${req.protocol}://${req.get('host')}`;

// A stored file's address as a full URL. Files in R2 are saved with their
// absolute address already; files in the local uploads folder are saved as
// /uploads/<name>, on this server.
const absoluteUrl = (req, url) => {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return `${publicOrigin(req)}${url.startsWith('/') ? '' : '/'}${url}`;
};

// Where group invite links point. The page there is served by this server
// (routes/join.routes.js) and the same address opens the app when it is
// installed (Android App Links; see mobile/app.json).
const inviteBaseUrl = (req) => `${publicOrigin(req)}/join`;
const inviteLinkFor = (req, code) => `${inviteBaseUrl(req)}/${encodeURIComponent(code)}`;

module.exports = { publicOrigin, absoluteUrl, inviteBaseUrl, inviteLinkFor };
