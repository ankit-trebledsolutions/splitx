import client from './client';

// Finds (or, on first contact, creates) the one-to-one chat with this person.
export const openConversation = async (userId) => {
  const { data } = await client.post('/conversations', { userId });
  return data.data.conversation;
};

export const fetchConversation = async (conversationId) => {
  const { data } = await client.get(`/conversations/${conversationId}`);
  return data.data.conversation;
};

// params: { limit, before, after } — same paging contract as group chat.
export const fetchDirectMessages = async (conversationId, params = {}) => {
  const { data } = await client.get(`/conversations/${conversationId}/messages`, { params });
  return data.data.messages;
};

export const sendDirectMessage = async (conversationId, text) => {
  const { data } = await client.post(`/conversations/${conversationId}/messages`, { text });
  return data.data.message;
};
