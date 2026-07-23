import client from './client';

export const fetchReminders = async (groupId) => {
  const { data } = await client.get(`/groups/${groupId}/reminders`);
  return data.data.reminders;
};

export const createReminder = async (groupId, payload) => {
  const { data } = await client.post(`/groups/${groupId}/reminders`, payload);
  return data.data.reminder;
};

export const updateReminder = async (reminderId, payload) => {
  const { data } = await client.patch(`/reminders/${reminderId}`, payload);
  return data.data.reminder;
};

export const deleteReminder = async (reminderId) => {
  await client.delete(`/reminders/${reminderId}`);
};
