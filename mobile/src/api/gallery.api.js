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
 * Face Scan: the faces in a picture (a selfie, or a photo picked from the
 * phone) and, for each, this group's photos showing the same person, best
 * first. `file` is { uri, name, type } from expo-image-picker; the picture is
 * not kept by the server. Resolves to
 *   { width, height, faces: [{ box, matches: [{ photo, similarity }] }], pending, threshold }
 * where `box` is x1, y1, x2, y2 as fractions of the picture and `pending` is
 * how many of the group's photos the server has not scanned yet.
 * Fails with code FACE_NOT_FOUND (nobody in the picture), FACE_SCAN_UNREADABLE,
 * FACE_SCAN_UNAVAILABLE (the service is off or down) or FACE_SCAN_RATE_LIMITED.
 */
export const scanFaces = async (groupId, file) => {
  const form = new FormData();
  form.append('photo', file);
  const { data } = await client.post(`/groups/${groupId}/face-scan`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    // The upload, then a detector pass and a fingerprint per face on the server.
    timeout: 90000,
  });
  return data.data;
};

// { enabled, pending }: whether Face Scan is on, and how many of the group's
// photos still wait to be scanned.
export const fetchFaceScanStatus = async (groupId) => {
  const { data } = await client.get(`/groups/${groupId}/face-scan`);
  return data.data;
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
