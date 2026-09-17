const { Router } = require('express');
const { z } = require('zod');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const controller = require('../controllers/notification.controller');
const { isExpoToken } = require('../services/push.service');

const router = Router();
router.use(protect);

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const notificationParams = { params: z.object({ notificationId: objectId }) };

const pushTokenSchema = {
  body: z.object({ token: z.string().max(200).refine(isExpoToken, 'Invalid Expo push token') }),
};

router.post('/push-token', validate(pushTokenSchema), controller.registerPushToken);
router.delete('/push-token', validate(pushTokenSchema), controller.removePushToken);

router.get('/', controller.listNotifications);
router.patch('/read-all', controller.markAllRead);
router.patch('/:notificationId/read', validate(notificationParams), controller.markRead);
router.delete('/:notificationId', validate(notificationParams), controller.deleteNotification);
router.delete('/', controller.clearAll);

module.exports = router;
