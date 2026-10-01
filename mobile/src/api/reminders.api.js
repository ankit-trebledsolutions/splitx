import client from './client';

export const fetchReminders = async (groupId) => {
  const { data } = await client.get(`/groups/${groupId}/reminders`);
  return data.data.reminders;
};

// Everything that can ring for me: every group's shared reminders plus my own.
export const fetchMyReminders = async () => {
  const { data } = await client.get('/reminders');
  return data.data.reminders;
};

// groupId null makes a personal reminder, one that belongs to no group.
export const createReminder = async (groupId, payload) => {
  const { data } = await client.post(groupId ? `/groups/${groupId}/reminders` : '/reminders', payload);
  return data.data.reminder;
};

export const updateReminder = async (reminderId, payload) => {
  const { data } = await client.patch(`/reminders/${reminderId}`, payload);
  return data.data.reminder;
};

export const deleteReminder = async (reminderId) => {
  await client.delete(`/reminders/${reminderId}`);
};

// Tells the server which alarms this phone has set, so it only sends its
// backup push to people whose phone has not.
export const markRemindersArmed = async (ids) => {
  await client.post('/reminders/armed', { ids });
};
