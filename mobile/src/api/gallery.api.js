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

// Files picked together share a batch key, so the chat shows them as one card;
// `batchCount` is how many there are, for the wording of the notification.
const appendBatch = (form, { batch, batchCount } = {}) => {
  if (batch) form.append('batch', batch);
  if (batchCount) form.append('batchCount', String(batchCount));
};

/**
 * Multipart upload of a picked image. `file` is { uri, name, type } from
 * expo-image-picker; onProgress receives 0..1; `batch` is { batch, batchCount }.
 */
export const uploadPhotoFile = async (groupId, file, caption, onProgress, batch) => {
  const form = new FormData();
  form.append('photo', file);
  if (caption) form.append('caption', caption);
  appendBatch(form, batch);

  const { data } = await client.post(`/groups/${groupId}/photos/upload`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000,
    onUploadProgress: (event) => {
      if (event.total) onProgress?.(event.loaded / event.total);
    },
  });
  return data.data.photo;
};

/**
 * Multipart upload of a picked video for the gallery. `file` is { uri, name,
 * type }; `poster` is the local JPEG of one of its frames, or null; `batch` is
 * { batch, batchCount } as for photos.
 */
export const uploadVideoFile = async (groupId, file, { poster, durationMs, batch } = {}, onProgress) => {
  const form = new FormData();
  form.append('video', file);
  if (poster) form.append('poster', { uri: poster, name: 'poster.jpg', type: 'image/jpeg' });
  if (durationMs) form.append('durationMs', String(Math.round(durationMs)));
  appendBatch(form, batch);

  const { data } = await client.post(`/groups/${groupId}/videos/upload`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    // Up to 90 MB on a phone's upload speed.
    timeout: 15 * 60 * 1000,
    onUploadProgress: (event) => {
      if (event.total) onProgress?.(event.loaded / event.total);
    },
  });
  return data.data.photo;
};
