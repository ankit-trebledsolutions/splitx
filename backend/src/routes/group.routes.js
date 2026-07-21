const { Router } = require('express');
const { z } = require('zod');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const groupController = require('../controllers/group.controller');
const expenseController = require('../controllers/expense.controller');

const router = Router();
router.use(protect);

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

const createGroupSchema = {
  body: z.object({
    name: z.string().min(2, 'Group name must be at least 2 characters').max(80),
    description: z.string().max(300).optional(),
  }),
};

const joinGroupSchema = {
  body: z.object({
    inviteCode: z.string().min(4, 'Invite code is required').max(16),
  }),
};

const groupParams = { params: z.object({ groupId: objectId }) };

const createExpenseSchema = {
  params: z.object({ groupId: objectId }),
  body: z.object({
    description: z.string().min(1, 'Description is required').max(200),
    amount: z.number().positive('Amount must be greater than 0'),
    paidBy: objectId,
    splitType: z.enum(['equal', 'exact']).default('equal'),
    participants: z.array(objectId).optional(),
    splits: z.array(z.object({ user: objectId, amount: z.number().nonnegative() })).optional(),
    category: z
      .enum(['general', 'food', 'transport', 'housing', 'entertainment', 'utilities', 'other'])
      .optional(),
    date: z.coerce.date().optional(),
  }),
};

router.post('/', validate(createGroupSchema), groupController.createGroup);
router.get('/', groupController.listGroups);
router.post('/join', validate(joinGroupSchema), groupController.joinGroup);
router.get('/:groupId', validate(groupParams), groupController.getGroup);
router.post('/:groupId/leave', validate(groupParams), groupController.leaveGroup);
router.get('/:groupId/balances', validate(groupParams), groupController.getBalances);

router.post('/:groupId/expenses', validate(createExpenseSchema), expenseController.createExpense);
router.get('/:groupId/expenses', validate(groupParams), expenseController.listExpenses);

module.exports = router;
