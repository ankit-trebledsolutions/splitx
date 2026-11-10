const { Router } = require('express');
const { z } = require('zod');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const controller = require('../controllers/wallet.controller');

// Read-only on purpose. Nothing the app sends can add credits: they come from
// the signup bonus, the monthly top-up and admins, all decided on the server.
const router = Router();
router.use(protect);

const pagingSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const historySchema = pagingSchema.extend({
  // Only the credits that came in, or only those that went out. Left out: both.
  direction: z.enum(['in', 'out'], { message: 'direction is "in" or "out"' }).optional(),
});

router.get('/', controller.get);
router.get('/transactions', validate({ query: historySchema }), controller.transactions);

module.exports = router;
