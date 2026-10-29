const { Router } = require('express');
const { protect } = require('../middleware/auth');
const controller = require('../controllers/trip.controller');

const router = Router();
router.use(protect);

router.get('/', controller.listTrips);

module.exports = router;
