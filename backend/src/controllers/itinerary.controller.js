const asyncHandler = require('../utils/asyncHandler');
const itineraryService = require('../services/itinerary.service');

const listDays = asyncHandler(async (req, res) => {
  const days = await itineraryService.listDays(req.params.groupId, req.user._id);
  res.json({ success: true, data: { days } });
});

const createDay = asyncHandler(async (req, res) => {
  const day = await itineraryService.createDay(req.user._id, req.params.groupId, req.body);
  res.status(201).json({ success: true, data: { day } });
});

const updateDay = asyncHandler(async (req, res) => {
  const day = await itineraryService.updateDay(req.params.dayId, req.user._id, req.body);
  res.json({ success: true, data: { day } });
});

const addActivity = asyncHandler(async (req, res) => {
  const day = await itineraryService.addActivity(req.params.dayId, req.user._id, req.body);
  res.status(201).json({ success: true, data: { day } });
});

const removeActivity = asyncHandler(async (req, res) => {
  const day = await itineraryService.removeActivity(
    req.params.dayId,
    req.params.activityId,
    req.user._id
  );
  res.json({ success: true, data: { day } });
});

const deleteDay = asyncHandler(async (req, res) => {
  await itineraryService.deleteDay(req.params.dayId, req.user._id);
  res.json({ success: true, message: 'Itinerary day deleted' });
});

module.exports = { listDays, createDay, updateDay, addActivity, removeActivity, deleteDay };
