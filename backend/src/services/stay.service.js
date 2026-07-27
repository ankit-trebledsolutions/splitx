const Stay = require('../models/Stay');
const ApiError = require('../utils/ApiError');
const groupService = require('./group.service');
const messageService = require('./message.service');
const notificationService = require('./notification.service');

const USER_FIELDS = 'name email';
const POPULATE = [{ path: 'bookedBy', select: USER_FIELDS }];

const assertDates = (checkIn, checkOut) => {
  if (new Date(checkOut) <= new Date(checkIn)) {
    throw ApiError.badRequest('Check-out must be after check-in');
  }
};

const listStays = async (groupId, userId) => {
  await groupService.getGroupForMember(groupId, userId);
  return Stay.find({ group: groupId }).populate(POPULATE).sort({ checkIn: 1 });
};

const createStay = async (userId, groupId, payload) => {
  const group = await groupService.getGroupForMember(groupId, userId);
  assertDates(payload.checkIn, payload.checkOut);

  const stay = await Stay.create({
    group: groupId,
    name: payload.name,
    stars: payload.stars,
    status: payload.status,
    checkIn: payload.checkIn,
    checkOut: payload.checkOut,
    guests: payload.guests,
    pricePerNight: payload.pricePerNight,
    amenities: payload.amenities ?? [],
    address: payload.address,
    emoji: payload.emoji,
    bookedBy: userId,
  });

  await stay.populate(POPULATE);

  const booker = group.members.find((m) => m._id.equals(userId))?.name ?? 'A member';
  await messageService.postSystem(groupId, `${booker} added ${stay.name} to stays`);

  await notificationService.notifyGroup({
    groupId,
    actorId: userId,
    type: 'stay',
    title: 'Stay Added',
    body: `${booker} added ${stay.name} to stays.`,
  });

  return stay;
};

const getStayForMember = async (stayId, userId) => {
  const stay = await Stay.findById(stayId).populate(POPULATE);
  if (!stay) throw ApiError.notFound('Stay not found');
  await groupService.getGroupForMember(stay.group, userId);
  return stay;
};

const updateStay = async (stayId, userId, payload) => {
  const stay = await getStayForMember(stayId, userId);

  const fields = [
    'name',
    'stars',
    'status',
    'checkIn',
    'checkOut',
    'guests',
    'pricePerNight',
    'amenities',
    'address',
    'emoji',
  ];
  for (const field of fields) {
    if (payload[field] !== undefined) stay[field] = payload[field];
  }
  assertDates(stay.checkIn, stay.checkOut);

  const statusChanged = payload.status !== undefined;
  await stay.save();

  if (statusChanged) {
    await messageService.postSystem(stay.group, `${stay.name} is now ${stay.status}`);
    await notificationService.notifyGroup({
      groupId: stay.group,
      actorId: userId,
      type: 'stay',
      title: 'Stay Updated',
      body: `${stay.name} is now ${stay.status}.`,
    });
  }

  return stay;
};

const deleteStay = async (stayId, userId) => {
  const stay = await getStayForMember(stayId, userId);
  if (!stay.bookedBy._id.equals(userId)) {
    throw ApiError.forbidden('Only the member who added this stay can delete it');
  }
  await stay.deleteOne();
};

module.exports = { listStays, createStay, getStayForMember, updateStay, deleteStay };
