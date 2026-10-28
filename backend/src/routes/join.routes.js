const crypto = require('crypto');
const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const asyncHandler = require('../utils/asyncHandler');
const env = require('../config/env');
const groupService = require('../services/group.service');
const appRelease = require('../services/appRelease.service');
const branding = require('../services/branding.service');
const { absoluteUrl, inviteLinkFor } = require('../utils/publicUrl');
const { renderJoinPage } = require('../views/joinPage');

/**
 * The two addresses an invite link depends on, outside /api/v1 because they
 * are fetched by browsers and by Android itself, not by the app:
 *
 *   GET /join/<code>                   the page a link opens in a browser
 *   GET /.well-known/assetlinks.json   Android App Links: which app may open
 *                                      https://<host>/join/... directly
 *
 * The Nginx in front must pass both to the API (deploy/nginx).
 */
const router = Router();

// Codes are 8 hex characters (models/Group.js); anything else is not looked up.
const CODE = /^[a-z0-9]{4,16}$/i;

// A browser page, so per address rather than per person. Generous for a
// group link passed round a chat, tight enough that codes cannot be guessed
// at any rate that matters.
const pageLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 120, standardHeaders: true, legacyHeaders: false });

// helmet's default policy forbids inline script and images from other hosts,
// both of which this page needs (the logo may be in R2). Set per response:
// the inline script is allowed by nonce and nothing else runs.
const policyFor = (nonce) =>
  [
    "default-src 'none'",
    "img-src 'self' https: data:",
    `style-src 'nonce-${nonce}'`,
    `script-src 'nonce-${nonce}'`,
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');

router.get(
  '/join/:code',
  pageLimiter,
  asyncHandler(async (req, res) => {
    const code = String(req.params.code || '').trim();
    let invite = null;
    if (CODE.test(code)) {
      try {
        invite = await groupService.previewInvite(code, null);
      } catch (err) {
        if (err.statusCode !== 404) throw err;
      }
    }
    const [brand, release] = await Promise.all([branding.cachedBranding(), appRelease.cachedRelease()]);
    const nonce = crypto.randomBytes(16).toString('base64');
    const html = renderJoinPage({
      invite,
      code,
      appName: brand.appName,
      logoUrl: absoluteUrl(req, brand.logo?.url),
      link: inviteLinkFor(req, invite?.code ?? code),
      downloadUrl: release.android.downloadUrl,
      androidPackage: env.android.package,
      nonce,
    });
    res
      .status(invite ? 200 : 404)
      .set('Content-Security-Policy', policyFor(nonce))
      .set('Cache-Control', 'no-store')
      .type('html')
      .send(html);
  })
);

// What Android reads to verify the links. Plain JSON, no redirect, from the
// same host as the links: all three are requirements of the check.
const assetLinks = () => [
  {
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: env.android.package,
      sha256_cert_fingerprints: env.android.certFingerprints,
    },
  },
];

router.get('/.well-known/assetlinks.json', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=3600').type('application/json').send(JSON.stringify(assetLinks()));
});

module.exports = router;
module.exports.assetLinks = assetLinks;
module.exports.CODE = CODE;
