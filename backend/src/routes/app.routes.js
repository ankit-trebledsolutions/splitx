const { Router } = require('express');
const controller = require('../controllers/appRelease.controller');

const router = Router();

// No auth, and mounted ahead of the force-update gate (see routes/index.js):
// a build that is too old to use the API must still be able to ask where the
// new one is.
router.get('/release', controller.getRelease);

module.exports = router;
