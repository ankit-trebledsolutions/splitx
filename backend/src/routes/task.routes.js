const { Router } = require('express');
const { z } = require('zod');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const controller = require('../controllers/task.controller');

const router = Router();
router.use(protect);

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const taskParams = { params: z.object({ taskId: objectId }) };

const updateTaskSchema = {
  params: z.object({ taskId: objectId }),
  body: z.object({
    title: z.string().min(1).max(200).optional(),
    notes: z.string().max(500).optional(),
    priority: z.enum(['high', 'med', 'low']).optional(),
    assignees: z.array(objectId).optional(),
    dueAt: z.coerce.date().nullish(),
    status: z.enum(['open', 'done']).optional(),
  }),
};

router.get('/:taskId', validate(taskParams), controller.getTask);
router.patch('/:taskId', validate(updateTaskSchema), controller.updateTask);
router.delete('/:taskId', validate(taskParams), controller.deleteTask);

module.exports = router;
