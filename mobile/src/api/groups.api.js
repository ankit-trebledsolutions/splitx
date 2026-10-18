import client from './client';

export const fetchGroups = async () => {
  const { data } = await client.get('/groups');
  return data.data.groups;
};

export const fetchGroup = async (groupId) => {
  const { data } = await client.get(`/groups/${groupId}`);
  return data.data.group;
};

export const createGroup = async (payload) => {
  const { data } = await client.post('/groups', payload);
  return data.data.group;
};

export const joinGroup = async (inviteCode) => {
  const { data } = await client.post('/groups/join', { inviteCode });
  return data.data.group;
};

// newAdminId is only needed when the admin leaves a group of three or more.
export const leaveGroup = async (groupId, newAdminId) => {
  await client.post(`/groups/${groupId}/leave`, newAdminId ? { newAdminId } : {});
};

// Admin only, and final: the group goes with its chat, expenses, tasks,
// itinerary, gallery and everything else in it, for every member.
export const deleteGroup = async (groupId) => {
  await client.delete(`/groups/${groupId}`);
};

// Admin only, trips only: the destination the suggestions and the AI planner
// plan around, for a trip created without one. Resolves to the updated group.
export const setGroupDestination = async (groupId, location) => {
  const { data } = await client.patch(`/groups/${groupId}/destination`, { location });
  return data.data.group;
};

// Admin only.
export const removeMember = async (groupId, memberId) => {
  await client.delete(`/groups/${groupId}/members/${memberId}`);
};

export const setGroupMuted = async (groupId, muted) => {
  const { data } = await client.put(`/groups/${groupId}/mute`, { muted });
  return data.data.muted;
};

export const fetchBalances = async (groupId) => {
  const { data } = await client.get(`/groups/${groupId}/balances`);
  return data.data;
};

export const fetchContributions = async (groupId) => {
  const { data } = await client.get(`/groups/${groupId}/contributions`);
  return data.data;
};

export const EXPENSE_PAGE = 50;

// One page of a group's expenses, newest first. The first page (offset 0) also
// carries `totals`, the group-wide sums the Expenses tab shows. A server from
// before paging ignores the parameters and sends the whole list, with no
// `hasMore` (nothing more to load) and no `totals` (the tab adds them up).
export const fetchExpensePage = async (groupId, { offset = 0, limit = EXPENSE_PAGE } = {}) => {
  const { data } = await client.get(`/groups/${groupId}/expenses`, { params: { limit, offset } });
  const { expenses, hasMore = false, totals = null } = data.data;
  return { expenses, hasMore, totals };
};

// Adds a later page to what is shown. An expense added meanwhile pushes the
// list down a place, so the next page can repeat one already on screen.
export const appendExpenses = (list, more) => {
  const seen = new Set(list.map((e) => e._id));
  return [...list, ...more.filter((e) => !seen.has(e._id))];
};

export const createExpense = async (groupId, payload) => {
  const { data } = await client.post(`/groups/${groupId}/expenses`, payload);
  return data.data.expense;
};

export const fetchExpense = async (expenseId) => {
  const { data } = await client.get(`/expenses/${expenseId}`);
  return data.data.expense;
};

// Omit userId to settle your own share.
export const settleExpense = async (expenseId, userId) => {
  const { data } = await client.post(`/expenses/${expenseId}/settle`, userId ? { userId } : {});
  return data.data.expense;
};

export const deleteExpense = async (expenseId) => {
  await client.delete(`/expenses/${expenseId}`);
};
