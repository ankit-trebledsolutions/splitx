const { Router } = require('express');
const { z } = require('zod');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const controller = require('../controllers/stream.controller');

const router = Router();
router.use(protect);

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const callEventSchema = {
  body: z.object({
    groupId: objectId,
    event: z.enum(['started', 'ended']),
  }),
};

router.get('/token', controller.getToken);
router.post('/call-event', validate(callEventSchema), controller.callEvent);

module.exports = router;
