const asyncHandler = require('../utils/asyncHandler');
const photoService = require('../services/photo.service');

const listPhotos = asyncHandler(async (req, res) => {
  const photos = await photoService.listPhotos(req.params.groupId, req.user._id);
  res.json({ success: true, data: { photos } });
});

const addPhoto = asyncHandler(async (req, res) => {
  const photo = await photoService.addPhoto(req.user._id, req.params.groupId, req.body);
  res.status(201).json({ success: true, data: { photo } });
});

const deletePhoto = asyncHandler(async (req, res) => {
  await photoService.deletePhoto(req.params.photoId, req.user._id);
  res.json({ success: true, message: 'Photo deleted' });
});

module.exports = { listPhotos, addPhoto, deletePhoto };
