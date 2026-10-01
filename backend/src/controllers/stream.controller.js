const asyncHandler = require('../utils/asyncHandler');
const streamService = require('../services/stream.service');
const messageService = require('../services/message.service');
const groupService = require('../services/group.service');
const callRing = require('../services/callRing.service');

const getToken = asyncHandler(async (req, res) => {
  const data = await streamService.issueToken(req.user);
  res.json({ success: true, data });
});

// Posts a "call started" / "Call ended" activity card into the group chat, the
// same way creating a task or reminder does, and makes the other members'
// phones ring (or stop ringing). Called by the app when a call's first
// participant joins and when its last participant leaves.
const callEvent = asyncHandler(async (req, res) => {
  const { groupId, event, video } = req.body;
  // Authorize: only a member of the group may post its call activity.
  const group = await groupService.getGroupForMember(groupId, req.user._id);

  const text = event === 'started' ? `${req.user.name} started a call` : 'Call ended';
  const message = await messageService.postSystem(groupId, text);

  // Not awaited: like every push, ringing must not slow the request down.
  if (event === 'started') callRing.ring({ group, caller: req.user, video });
  else callRing.end({ group, by: req.user });

  res.json({ success: true, data: { message } });
});

module.exports = { getToken, callEvent };
