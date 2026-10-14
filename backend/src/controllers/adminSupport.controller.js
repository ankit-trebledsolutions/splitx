const asyncHandler = require('../utils/asyncHandler');
const supportService = require('../services/support.service');

const summary = asyncHandler(async (_req, res) => {
  const data = await supportService.summary();
  res.json({ success: true, data });
});

const list = asyncHandler(async (req, res) => {
  const data = await supportService.listQueue(req.query);
  res.json({ success: true, data });
});

const get = asyncHandler(async (req, res) => {
  const report = await supportService.getForAdmin(req.params.id);
  res.json({ success: true, data: { report } });
});

const setStatus = asyncHandler(async (req, res) => {
  const report = await supportService.setStatus(req.params.id, req.body.status, req.user);
  res.json({ success: true, data: { report } });
});

const setPriority = asyncHandler(async (req, res) => {
  const report = await supportService.setPriority(req.params.id, req.body.priority, req.user);
  res.json({ success: true, data: { report } });
});

const reply = asyncHandler(async (req, res) => {
  const report = await supportService.addReply(req.params.id, req.body, req.user);
  res.status(201).json({ success: true, data: { report } });
});

module.exports = { summary, list, get, setStatus, setPriority, reply };
