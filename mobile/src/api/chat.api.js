import client from './client';

export const fetchMessages = async (groupId, params = {}) => {
  const { data } = await client.get(`/groups/${groupId}/messages`, { params });
  return data.data.messages;
};

export const sendMessage = async (groupId, text) => {
  const { data } = await client.post(`/groups/${groupId}/messages`, { text });
  return data.data.message;
};
