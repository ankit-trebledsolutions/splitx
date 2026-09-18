const asyncHandler = require('../utils/asyncHandler');
const tripService = require('../services/trip.service');

const listTrips = asyncHandler(async (req, res) => {
  const data = await tripService.listTrips(req.user._id);
  res.json({ success: true, data });
});

module.exports = { listTrips };
