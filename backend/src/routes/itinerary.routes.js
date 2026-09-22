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
    // Sending back an activity's _id keeps that id across the save; without it
    // the activity counts as new. Ids that are not this day's are ignored.
    activities: z.array(activitySchema.extend({ _id: objectId.optional() })).optional(),
  }),
};

const addActivitySchema = {
  params: z.object({ dayId: objectId }),
  body: activitySchema,
};

const activityParams = {
  params: z.object({ dayId: objectId, activityId: objectId }),
};

// Any subset of an activity's fields. An empty string clears a field (title
// excepted). targetDayId moves the activity to another day of the same group.
const updateActivitySchema = {
  params: z.object({ dayId: objectId, activityId: objectId }),
  body: z
    .object({
      time: z.string().max(20).optional(),
      endTime: z.string().max(20).optional(),
      title: z.string().min(1, 'Activity title is required').max(200).optional(),
      location: z.string().max(200).optional(),
      icon: z.string().max(40).optional(),
      note: z.string().max(300).optional(),
      targetDayId: objectId.optional(),
    })
    .refine((body) => Object.keys(body).length > 0, 'Nothing to update'),
};

router.patch('/:dayId', validate(updateDaySchema), controller.updateDay);
router.delete('/:dayId', validate(dayParams), controller.deleteDay);
router.post('/:dayId/activities', validate(addActivitySchema), controller.addActivity);
router.patch('/:dayId/activities/:activityId', validate(updateActivitySchema), controller.updateActivity);
router.delete('/:dayId/activities/:activityId', validate(activityParams), controller.removeActivity);

module.exports = router;
