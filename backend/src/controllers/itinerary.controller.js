const asyncHandler = require('../utils/asyncHandler');
const itineraryService = require('../services/itinerary.service');
const aiItineraryService = require('../services/aiItinerary.service');

const listDays = asyncHandler(async (req, res) => {
  const days = await itineraryService.listDays(req.params.groupId, req.user._id);
  res.json({ success: true, data: { days } });
});

const createDay = asyncHandler(async (req, res) => {
  const day = await itineraryService.createDay(req.user._id, req.params.groupId, req.body);
  res.status(201).json({ success: true, data: { day } });
});

const getGeneration = asyncHandler(async (req, res) => {
  const status = await aiItineraryService.getStatus(req.params.groupId, req.user._id);
  res.json({ success: true, data: status });
});

const startGeneration = asyncHandler(async (req, res) => {
  const job = await aiItineraryService.start(req.user._id, req.params.groupId, req.body);
  res.status(202).json({ success: true, data: { job } });
  // Not awaited: planning takes about a minute, far longer than the app waits
  // for any response. run() closes the job itself whatever happens; the catch
  // is only so a bug in it can never become an unhandled rejection.
  aiItineraryService
    .run(job._id)
    .catch((err) => console.error(`[ai] job ${job._id} ended badly:`, err.message));
});

const updateDay = asyncHandler(async (req, res) => {
  const day = await itineraryService.updateDay(req.params.dayId, req.user._id, req.body);
  res.json({ success: true, data: { day } });
});

const addActivity = asyncHandler(async (req, res) => {
  const day = await itineraryService.addActivity(req.params.dayId, req.user._id, req.body);
  res.status(201).json({ success: true, data: { day } });
});

const updateActivity = asyncHandler(async (req, res) => {
  const { day, targetDay } = await itineraryService.updateActivity(
    req.params.dayId,
    req.params.activityId,
    req.user._id,
    req.body
  );
  res.json({ success: true, data: { day, targetDay } });
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

module.exports = {
  listDays,
  createDay,
  getGeneration,
  startGeneration,
  updateDay,
  addActivity,
  updateActivity,
  removeActivity,
  deleteDay,
};
