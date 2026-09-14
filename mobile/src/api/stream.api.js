import client from './client';

// Exchanges our JWT for a Stream token: { apiKey, token, user: { id, name } }.
export const streamTokenRequest = async () => {
  const { data } = await client.get('/stream/token');
  return data.data;
};

// Drops a "call started" / "Call ended" system message into the group chat.
// `event` is 'started' or 'ended'.
export const postCallEvent = async (groupId, event) => {
  const { data } = await client.post('/stream/call-event', { groupId, event });
  return data.data;
};
