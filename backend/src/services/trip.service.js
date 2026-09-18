const mongoose = require('mongoose');
const Group = require('../models/Group');
const Expense = require('../models/Expense');
const Task = require('../models/Task');
const ItineraryDay = require('../models/ItineraryDay');
const Stay = require('../models/Stay');
const Photo = require('../models/Photo');

const DAY_MS = 24 * 60 * 60 * 1000;
const MEMBER_FIELDS = 'name email';

const round2 = (n) => Math.round(n * 100) / 100;

// Calendar-day difference, ignoring the time of day (a trip starting "tomorrow"
// is 1 day away at 11pm as well as at 9am).
const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const daysBetween = (from, to) => Math.round((startOfDay(to) - startOfDay(from)) / DAY_MS);

// { groupId: count } for any model with a `group` field, in one query.
const countByGroup = async (Model, groupIds, extraMatch = {}) => {
  const rows = await Model.aggregate([
    { $match: { group: { $in: groupIds }, ...extraMatch } },
    { $group: { _id: '$group', count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.count]));
};

/**
 * Everything the Trips tab shows, for all of the user's trip groups, in a
 * fixed number of queries however many trips there are.
 */
const listTrips = async (userId) => {
  const groups = await Group.find({ members: userId, groupType: 'trip' })
    .populate('members', MEMBER_FIELDS)
    .lean();
  if (!groups.length) return { trips: [], stats: emptyStats() };

  const groupIds = groups.map((g) => g._id);
  const me = new mongoose.Types.ObjectId(String(userId));

  const [spendRows, shareRows, taskRows, nextTasks, dayCounts, stayCounts, photoCounts] =
    await Promise.all([
      Expense.aggregate([
        { $match: { group: { $in: groupIds } } },
        { $group: { _id: '$group', total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      // What this person's own shares add up to: their real cost of the trip.
      Expense.aggregate([
        { $match: { group: { $in: groupIds } } },
        { $unwind: '$splits' },
        { $match: { 'splits.user': me } },
        { $group: { _id: '$group', share: { $sum: '$splits.amount' } } },
      ]),
      Task.aggregate([
        { $match: { group: { $in: groupIds } } },
        {
          $group: {
            _id: '$group',
            total: { $sum: 1 },
            done: { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] } },
          },
        },
      ]),
      // The most pressing open task per trip: earliest due date first.
      Task.aggregate([
        { $match: { group: { $in: groupIds }, status: 'open', dueAt: { $ne: null } } },
        { $sort: { dueAt: 1 } },
        { $group: { _id: '$group', taskId: { $first: '$_id' }, title: { $first: '$title' }, dueAt: { $first: '$dueAt' } } },
      ]),
      countByGroup(ItineraryDay, groupIds),
      countByGroup(Stay, groupIds, { status: { $ne: 'cancelled' } }),
      countByGroup(Photo, groupIds),
    ]);

  const byId = (rows) => new Map(rows.map((r) => [String(r._id), r]));
  const spend = byId(spendRows);
  const share = byId(shareRows);
  const tasks = byId(taskRows);
  const next = byId(nextTasks);

  const now = new Date();
  const trips = groups.map((g) => {
    const id = String(g._id);
    const totalDays = g.totalDays ?? 1;
    const startDate = g.startDate ?? null;
    const endDate = startDate ? new Date(startDate.getTime() + (totalDays - 1) * DAY_MS) : null;

    let status = 'unscheduled';
    let daysUntil = null;
    let dayNumber = null;
    if (startDate) {
      const toStart = daysBetween(now, startDate);
      const toEnd = daysBetween(now, endDate);
      if (toStart > 0) {
        status = 'upcoming';
        daysUntil = toStart;
      } else if (toEnd >= 0) {
        status = 'ongoing';
        dayNumber = Math.min(totalDays, 1 - toStart);
      } else {
        status = 'past';
      }
    }

    const nextTask = next.get(id);
    return {
      _id: g._id,
      name: g.name,
      description: g.description,
      location: g.location ?? '',
      startDate,
      endDate,
      totalDays,
      status,
      daysUntil,
      dayNumber,
      members: g.members,
      spend: {
        total: round2(spend.get(id)?.total ?? 0),
        yourShare: round2(share.get(id)?.share ?? 0),
        expenseCount: spend.get(id)?.count ?? 0,
      },
      tasks: { total: tasks.get(id)?.total ?? 0, done: tasks.get(id)?.done ?? 0 },
      nextTask: nextTask ? { _id: nextTask.taskId, title: nextTask.title, dueAt: nextTask.dueAt } : null,
      counts: {
        itineraryDays: dayCounts.get(id) ?? 0,
        stays: stayCounts.get(id) ?? 0,
        photos: photoCounts.get(id) ?? 0,
      },
    };
  });

  // Ongoing first, then the soonest upcoming, then unscheduled drafts, then the
  // most recent past trips.
  const rank = { ongoing: 0, upcoming: 1, unscheduled: 2, past: 3 };
  trips.sort((a, b) => {
    if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
    if (a.status === 'past') return b.endDate - a.endDate;
    if (a.startDate && b.startDate) return a.startDate - b.startDate;
    return 0;
  });

  const taken = trips.filter((t) => t.status === 'past' || t.status === 'ongoing');
  const stats = {
    totalTrips: trips.length,
    upcoming: trips.filter((t) => t.status === 'upcoming').length,
    // Days actually travelled so far: whole past trips plus the elapsed part of ongoing ones.
    daysTravelled: taken.reduce((sum, t) => sum + (t.status === 'ongoing' ? t.dayNumber : t.totalDays), 0),
    places: new Set(trips.map((t) => t.location.trim().toLowerCase()).filter(Boolean)).size,
    totalSpent: round2(trips.reduce((sum, t) => sum + t.spend.yourShare, 0)),
  };

  return { trips, stats };
};

const emptyStats = () => ({ totalTrips: 0, upcoming: 0, daysTravelled: 0, places: 0, totalSpent: 0 });

module.exports = { listTrips };
