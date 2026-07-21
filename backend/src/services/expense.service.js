const Expense = require('../models/Expense');
const ApiError = require('../utils/ApiError');
const groupService = require('./group.service');

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Builds the splits array. splitType:
 *  - "equal": amount divided across participants (remainder cents go to the first).
 *  - "exact": caller provides [{ user, amount }] summing to the total.
 */
const buildSplits = (amount, splitType, participants, exactSplits) => {
  if (splitType === 'exact') {
    if (!exactSplits?.length) throw ApiError.badRequest('Exact splits are required');
    const total = exactSplits.reduce((sum, s) => sum + s.amount, 0);
    if (Math.abs(total - amount) >= 0.01) {
      throw ApiError.badRequest('Exact splits must add up to the total amount');
    }
    return exactSplits.map((s) => ({ user: s.user, amount: round2(s.amount) }));
  }

  if (!participants?.length) throw ApiError.badRequest('Participants are required');
  const share = Math.floor((amount / participants.length) * 100) / 100;
  const splits = participants.map((user) => ({ user, amount: share }));
  splits[0].amount = round2(splits[0].amount + (amount - share * participants.length));
  return splits;
};

const createExpense = async (userId, groupId, payload) => {
  const group = await groupService.getGroupForMember(groupId, userId);
  const memberIds = new Set(group.members.map((m) => m._id.toString()));

  const { description, amount, paidBy, splitType = 'equal', participants, splits, category, date } = payload;

  if (!memberIds.has(paidBy)) throw ApiError.badRequest('Payer must be a group member');

  const builtSplits = buildSplits(amount, splitType, participants, splits);
  for (const split of builtSplits) {
    if (!memberIds.has(split.user.toString())) {
      throw ApiError.badRequest('All split participants must be group members');
    }
  }

  const expense = await Expense.create({
    group: groupId,
    description,
    amount: round2(amount),
    paidBy,
    splits: builtSplits,
    category,
    date,
    createdBy: userId,
  });

  return expense.populate([
    { path: 'paidBy', select: 'name email' },
    { path: 'splits.user', select: 'name email' },
  ]);
};

const listExpenses = async (groupId, userId) => {
  await groupService.getGroupForMember(groupId, userId);
  return Expense.find({ group: groupId })
    .populate('paidBy', 'name email')
    .populate('splits.user', 'name email')
    .sort({ date: -1, createdAt: -1 });
};

const deleteExpense = async (expenseId, userId) => {
  const expense = await Expense.findById(expenseId);
  if (!expense) throw ApiError.notFound('Expense not found');
  await groupService.getGroupForMember(expense.group, userId);
  if (!expense.createdBy.equals(userId) && !expense.paidBy.equals(userId)) {
    throw ApiError.forbidden('Only the payer or creator can delete this expense');
  }
  await expense.deleteOne();
};

module.exports = { createExpense, listExpenses, deleteExpense };
