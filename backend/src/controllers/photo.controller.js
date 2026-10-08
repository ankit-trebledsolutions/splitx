const fs = require('fs');
const asyncHandler = require('../utils/asyncHandler');
const photoService = require('../services/photo.service');
const groupService = require('../services/group.service');
const storage = require('../storage');
const { MAX_POSTER_BYTES } = require('../middleware/upload');

// Longest clip the duration field will record.
const MAX_DURATION_MS = 24 * 60 * 60 * 1000;
// Most files one upload screen sends in one go (the pickers allow far fewer).
const MAX_BATCH_COUNT = 50;

// Multipart bodies skip the zod schemas, so their extra fields are checked here.
const batchOf = (body) => {
  const batch = typeof body.batch === 'string' ? body.batch.trim() : '';
  return /^[\w-]{1,64}$/.test(batch) ? batch : undefined;
};
const batchCountOf = (body) =>
  Math.min(Math.max(Math.round(Number(body.batchCount)) || 1, 1), MAX_BATCH_COUNT);
const durationOf = (body) =>
  Math.min(Math.max(Math.round(Number(body.durationMs)) || 0, 0), MAX_DURATION_MS);
const captionOf = (body) => String(body.caption ?? '').trim().slice(0, 200);

const listPhotos = asyncHandler(async (req, res) => {
  const photos = await photoService.listPhotos(req.params.groupId, req.user._id);
  res.json({ success: true, data: { photos } });
});

const addPhoto = asyncHandler(async (req, res) => {
  const photo = await photoService.addPhoto(req.user._id, req.params.groupId, req.body);
  res.status(201).json({ success: true, data: { photo } });
});

// Multipart upload: multer holds the file in memory, storage keeps it.
const uploadPhoto = asyncHandler(async (req, res) => {
  if (!req.file) {
    res.status(400).json({ success: false, message: 'No image file received' });
    return;
  }
  // Check membership before storing anything, so a non-member can't fill the bucket.
  await groupService.getGroupForMember(req.params.groupId, req.user._id);

  const stored = await storage.upload(req.file, { folder: `splix/groups/${req.params.groupId}` });
  let photo;
  try {
    photo = await photoService.addPhoto(req.user._id, req.params.groupId, {
      imageUrl: stored.url,
      thumbUrl: stored.thumbUrl,
      storageProvider: stored.provider,
      storageKey: stored.key,
      caption: captionOf(req.body),
      emoji: '📷',
      batch: batchOf(req.body),
      batchCount: batchCountOf(req.body),
    });
  } catch (err) {
    // Don't leave an image in storage that no photo row points to.
    await storage.remove(stored.key, stored.provider);
    throw err;
  }
  res.status(201).json({ success: true, data: { photo } });
});

/**
 * A video for the gallery: multer has written the `video` file (and the
 * optional `poster` frame the phone made) to temp files, storage keeps them,
 * and the temp files go whatever happens.
 */
const uploadVideo = asyncHandler(async (req, res) => {
  const video = req.files?.video?.[0];
  const poster = req.files?.poster?.[0];
  try {
    if (!video) {
      res.status(400).json({ success: false, message: 'No video file received' });
      return;
    }
    // Check membership before storing anything, so a non-member can't fill the bucket.
    await groupService.getGroupForMember(req.params.groupId, req.user._id);

    // An oversized poster costs the video its tile picture, not its upload.
    const usablePoster = poster && poster.size <= MAX_POSTER_BYTES ? poster : null;
    const stored = await storage.upload(video, {
      folder: `splix/groups/${req.params.groupId}`,
      poster: usablePoster ? await fs.promises.readFile(usablePoster.path) : null,
    });
    let photo;
    try {
      photo = await photoService.addPhoto(req.user._id, req.params.groupId, {
        imageUrl: stored.url,
        // No square was made (no poster, or one sharp could not read): the
        // app then draws a plain video tile instead of the video's address.
        thumbUrl: stored.thumbUrl === stored.url ? '' : stored.thumbUrl,
        storageProvider: stored.provider,
        storageKey: stored.key,
        caption: captionOf(req.body),
        emoji: '🎬',
        mediaType: 'video',
        durationMs: durationOf(req.body),
        batch: batchOf(req.body),
        batchCount: batchCountOf(req.body),
      });
    } catch (err) {
      // Don't leave a video in storage that no gallery row points to.
      await storage.remove(stored.key, stored.provider);
      throw err;
    }
    res.status(201).json({ success: true, data: { photo } });
  } finally {
    await Promise.all(
      [video, poster].filter(Boolean).map((file) => fs.promises.rm(file.path, { force: true }))
    );
  }
});

const deletePhoto = asyncHandler(async (req, res) => {
  await photoService.deletePhoto(req.params.photoId, req.user._id);
  res.json({ success: true, message: 'Photo deleted' });
});

const deletePhotos = asyncHandler(async (req, res) => {
  const deletedIds = await photoService.deletePhotos(req.body.photoIds, req.user._id);
  res.json({ success: true, data: { deletedIds } });
});

module.exports = { listPhotos, addPhoto, uploadPhoto, uploadVideo, deletePhoto, deletePhotos };
