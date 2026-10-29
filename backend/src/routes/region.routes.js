const { Router } = require('express');
const { z } = require('zod');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const regionController = require('../controllers/region.controller');

// The countries and states a trip can be set to (services/regions.service.js).
const router = Router();
router.use(protect);

const statesSchema = {
  params: z.object({ code: z.string().trim().length(2, 'A country code is two letters') }),
};

router.get('/countries', regionController.countries);
router.get('/countries/:code/states', validate(statesSchema), regionController.states);

module.exports = router;
