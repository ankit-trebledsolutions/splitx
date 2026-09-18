const asyncHandler = require('../utils/asyncHandler');
const photoService = require('../services/photo.service');
const groupService = require('../services/group.service');
const storage = require('../storage');

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
      caption: req.body.caption ?? '',
      emoji: '📷',
    });
  } catch (err) {
    // Don't leave an image in storage that no photo row points to.
    await storage.remove(stored.key, stored.provider);
    throw err;
  }
  res.status(201).json({ success: true, data: { photo } });
});

const deletePhoto = asyncHandler(async (req, res) => {
  await photoService.deletePhoto(req.params.photoId, req.user._id);
  res.json({ success: true, message: 'Photo deleted' });
});

module.exports = { listPhotos, addPhoto, uploadPhoto, deletePhoto };
