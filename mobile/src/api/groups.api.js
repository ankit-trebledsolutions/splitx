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

export const fetchBalances = async (groupId) => {
  const { data } = await client.get(`/groups/${groupId}/balances`);
  return data.data;
};

export const fetchExpenses = async (groupId) => {
  const { data } = await client.get(`/groups/${groupId}/expenses`);
  return data.data.expenses;
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
