const Group = require('../models/Group');
const Expense = require('../models/Expense');
const Task = require('../models/Task');
const ApiError = require('../utils/ApiError');
const notificationService = require('./notification.service');

const MEMBER_FIELDS = 'name email';

const createGroup = async (userId, { name, description, groupType, totalDays }) => {
  const group = await Group.create({
    name,
    description,
    groupType,
    totalDays: groupType === 'trip' ? totalDays : null,
    createdBy: userId,
    members: [userId],
  });
  return group.populate('members', MEMBER_FIELDS);
};

const listGroupsForUser = (userId) =>
  Group.find({ members: userId })
    .populate('members', MEMBER_FIELDS)
    .sort({ updatedAt: -1 });

const getGroupForMember = async (groupId, userId) => {
  const group = await Group.findById(groupId).populate('members', MEMBER_FIELDS);
  if (!group) throw ApiError.notFound('Group not found');
  const isMember = group.members.some((m) => m._id.equals(userId));
  if (!isMember) throw ApiError.forbidden('You are not a member of this group');
  return group;
};

const joinGroupByCode = async (userId, inviteCode) => {
  const group = await Group.findOne({ inviteCode: inviteCode.toUpperCase() });
  if (!group) throw ApiError.notFound('No group found for that invite code');
  if (group.members.some((m) => m.equals(userId))) {
    throw ApiError.conflict('You are already a member of this group');
  }
  group.members.push(userId);
  await group.save();
  await group.populate('members', MEMBER_FIELDS);

  const joiner = group.members.find((m) => m._id.equals(userId));
  await notificationService.notifyGroup({
    groupId: group._id,
    actorId: userId,
    type: 'member',
    title: 'Friend Joined the Group',
    body: `${joiner?.name ?? 'Someone'} has joined your "${group.name}" group.`,
  });

  return group;
};

const leaveGroup = async (groupId, userId) => {
  const group = await getGroupForMember(groupId, userId);
  const balances = await computeBalances(groupId);
  const mine = balances.find((b) => b.user._id.equals(userId));
  if (mine && Math.abs(mine.net) >= 0.01) {
    throw ApiError.badRequest('Settle your balance before leaving the group');
  }
  group.members = group.members.filter((m) => !m._id.equals(userId));
  await group.save();
  return group;
};

/**
 * Net balance per member: positive = the group owes them, negative = they owe.
 * Also returns a minimal list of settlement transfers (greedy matching).
 */
const computeBalances = async (groupId) => {
  const expenses = await Expense.find({ group: groupId })
    .populate('paidBy', MEMBER_FIELDS)
    .populate('splits.user', MEMBER_FIELDS);

  const net = new Map(); // userId -> { user, net }
  const touch = (user) => {
    const key = user._id.toString();
    if (!net.has(key)) net.set(key, { user, net: 0 });
    return net.get(key);
  };

  for (const expense of expenses) {
    touch(expense.paidBy).net += expense.amount;
    for (const split of expense.splits) {
      touch(split.user).net -= split.amount;
    }
  }

  const balances = [...net.values()].map((b) => ({ ...b, net: Math.round(b.net * 100) / 100 }));

  // Greedy settlement: repeatedly match the largest debtor with the largest creditor.
  const debtors = balances.filter((b) => b.net < -0.005).map((b) => ({ ...b }));
  const creditors = balances.filter((b) => b.net > 0.005).map((b) => ({ ...b }));
  debtors.sort((a, b) => a.net - b.net);
  creditors.sort((a, b) => b.net - a.net);

  const settlements = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(-debtors[i].net, creditors[j].net);
    settlements.push({
      from: debtors[i].user,
      to: creditors[j].user,
      amount: Math.round(amount * 100) / 100,
    });
    debtors[i].net += amount;
    creditors[j].net -= amount;
    if (debtors[i].net > -0.005) i += 1;
    if (creditors[j].net < 0.005) j += 1;
  }

  return Object.assign(balances, { settlements });
};

