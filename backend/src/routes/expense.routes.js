const { Router } = require('express');
const { z } = require('zod');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const controller = require('../controllers/expense.controller');

const router = Router();
router.use(protect);

const expenseParams = {
  params: z.object({ expenseId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id') }),
};

router.delete('/:expenseId', validate(expenseParams), controller.deleteExpense);

module.exports = router;
