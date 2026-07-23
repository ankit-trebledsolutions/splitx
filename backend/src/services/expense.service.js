const Expense = require('../models/Expense');
const ApiError = require('../utils/ApiError');
const groupService = require('./group.service');
const messageService = require('./message.service');

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

  await expense.populate([
    { path: 'paidBy', select: 'name email' },
    { path: 'splits.user', select: 'name email' },
  ]);

  // Surface the new expense as a card in the group chat.
  await messageService.postActivity({
    groupId,
    senderId: userId,
    type: 'expense',
    text: expense.description,
    expense: expense._id,
  });

  return expense;
};

const getExpenseForMember = async (expenseId, userId) => {
  const expense = await Expense.findById(expenseId)
    .populate('paidBy', 'name email')
    .populate('splits.user', 'name email')
    .populate('group', 'name groupType');
  if (!expense) throw ApiError.notFound('Expense not found');
  await groupService.getGroupForMember(expense.group._id, userId);
  return expense;
};

/**
 * Marks one participant's share as settled. Anyone in the group may settle
 * their own share; the payer may settle anyone's.
 */
const settleSplit = async (expenseId, userId, targetUserId) => {
  const expense = await Expense.findById(expenseId);
  if (!expense) throw ApiError.notFound('Expense not found');
  await groupService.getGroupForMember(expense.group, userId);

  const target = targetUserId ?? userId.toString();
  if (target !== userId.toString() && !expense.paidBy.equals(userId)) {
    throw ApiError.forbidden('Only the payer can settle someone else’s share');
  }

  const split = expense.splits.find((s) => s.user.equals(target));
  if (!split) throw ApiError.badRequest('That member has no share in this expense');
  if (split.settled) throw ApiError.conflict('That share is already settled');

  split.settled = true;
  split.settledAt = new Date();
  await expense.save();

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
  await messageService.deleteForEntity('expense', expense._id);
  await expense.deleteOne();
};

module.exports = {
  createExpense,
  listExpenses,
  getExpenseForMember,
  settleSplit,
  deleteExpense,
};
