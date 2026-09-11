const asyncHandler = require('../utils/asyncHandler');
const streamService = require('../services/stream.service');

const getToken = asyncHandler(async (req, res) => {
  const data = await streamService.issueToken(req.user);
  res.json({ success: true, data });
});

module.exports = { getToken };
