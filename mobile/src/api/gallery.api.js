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

// Multi-select delete. Resolves to the ids that were really removed: the
// server only deletes the caller's own uploads and skips the rest.
export const deletePhotos = async (photoIds) => {
  const { data } = await client.post('/photos/bulk-delete', { photoIds });
  return data.data.deletedIds;
};

/**
 * Multipart upload of a picked image. `file` is { uri, name, type } from
 * expo-image-picker; onProgress receives 0..1.
 */
export const uploadPhotoFile = async (groupId, file, caption, onProgress) => {
  const form = new FormData();
  form.append('photo', file);
  if (caption) form.append('caption', caption);

  const { data } = await client.post(`/groups/${groupId}/photos/upload`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000,
    onUploadProgress: (event) => {
      if (event.total) onProgress?.(event.loaded / event.total);
    },
  });
  return data.data.photo;
};
