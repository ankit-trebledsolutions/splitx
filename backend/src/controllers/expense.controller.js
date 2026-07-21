const asyncHandler = require('../utils/asyncHandler');
const expenseService = require('../services/expense.service');

const createExpense = asyncHandler(async (req, res) => {
  const expense = await expenseService.createExpense(req.user._id, req.params.groupId, req.body);
  res.status(201).json({ success: true, data: { expense } });
});

const listExpenses = asyncHandler(async (req, res) => {
  const expenses = await expenseService.listExpenses(req.params.groupId, req.user._id);
  res.json({ success: true, data: { expenses } });
});

const deleteExpense = asyncHandler(async (req, res) => {
  await expenseService.deleteExpense(req.params.expenseId, req.user._id);
  res.json({ success: true, message: 'Expense deleted' });
});

module.exports = { createExpense, listExpenses, deleteExpense };