const getBalances = async (groupId, userId) => {
  await getGroupForMember(groupId, userId);
  const balances = await computeBalances(groupId);
  return { balances: [...balances], settlements: balances.settlements };
};

const round2 = (n) => Math.round(n * 100) / 100;

// Ignore net differences under this when deciding contribution badges.
const MONEY_EPSILON = 5;

/**
 * The contribution dashboard: money fairness (paid vs fair share) combined
 * with effort fairness (tasks done vs assigned), per member and group-wide.
 */
const getContributions = async (groupId, userId) => {
  const group = await getGroupForMember(groupId, userId);
  const [expenses, tasks] = await Promise.all([
    Expense.find({ group: groupId }),
    Task.find({ group: groupId }),
  ]);

  const totalExpenses = round2(expenses.reduce((sum, e) => sum + e.amount, 0));
  const tasksTotal = tasks.length;
  const tasksCompleted = tasks.filter((t) => t.status === 'done').length;

  // Seed one stat row per member so members with no activity still appear.
  const stats = new Map();
  for (const member of group.members) {
    stats.set(member._id.toString(), {
      user: member,
      paid: 0,
      fairShare: 0,
      tasksAssigned: 0,
      tasksDone: 0,
    });
  }

  for (const expense of expenses) {
    const payer = stats.get(expense.paidBy.toString());
    if (payer) payer.paid += expense.amount;
    for (const split of expense.splits) {
      const owner = stats.get(split.user.toString());
      if (owner) owner.fairShare += split.amount;
    }
  }

  for (const task of tasks) {
    // Unassigned tasks count toward whoever created them.
    const owners = task.assignees.length ? task.assignees : [task.createdBy];
    for (const ownerId of owners) {
      const owner = stats.get(ownerId.toString());
      if (!owner) continue;
      owner.tasksAssigned += 1;
      if (task.status === 'done') owner.tasksDone += 1;
    }
  }

  const members = [...stats.values()]
    .map((s) => {
      const net = round2(s.paid - s.fairShare);
      let badge = 'balanced';
      if (net < -MONEY_EPSILON) badge = 'owes-balance';
      else if (net > MONEY_EPSILON) badge = 'contributed-extra';
      else if (s.tasksAssigned > 0 && s.tasksDone / s.tasksAssigned < 0.5) badge = 'owes-effort';
      return {
        user: s.user,
        expensesPaid: round2(s.paid),
        fairShare: round2(s.fairShare),
        net,
        tasksAssigned: s.tasksAssigned,
        tasksDone: s.tasksDone,
        badge,
      };
    })
    .sort((a, b) => b.expensesPaid - a.expensesPaid);

  // Minimal total transfer to make everyone even (sum of what debtors owe).
  const adjustmentsNeeded = round2(
    members.reduce((sum, m) => sum + Math.max(0, -m.net), 0)
  );

  // Balance score: half money fairness, half task completion.
  const moneyScore = totalExpenses > 0 ? Math.max(0, 1 - adjustmentsNeeded / totalExpenses) : 1;
  const taskScore = tasksTotal > 0 ? tasksCompleted / tasksTotal : 1;
  const score = Math.round(((moneyScore + taskScore) / 2) * 100);

  const statusLabel = score >= 90 ? 'Fair' : score >= 70 ? 'Uneven' : 'Unbalanced';
  const headline =
    score >= 90 ? 'Almost Perfectly Balanced' : score >= 70 ? 'Slightly Uneven' : 'Time to Settle Up';

  const me = members.find((m) => m.user._id.equals(userId)) ?? null;

  return {
    totalExpenses,
    tasksCompleted,
    tasksTotal,
    score,
    statusLabel,
    headline,
    adjustmentsNeeded,
    members,
    me,
  };
};

module.exports = {
  createGroup,
  listGroupsForUser,
  getGroupForMember,
  joinGroupByCode,
  leaveGroup,
  getBalances,
  getContributions,
};
