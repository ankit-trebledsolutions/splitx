import client from './client';

export const fetchAttractions = async (groupId) => {
  const { data } = await client.get(`/groups/${groupId}/attractions`);
  return data.data.attractions;
};

export const createAttraction = async (groupId, payload) => {
  const { data } = await client.post(`/groups/${groupId}/attractions`, payload);
  return data.data.attraction;
};

export const toggleSaveAttraction = async (attractionId) => {
  const { data } = await client.post(`/attractions/${attractionId}/toggle-save`);
  return data.data.attraction;
};

export const deleteAttraction = async (attractionId) => {
  await client.delete(`/attractions/${attractionId}`);
};
