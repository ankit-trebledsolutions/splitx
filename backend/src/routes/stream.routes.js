const { Router } = require('express');
const { protect } = require('../middleware/auth');
const controller = require('../controllers/stream.controller');

const router = Router();
router.use(protect);

router.get('/token', controller.getToken);

module.exports = router;
