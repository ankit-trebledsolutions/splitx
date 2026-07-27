const Group = require('../models/Group');
const Expense = require('../models/Expense');
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

module.exports = {
  createGroup,
  listGroupsForUser,
  getGroupForMember,
  joinGroupByCode,
  leaveGroup,
  getBalances,
};
