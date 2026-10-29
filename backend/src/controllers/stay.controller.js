const asyncHandler = require('../utils/asyncHandler');
const stayService = require('../services/stay.service');

const listStays = asyncHandler(async (req, res) => {
  const stays = await stayService.listStays(req.params.groupId, req.user._id);
  res.json({ success: true, data: { stays } });
});

const createStay = asyncHandler(async (req, res) => {
  const stay = await stayService.createStay(req.user._id, req.params.groupId, req.body);
  res.status(201).json({ success: true, data: { stay } });
});

const updateStay = asyncHandler(async (req, res) => {
  const stay = await stayService.updateStay(req.params.stayId, req.user._id, req.body);
  res.json({ success: true, data: { stay } });
});

const deleteStay = asyncHandler(async (req, res) => {
  await stayService.deleteStay(req.params.stayId, req.user._id);
  res.json({ success: true, message: 'Stay deleted' });
});

module.exports = { listStays, createStay, updateStay, deleteStay };
