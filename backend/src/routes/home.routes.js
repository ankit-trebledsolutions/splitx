const { Router } = require('express');
const { protect } = require('../middleware/auth');
const homeController = require('../controllers/home.controller');

const router = Router();
router.use(protect);

router.get('/', homeController.getHome);

module.exports = router;
