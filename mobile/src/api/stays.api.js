import client from './client';

export const fetchStays = async (groupId) => {
  const { data } = await client.get(`/groups/${groupId}/stays`);
  return data.data.stays;
};

export const createStay = async (groupId, payload) => {
  const { data } = await client.post(`/groups/${groupId}/stays`, payload);
  return data.data.stay;
};

export const updateStay = async (stayId, payload) => {
  const { data } = await client.patch(`/stays/${stayId}`, payload);
  return data.data.stay;
};

export const deleteStay = async (stayId) => {
  await client.delete(`/stays/${stayId}`);
};
