const asyncHandler = require('../utils/asyncHandler');
const groupService = require('../services/group.service');

const createGroup = asyncHandler(async (req, res) => {
  const group = await groupService.createGroup(req.user._id, req.body);
  res.status(201).json({ success: true, data: { group } });
});

const listGroups = asyncHandler(async (req, res) => {
  const groups = await groupService.listGroupsForUser(req.user._id);
  res.json({ success: true, data: { groups } });
});

const getGroup = asyncHandler(async (req, res) => {
  const group = await groupService.getGroupForMember(req.params.groupId, req.user._id);
  res.json({ success: true, data: { group } });
});

const joinGroup = asyncHandler(async (req, res) => {
  const group = await groupService.joinGroupByCode(req.user._id, req.body.inviteCode);
  res.json({ success: true, data: { group } });
});

const leaveGroup = asyncHandler(async (req, res) => {
  await groupService.leaveGroup(req.params.groupId, req.user._id);
  res.json({ success: true, message: 'Left group' });
});

const getBalances = asyncHandler(async (req, res) => {
  const data = await groupService.getBalances(req.params.groupId, req.user._id);
  res.json({ success: true, data });
});

module.exports = { createGroup, listGroups, getGroup, joinGroup, leaveGroup, getBalances };
