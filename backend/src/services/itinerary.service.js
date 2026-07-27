const ItineraryDay = require('../models/ItineraryDay');
const ApiError = require('../utils/ApiError');
const groupService = require('./group.service');
const messageService = require('./message.service');
const notificationService = require('./notification.service');

const USER_FIELDS = 'name email';
const POPULATE = [{ path: 'createdBy', select: USER_FIELDS }];

const memberName = (group, userId) =>
  group.members.find((m) => m._id.equals(userId))?.name ?? 'A member';

const listDays = async (groupId, userId) => {
  await groupService.getGroupForMember(groupId, userId);
  return ItineraryDay.find({ group: groupId }).populate(POPULATE).sort({ dayNumber: 1 });
};

const createDay = async (userId, groupId, payload) => {
  const group = await groupService.getGroupForMember(groupId, userId);

  let dayNumber = payload.dayNumber;
  if (!dayNumber) {
    const last = await ItineraryDay.findOne({ group: groupId }).sort({ dayNumber: -1 });
    dayNumber = (last?.dayNumber ?? 0) + 1;
  }

  const existing = await ItineraryDay.findOne({ group: groupId, dayNumber });
  if (existing) throw ApiError.conflict(`Day ${dayNumber} already exists`);

  const day = await ItineraryDay.create({
    group: groupId,
    dayNumber,
    title: payload.title,
    date: payload.date ?? null,
    activities: payload.activities ?? [],
    createdBy: userId,
  });

  await day.populate(POPULATE);
  await messageService.postSystem(
    groupId,
    `${memberName(group, userId)} added Day ${dayNumber} · ${day.title} to the itinerary`
  );

  await notificationService.notifyGroup({
    groupId,
    actorId: userId,
    type: 'itinerary',
    title: 'Itinerary Updated',
    body: `${memberName(group, userId)} added Day ${dayNumber} · ${day.title} to the itinerary.`,
  });

  return day;
};

const getDayForMember = async (dayId, userId) => {
  const day = await ItineraryDay.findById(dayId).populate(POPULATE);
  if (!day) throw ApiError.notFound('Itinerary day not found');
  await groupService.getGroupForMember(day.group, userId);
  return day;
};

const updateDay = async (dayId, userId, payload) => {
  const day = await getDayForMember(dayId, userId);
  for (const field of ['title', 'date', 'activities']) {
    if (payload[field] !== undefined) day[field] = payload[field];
  }
  await day.save();
  return day.populate(POPULATE);
};

const addActivity = async (dayId, userId, activity) => {
  const day = await getDayForMember(dayId, userId);
  day.activities.push(activity);
  await day.save();
  return day.populate(POPULATE);
};

const removeActivity = async (dayId, activityId, userId) => {
  const day = await getDayForMember(dayId, userId);
  const activity = day.activities.id(activityId);
  if (!activity) throw ApiError.notFound('Activity not found');
  activity.deleteOne();
  await day.save();
  return day.populate(POPULATE);
};

const deleteDay = async (dayId, userId) => {
  const day = await getDayForMember(dayId, userId);
  if (!day.createdBy._id.equals(userId)) {
    throw ApiError.forbidden('Only the member who added this day can delete it');
  }
  await day.deleteOne();
};

module.exports = { listDays, createDay, getDayForMember, updateDay, addActivity, removeActivity, deleteDay };
