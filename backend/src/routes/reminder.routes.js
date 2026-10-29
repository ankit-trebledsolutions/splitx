const { Router } = require('express');
const { z } = require('zod');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const controller = require('../controllers/reminder.controller');

const router = Router();
router.use(protect);

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const reminderParams = { params: z.object({ reminderId: objectId }) };

// A personal reminder: no group, so no scope and no task to attach it to.
const createPersonalSchema = {
  body: z.object({
    title: z.string().min(1, 'Reminder title is required').max(200),
    subtitle: z.string().max(200).optional(),
    remindAt: z.coerce.date(),
    repeatWeekly: z.boolean().optional(),
    icon: z.string().max(40).optional(),
  }),
};

const updateReminderSchema = {
  params: z.object({ reminderId: objectId }),
  body: z.object({
    title: z.string().min(1).max(200).optional(),
    subtitle: z.string().max(200).optional(),
    remindAt: z.coerce.date().optional(),
    scope: z.enum(['group', 'me']).optional(),
    repeatWeekly: z.boolean().optional(),
    icon: z.string().max(40).optional(),
    enabled: z.boolean().optional(),
    // The asker's own switch: off on their phone, still on for everyone else.
    muted: z.boolean().optional(),
  }),
};

// A phone reporting the alarms it has set. One sync never holds more than this.
const armedSchema = { body: z.object({ ids: z.array(objectId).max(500) }) };

router.get('/', controller.listMine);
router.post('/', validate(createPersonalSchema), controller.createReminder);
router.post('/armed', validate(armedSchema), controller.markArmed);

router.patch('/:reminderId', validate(updateReminderSchema), controller.updateReminder);
router.delete('/:reminderId', validate(reminderParams), controller.deleteReminder);

module.exports = router;
