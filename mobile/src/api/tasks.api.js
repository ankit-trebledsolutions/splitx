import client from './client';

export const fetchTasks = async (groupId) => {
  const { data } = await client.get(`/groups/${groupId}/tasks`);
  return data.data.tasks;
};

export const createTask = async (groupId, payload) => {
  const { data } = await client.post(`/groups/${groupId}/tasks`, payload);
  return data.data.task;
};

export const updateTask = async (taskId, payload) => {
  const { data } = await client.patch(`/tasks/${taskId}`, payload);
  return data.data.task;
};

export const deleteTask = async (taskId) => {
  await client.delete(`/tasks/${taskId}`);
};
