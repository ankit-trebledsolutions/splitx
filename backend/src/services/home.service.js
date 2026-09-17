const Group = require('../models/Group');
const Expense = require('../models/Expense');
const Task = require('../models/Task');

const RECENT_LIMIT = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * What is still outstanding for the user across every group they belong to.
 * Mirrors the per-group totals on the Expenses tab: only unsettled splits count.
 */
const computeBalance = async (userId, groupIds) => {
  const expenses = await Expense.find({ group: { $in: groupIds }, 'splits.settled': false })
    .select('group paidBy splits')
    .lean();

  let youOwe = 0;
  let owedToYou = 0;
  const activeGroups = new Set();

  for (const expense of expenses) {
    const iPaid = expense.paidBy.equals(userId);
    for (const split of expense.splits) {
      if (split.settled) continue;
      const mine = split.user.equals(userId);
      if (iPaid && !mine) owedToYou += split.amount;
      else if (!iPaid && mine) youOwe += split.amount;
      else continue;
      activeGroups.add(expense.group.toString());
    }
  }

  return {
    net: round2(owedToYou - youOwe),
    youOwe: round2(youOwe),
    owedToYou: round2(owedToYou),
    groupCount: activeGroups.size,
  };
};

// Trips with a start date that have not finished yet, soonest first.
const upcomingTrips = (groups, now) =>
  groups
    .filter((g) => g.groupType === 'trip' && g.startDate)
    .map((g) => {
      const start = g.startDate.getTime();
      const endDate = new Date(start + ((g.totalDays ?? 1) - 1) * DAY_MS);
      return {
        _id: g._id,
        name: g.name,
        location: g.location,
        startDate: g.startDate,
        endDate,
        memberCount: g.members.length,
        status: start > now ? 'not-started' : 'active',
      };
    })
    // Keep a trip through the end of its last day.
    .filter((t) => t.endDate.getTime() + DAY_MS > now)
    .sort((a, b) => a.startDate - b.startDate);

const recentExpenses = async (userId, groupIds) => {
  const expenses = await Expense.find({ group: { $in: groupIds } })
    .sort({ date: -1, createdAt: -1 })
    .limit(RECENT_LIMIT)
    .populate('paidBy', 'name')
    .populate('group', 'name')
    .lean();

  return expenses.map((e) => {
    const paidByMe = Boolean(e.paidBy?._id.equals(userId));
    const mySplit = e.splits.find((s) => s.user.equals(userId));
    // "Settled" means nothing is outstanding for the user on this expense.
    const settled = paidByMe
      ? e.splits.every((s) => s.settled || s.user.equals(userId))
      : !mySplit || mySplit.settled;
    const owedToYou = paidByMe
      ? round2(e.splits.reduce((sum, s) => (s.settled || s.user.equals(userId) ? sum : sum + s.amount), 0))
      : 0;
    return {
      _id: e._id,
      description: e.description,
      category: e.category,
      amount: e.amount,
      date: e.date,
      group: e.group,
      paidBy: e.paidBy,
      paidByMe,
      yourShare: mySplit?.amount ?? 0,
      owedToYou,
      settled,
    };
  });
};

const recentTasks = (groupIds) =>
  Task.find({ group: { $in: groupIds } })
    .sort({ createdAt: -1 })
    .limit(RECENT_LIMIT)
    .select('title priority dueAt status group createdAt')
    .populate('group', 'name groupType')
    .lean();

const getHome = async (userId) => {
  const groups = await Group.find({ members: userId })
    .select('name groupType totalDays startDate location members')
    .lean();
  const groupIds = groups.map((g) => g._id);

  const [balance, tasks, expenses] = await Promise.all([
    computeBalance(userId, groupIds),
    recentTasks(groupIds),
    recentExpenses(userId, groupIds),
  ]);

  return {
    balance,
    upcomingTrips: upcomingTrips(groups, Date.now()),
    tasks,
    recentExpenses: expenses,
  };
};

module.exports = { getHome };
