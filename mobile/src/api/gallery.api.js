import client from './client';

export const fetchPhotos = async (groupId) => {
  const { data } = await client.get(`/groups/${groupId}/photos`);
  return data.data.photos;
};

export const addPhoto = async (groupId, payload) => {
  const { data } = await client.post(`/groups/${groupId}/photos`, payload);
  return data.data.photo;
};

export const deletePhoto = async (photoId) => {
  await client.delete(`/photos/${photoId}`);
};
