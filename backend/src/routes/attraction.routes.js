const { Router } = require('express');
const { z } = require('zod');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const controller = require('../controllers/attraction.controller');

const router = Router();
router.use(protect);

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const attractionParams = { params: z.object({ attractionId: objectId }) };

const updateAttractionSchema = {
  params: z.object({ attractionId: objectId }),
  body: z.object({
    name: z.string().min(1).max(120).optional(),
    category: z.string().max(60).optional(),
    rating: z.number().min(0).max(5).nullish(),
    distanceKm: z.number().min(0).max(10000).nullish(),
    emoji: z.string().max(8).optional(),
  }),
};

router.post('/:attractionId/toggle-save', validate(attractionParams), controller.toggleSave);
router.patch('/:attractionId', validate(updateAttractionSchema), controller.updateAttraction);
router.delete('/:attractionId', validate(attractionParams), controller.deleteAttraction);

module.exports = router;
