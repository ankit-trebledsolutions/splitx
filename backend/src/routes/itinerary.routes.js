const { Router } = require('express');
const { z } = require('zod');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const controller = require('../controllers/itinerary.controller');

const router = Router();
router.use(protect);

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const dayParams = { params: z.object({ dayId: objectId }) };

const activitySchema = z.object({
  time: z.string().max(20).optional(),
  endTime: z.string().max(20).optional(),
  title: z.string().min(1, 'Activity title is required').max(200),
  location: z.string().max(200).optional(),
  icon: z.string().max(40).optional(),
  note: z.string().max(300).optional(),
});

const updateDaySchema = {
  params: z.object({ dayId: objectId }),
  body: z.object({
    title: z.string().min(1).max(120).optional(),
    date: z.coerce.date().nullish(),
    activities: z.array(activitySchema).optional(),
  }),
};

const addActivitySchema = {
  params: z.object({ dayId: objectId }),
  body: activitySchema,
};

const activityParams = {
  params: z.object({ dayId: objectId, activityId: objectId }),
};

router.patch('/:dayId', validate(updateDaySchema), controller.updateDay);
router.delete('/:dayId', validate(dayParams), controller.deleteDay);
router.post('/:dayId/activities', validate(addActivitySchema), controller.addActivity);
router.delete('/:dayId/activities/:activityId', validate(activityParams), controller.removeActivity);

module.exports = router;
