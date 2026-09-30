const asyncHandler = require('../utils/asyncHandler');
const dashboardService = require('../services/adminDashboard.service');

const get = asyncHandler(async (req, res) => {
  const data = await dashboardService.getDashboard(req.query, req.user);
  res.json({ success: true, data });
});

module.exports = { get };
