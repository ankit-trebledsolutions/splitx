const asyncHandler = require('../utils/asyncHandler');
const attractionService = require('../services/attraction.service');

const listAttractions = asyncHandler(async (req, res) => {
  const attractions = await attractionService.listAttractions(req.params.groupId, req.user._id);
  res.json({ success: true, data: { attractions } });
});

const createAttraction = asyncHandler(async (req, res) => {
  const attraction = await attractionService.createAttraction(
    req.user._id,
    req.params.groupId,
    req.body
  );
  res.status(201).json({ success: true, data: { attraction } });
});

const toggleSave = asyncHandler(async (req, res) => {
  const attraction = await attractionService.toggleSave(req.params.attractionId, req.user._id);
  res.json({ success: true, data: { attraction } });
});

const updateAttraction = asyncHandler(async (req, res) => {
  const attraction = await attractionService.updateAttraction(
    req.params.attractionId,
    req.user._id,
    req.body
  );
  res.json({ success: true, data: { attraction } });
});

const deleteAttraction = asyncHandler(async (req, res) => {
  await attractionService.deleteAttraction(req.params.attractionId, req.user._id);
  res.json({ success: true, message: 'Attraction deleted' });
});

module.exports = { listAttractions, createAttraction, toggleSave, updateAttraction, deleteAttraction };
