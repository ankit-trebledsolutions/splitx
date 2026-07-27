const Attraction = require('../models/Attraction');
const ApiError = require('../utils/ApiError');
const groupService = require('./group.service');
const messageService = require('./message.service');
const notificationService = require('./notification.service');

const USER_FIELDS = 'name email';
const POPULATE = [{ path: 'addedBy', select: USER_FIELDS }];

const listAttractions = async (groupId, userId) => {
  await groupService.getGroupForMember(groupId, userId);
  return Attraction.find({ group: groupId }).populate(POPULATE).sort({ createdAt: 1 });
};

const createAttraction = async (userId, groupId, payload) => {
  const group = await groupService.getGroupForMember(groupId, userId);

  const attraction = await Attraction.create({
    group: groupId,
    name: payload.name,
    category: payload.category,
    rating: payload.rating ?? null,
    distanceKm: payload.distanceKm ?? null,
    emoji: payload.emoji,
    addedBy: userId,
  });

  await attraction.populate(POPULATE);

  const adder = group.members.find((m) => m._id.equals(userId))?.name ?? 'A member';
  await messageService.postSystem(groupId, `${adder} added ${attraction.name} to attractions`);

  await notificationService.notifyGroup({
    groupId,
    actorId: userId,
    type: 'attraction',
    title: 'Attraction Added',
    body: `${adder} added ${attraction.name} to attractions.`,
  });

  return attraction;
};

const getAttractionForMember = async (attractionId, userId) => {
  const attraction = await Attraction.findById(attractionId).populate(POPULATE);
  if (!attraction) throw ApiError.notFound('Attraction not found');
  await groupService.getGroupForMember(attraction.group, userId);
  return attraction;
};

// Bookmark / un-bookmark for the current user.
const toggleSave = async (attractionId, userId) => {
  const attraction = await getAttractionForMember(attractionId, userId);
  const saved = attraction.savedBy.some((id) => id.equals(userId));
  if (saved) {
    attraction.savedBy = attraction.savedBy.filter((id) => !id.equals(userId));
  } else {
    attraction.savedBy.push(userId);
  }
  await attraction.save();
  return attraction;
};

const updateAttraction = async (attractionId, userId, payload) => {
  const attraction = await getAttractionForMember(attractionId, userId);
  for (const field of ['name', 'category', 'rating', 'distanceKm', 'emoji']) {
    if (payload[field] !== undefined) attraction[field] = payload[field];
  }
  await attraction.save();
  return attraction;
};

const deleteAttraction = async (attractionId, userId) => {
  const attraction = await getAttractionForMember(attractionId, userId);
  if (!attraction.addedBy._id.equals(userId)) {
    throw ApiError.forbidden('Only the member who added this attraction can delete it');
  }
  await attraction.deleteOne();
};

module.exports = {
  listAttractions,
  createAttraction,
  getAttractionForMember,
  toggleSave,
  updateAttraction,
  deleteAttraction,
};
