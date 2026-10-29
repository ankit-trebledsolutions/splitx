const { Router } = require('express');
const { z } = require('zod');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const controller = require('../controllers/direct.controller');

const router = Router();
router.use(protect);

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const conversationParams = { params: z.object({ conversationId: objectId }) };

const openConversationSchema = { body: z.object({ userId: objectId }) };

const sendMessageSchema = {
  params: z.object({ conversationId: objectId }),
  body: z.object({ text: z.string().trim().min(1, 'Message cannot be empty').max(2000) }),
};

router.post('/', validate(openConversationSchema), controller.openConversation);
router.get('/', controller.listConversations);
router.get('/:conversationId', validate(conversationParams), controller.getConversation);
router.get('/:conversationId/messages', validate(conversationParams), controller.listMessages);
router.post('/:conversationId/messages', validate(sendMessageSchema), controller.sendMessage);

module.exports = router;
