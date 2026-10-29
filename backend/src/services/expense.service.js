const mongoose = require('mongoose');
const Expense = require('../models/Expense');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const groupService = require('./group.service');
const messageService = require('./message.service');
const notificationService = require('./notification.service');

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

  await notificationService.notifyGroup({
    groupId,
    actorId: userId,
    type: 'expense',
    title: 'Expense Added',
    body: `An expense of $${expense.amount.toFixed(2)} for ${expense.description} was added by ${expense.paidBy.name}.`,
    amount: -expense.amount,
    entityId: expense._id,
  });

  return expense;
};

const getExpenseForMember = async (expenseId, userId) => {
  const expense = await Expense.findById(expenseId)
    .populate('paidBy', 'name email')
    .populate('createdBy', 'name email')
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

// What the list shows of each person, and the same JSON (User#toJSON) that
// populating them gave.
const PERSON_FIELDS = 'name email';
const NEWEST_FIRST = { date: -1, createdAt: -1, _id: -1 };

// Each person's JSON made once and shared by every expense and share they are
// in. Someone whose account is gone comes out as null, as populate gave.
const peopleById = async (ids) => {
  const unique = [...new Set(ids.filter(Boolean).map(String))];
  const people = await User.find({ _id: { $in: unique } }).select(PERSON_FIELDS);
  return new Map(people.map((p) => [String(p._id), p.toJSON()]));
};

// A plain (lean) document skips the schema's defaults. These are the ones an
// older expense can be missing, so the app keeps getting every field.
const withPeople = (expense, people) => {
  const person = (id) => (id ? people.get(String(id)) ?? null : null);
  return {
    ...expense,
    category: expense.category ?? 'general',
    date: expense.date ?? new Date(),
    paidBy: person(expense.paidBy),
    splits: (expense.splits ?? []).map((s) => ({
      ...s,
      settled: s.settled ?? false,
      settledAt: s.settledAt ?? null,
      user: person(s.user),
    })),
  };
};

/**
 * The Expenses tab's three tiles for one member, over the whole group: the
 * sums the app used to add up itself from the full list (the rule is
 * group.service's outstandingShares), done by the database so a list read a
 * page at a time can still show them.
 */
const expenseTotals = async (groupId, userId) => {
  const me = new mongoose.Types.ObjectId(String(userId));
  const [result] = await Expense.aggregate([
    { $match: { group: new mongoose.Types.ObjectId(String(groupId)) } },
    {
      $facet: {
        spent: [{ $group: { _id: null, sum: { $sum: '$amount' }, count: { $sum: 1 } } }],
        open: [
          { $unwind: '$splits' },
          { $match: { 'splits.settled': { $ne: true } } },
          {
            $group: {
              _id: null,
              youOwe: {
                $sum: { $cond: [{ $and: [{ $ne: ['$paidBy', me] }, { $eq: ['$splits.user', me] }] }, '$splits.amount', 0] },
              },
              owedYou: {
                $sum: { $cond: [{ $and: [{ $eq: ['$paidBy', me] }, { $ne: ['$splits.user', me] }] }, '$splits.amount', 0] },
              },
            },
          },
        ],
      },
    },
  ]);
  const spent = result.spent[0] ?? { sum: 0, count: 0 };
  const open = result.open[0] ?? { youOwe: 0, owedYou: 0 };
  return {
    count: spent.count,
    spent: round2(spent.sum),
    youOwe: round2(open.youOwe),
    owedYou: round2(open.owedYou),
  };
};

/**
 * A group's expenses, newest first, with the payer's and every share's name
 * and email.
 *
 * Without `limit` it is the whole list: what app versions from before paging
 * ask for. With `limit` it is one page from `offset`, plus `hasMore`; the
 * first page (offset 0) also carries the group-wide `totals` the Expenses tab
 * shows, which later pages do not repeat.
 *
 * Plain documents and one lookup per person, not Mongoose documents and a
 * populate per expense and share: a 50-member group with 3,000 expenses took
 * seconds of the server's single thread that way, and every other request
 * waited meanwhile.
 */
const listExpenses = async (groupId, userId, { limit, offset = 0 } = {}) => {
  await groupService.getGroupForMember(groupId, userId);

  const query = Expense.find({ group: groupId }).sort(NEWEST_FIRST).lean();
  if (limit) query.skip(offset).limit(limit + 1);
  const withTotals = Boolean(limit) && offset === 0;
  const [found, totals] = await Promise.all([query, withTotals ? expenseTotals(groupId, userId) : null]);
  const page = limit ? found.slice(0, limit) : found;

  const people = await peopleById(page.flatMap((e) => [e.paidBy, ...(e.splits ?? []).map((s) => s.user)]));
  const expenses = page.map((e) => withPeople(e, people));
  if (!limit) return { expenses };
  return withTotals ? { expenses, hasMore: found.length > limit, totals } : { expenses, hasMore: found.length > limit };
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
