import client from './client';

export const sendSupportMessage = async (payload) => {
  const { data } = await client.post('/support/contact', payload);
  return data.data.ticket;
};
