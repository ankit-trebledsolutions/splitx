const { Router } = require('express');
const { z } = require('zod');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const controller = require('../controllers/expense.controller');

const router = Router();
router.use(protect);

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const expenseParams = { params: z.object({ expenseId: objectId }) };

const settleSchema = {
  params: z.object({ expenseId: objectId }),
  // Omit userId to settle your own share.
  body: z.object({ userId: objectId.optional() }),
};

router.get('/:expenseId', validate(expenseParams), controller.getExpense);
router.post('/:expenseId/settle', validate(settleSchema), controller.settleExpense);
router.delete('/:expenseId', validate(expenseParams), controller.deleteExpense);

module.exports = router;
