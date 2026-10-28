const { Router } = require('express');
const controller = require('../controllers/appRelease.controller');
const branding = require('../controllers/branding.controller');

const router = Router();

// No auth, and mounted ahead of the force-update gate (see routes/index.js):
// a build that is too old to use the API must still be able to ask where the
// new one is.
router.get('/release', controller.getRelease);
// The app's name and logo, and where invite links point. No auth: the app
// shows them on the splash and sign-in screens, before anyone is signed in.
router.get('/branding', branding.getPublic);

module.exports = router;
