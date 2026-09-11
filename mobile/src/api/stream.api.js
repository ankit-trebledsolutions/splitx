import client from './client';

// Exchanges our JWT for a Stream token: { apiKey, token, user: { id, name } }.
export const streamTokenRequest = async () => {
  const { data } = await client.get('/stream/token');
  return data.data;
};
