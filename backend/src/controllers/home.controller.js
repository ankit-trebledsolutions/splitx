const asyncHandler = require('../utils/asyncHandler');
const homeService = require('../services/home.service');

const getHome = asyncHandler(async (req, res) => {
  const data = await homeService.getHome(req.user._id);
  res.json({ success: true, data });
});

module.exports = { getHome };
