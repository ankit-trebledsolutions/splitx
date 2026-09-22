const ItineraryDay = require('../models/ItineraryDay');
const ApiError = require('../utils/ApiError');
const { sortByTime } = require('../utils/itineraryTime');
// Called as realtime.emitToGroup(...), never destructured, so tests can swap the function.
const realtime = require('../realtime/socket');
const groupService = require('./group.service');
const messageService = require('./message.service');
const notificationService = require('./notification.service');
const aiItineraryService = require('./aiItinerary.service');

const USER_FIELDS = 'name email';
const POPULATE = [{ path: 'createdBy', select: USER_FIELDS }];

const memberName = (group, userId) =>
  group.members.find((m) => m._id.equals(userId))?.name ?? 'A member';

// Null-safe: a day whose creator's account is gone has no createdBy to compare.
const sameId = (a, b) => a != null && b != null && String(a) === String(b);

// Tells every member's open Itinerary tab to refetch. No days in the payload:
// the normal GET is always consistent, whoever made the change.
const announceChange = (groupId) =>
  realtime.emitToGroup(String(groupId), 'itinerary:updated', { groupId: String(groupId) });

const listDays = async (groupId, userId) => {
  await groupService.getGroupForMember(groupId, userId);
  return ItineraryDay.find({ group: groupId }).populate(POPULATE).sort({ dayNumber: 1 });
};

const createDay = async (userId, groupId, payload) => {
  const group = await groupService.getGroupForMember(groupId, userId);
  await aiItineraryService.assertNotGenerating(groupId);

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
    activities: sortByTime(payload.activities),
    createdBy: userId,
  });

  await day.populate(POPULATE);
  announceChange(groupId);
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

// The day plus the group it belongs to, for callers that need the group's admin.
const loadDayForMember = async (dayId, userId) => {
  const day = await ItineraryDay.findById(dayId).populate(POPULATE);
  if (!day) throw ApiError.notFound('Itinerary day not found');
  const group = await groupService.getGroupForMember(day.group, userId);
  return { day, group };
};

const getDayForMember = async (dayId, userId) => (await loadDayForMember(dayId, userId)).day;

// Every write starts here: the day, for a member, while no AI run owns the itinerary.
const getDayForEdit = async (dayId, userId) => {
  const loaded = await loadDayForMember(dayId, userId);
  await aiItineraryService.assertNotGenerating(loaded.day.group);
  return loaded;
};

const updateDay = async (dayId, userId, payload) => {
  const { day } = await getDayForEdit(dayId, userId);
  for (const field of ['title', 'date']) {
    if (payload[field] !== undefined) day[field] = payload[field];
  }
  if (payload.activities !== undefined) {
    // An activity keeps its _id across a save only when that id really is one
    // of this day's (and is sent once). Anything else gets a fresh id, so a
    // client can never plant an id of its choosing.
    const kept = new Set();
    day.activities = sortByTime(
      payload.activities.map(({ _id, ...activity }) => {
        const id = _id?.toLowerCase();
        if (!id || kept.has(id) || !day.activities.id(id)) return activity;
        kept.add(id);
        return { _id: id, ...activity };
      })
    );
  }
  await day.save();
  announceChange(day.group);
  return day.populate(POPULATE);
};

const addActivity = async (dayId, userId, activity) => {
  const { day } = await getDayForEdit(dayId, userId);
  day.activities = sortByTime([...day.activities, activity]);
  await day.save();
  announceChange(day.group);
  return day.populate(POPULATE);
};

/**
 * Edits one activity in place; an empty string clears a field. With a
 * `targetDayId` other than its own day, the activity moves there and keeps its
 * _id. Resolves to { day, targetDay }: the day it was in and, after a move, the
 * day it is in now (null otherwise).
 */
const updateActivity = async (dayId, activityId, userId, { targetDayId, ...fields }) => {
  const { day } = await getDayForEdit(dayId, userId);
  const activity = day.activities.id(activityId);
  if (!activity) throw ApiError.notFound('Activity not found');

  if (!targetDayId || sameId(targetDayId, day._id)) {
    activity.set(fields);
    day.activities = sortByTime(day.activities);
    await day.save();
    announceChange(day.group);
    return { day: await day.populate(POPULATE), targetDay: null };
  }

  const targetDay = await ItineraryDay.findOne({ _id: targetDayId, group: day.group }).populate(POPULATE);
  if (!targetDay) {
    throw new ApiError(400, 'That day is not part of this itinerary.', { code: 'INVALID_TARGET_DAY' });
  }
  // Target first, source second: a crash in between leaves the activity on
  // both days, which a member can fix, rather than on neither.
  targetDay.activities = sortByTime([...targetDay.activities, { ...activity.toObject(), ...fields }]);
  await targetDay.save();
  activity.deleteOne();
  await day.save();
  announceChange(day.group);
  return { day: await day.populate(POPULATE), targetDay: await targetDay.populate(POPULATE) };
};

const removeActivity = async (dayId, activityId, userId) => {
  const { day } = await getDayForEdit(dayId, userId);
  const activity = day.activities.id(activityId);
  if (!activity) throw ApiError.notFound('Activity not found');
  activity.deleteOne();
  await day.save();
  announceChange(day.group);
  return day.populate(POPULATE);
};

// The day's creator or the group admin. AI-planned days all belong to whoever
// asked for the plan, so creator-only would lock everyone else out of them.
const deleteDay = async (dayId, userId) => {
  const { day, group } = await getDayForEdit(dayId, userId);
  if (!sameId(day.createdBy?._id, userId) && !sameId(group.adminId, userId)) {
    throw new ApiError(403, 'Only the group admin or the member who added this day can delete it.', {
      code: 'DAY_DELETE_FORBIDDEN',
    });
  }
  await day.deleteOne();
  announceChange(day.group);
};

module.exports = {
  listDays,
  createDay,
  getDayForMember,
  updateDay,
  addActivity,
  updateActivity,
  removeActivity,
  deleteDay,
};
