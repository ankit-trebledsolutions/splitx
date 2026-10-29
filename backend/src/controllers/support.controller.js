const asyncHandler = require('../utils/asyncHandler');
const supportService = require('../services/support.service');

// What the phone said about itself, picked out of the form fields. Each is
// optional; the service stores whatever arrived.
const deviceOf = ({ platform, model, osVersion, appVersion, build }) => ({
  platform,
  model,
  osVersion,
  appVersion,
  build,
});

// Report a Problem. Multipart when screenshots come along (multer has put the
// files in req.files and the fields in req.body), plain JSON otherwise.
const create = asyncHandler(async (req, res) => {
  const { category, subject, message } = req.body;
  const report = await supportService.createReport(
    req.user,
    { category, subject, message, device: deviceOf(req.body) },
    req.files || []
  );
  res.status(201).json({ success: true, data: { report } });
});

// Contact Us: the same thing without a category or screenshots. Kept at its
// old address so phones on an older build keep working.
const contact = asyncHandler(async (req, res) => {
  const { subject, message } = req.body;
  const report = await supportService.createReport(req.user, {
    category: 'general',
    subject,
    message,
    device: deviceOf(req.body),
  });
  res.status(201).json({ success: true, data: { report } });
});

const listMine = asyncHandler(async (req, res) => {
  const reports = await supportService.listMine(req.user._id);
  res.json({ success: true, data: { reports } });
});

const getMine = asyncHandler(async (req, res) => {
  const report = await supportService.getMine(req.params.id, req.user._id);
  res.json({ success: true, data: { report } });
});

module.exports = { create, contact, listMine, getMine };
