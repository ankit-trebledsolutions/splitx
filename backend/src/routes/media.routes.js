const { Router } = require('express');
const asyncHandler = require('../utils/asyncHandler');
const storage = require('../storage');

/**
 * GET /media/<key> — the address every stored file is saved under.
 *
 * The bucket is private, so this answers with a redirect to a link signed for
 * an hour. The app's image, audio and download code all follow redirects, and
 * the file itself comes straight from Cloudflare rather than through this
 * server. No sign-in: a key carries 96 random bits and cannot be guessed.
 */
const router = Router();

const MAX_KEY_LENGTH = 500;

router.get(
  '/*',
  asyncHandler(async (req, res) => {
    const key = req.params[0];
    const link = key && key.length <= MAX_KEY_LENGTH ? await storage.linkTo(key) : null;
    if (!link) {
      res.status(404).json({ success: false, message: 'File not found' });
      return;
    }
    // Shorter than the link's own lifetime, so a cached redirect never points
    // at a link that has run out.
    res.set('Cache-Control', 'private, max-age=600');
    res.redirect(302, link);
  })
);

module.exports = router;
