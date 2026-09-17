import client from './client';

export const registerPushToken = async (token) => {
  await client.post('/notifications/push-token', { token });
};

export const removePushToken = async (token) => {
  await client.delete('/notifications/push-token', { data: { token } });
};

export const fetchNotifications = async () => {
  const { data } = await client.get('/notifications');
  return data.data.notifications;
};

export const markNotificationRead = async (notificationId) => {
  const { data } = await client.patch(`/notifications/${notificationId}/read`);
  return data.data.notification;
};

export const markAllNotificationsRead = async () => {
  await client.patch('/notifications/read-all');
};

export const clearNotification = async (notificationId) => {
  await client.delete(`/notifications/${notificationId}`);
};

export const clearAllNotifications = async () => {
  await client.delete('/notifications');
};
