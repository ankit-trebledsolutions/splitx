const { Router } = require('express');
const { z } = require('zod');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const controller = require('../controllers/reminder.controller');

const router = Router();
router.use(protect);

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const reminderParams = { params: z.object({ reminderId: objectId }) };

const updateReminderSchema = {
  params: z.object({ reminderId: objectId }),
  body: z.object({
    title: z.string().min(1).max(200).optional(),
    subtitle: z.string().max(200).optional(),
    remindAt: z.coerce.date().optional(),
    scope: z.enum(['group', 'me']).optional(),
    icon: z.string().max(40).optional(),
    enabled: z.boolean().optional(),
  }),
};

router.patch('/:reminderId', validate(updateReminderSchema), controller.updateReminder);
router.delete('/:reminderId', validate(reminderParams), controller.deleteReminder);

module.exports = router;
