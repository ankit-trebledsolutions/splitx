const mongoose = require('mongoose');
const User = require('../models/User');
const Group = require('../models/Group');
const Expense = require('../models/Expense');
const ItineraryJob = require('../models/ItineraryJob');
const ApiError = require('../utils/ApiError');
const { ROLES, PERMISSIONS, ACCESS_LEVEL, satisfies } = require('../config/permissions');

/**
 * The admin panel's first screen: how many people, groups, expenses and AI
 * plans there are, and how the last 7, 30 or 90 days compare with the same
 * number of days before them.
 *
 * Three rules hold everywhere in this file.
 *   A day is a calendar day where the admin is sitting, and MongoDB does that
 *   conversion ($dateToString with the time zone). Nothing here works out a
 *   local midnight in JavaScript.
 *   Every figure about a period comes from the same per-day buckets, so the
 *   chart, the totals above it and the breakdowns beside it cannot disagree.
 *   A field that is not stored is read the way the rest of the API reads it.
 *   Pipelines and .lean() apply no schema defaults, so that is done by hand.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_USERS = 6;
const TOP_FAILURES = 3;

// What MongoDB answers when it does not know the time zone it was given.
const UNKNOWN_TIME_ZONE = 40485;

const STAFF_ROLES = [ROLES.ADMIN, ROLES.SUPER_ADMIN];

// Everyone who is not staff. Never { role: 'user' }: accounts created before
// `role` existed carry no such field, and only $nin matches a missing one. See
// buildListQuery in admin.service.js.
const APP_USERS = { role: { $nin: STAFF_ROLES } };

// The last `count` calendar dates in `tz` as 'YYYY-MM-DD', oldest first and
// today last.
//
// Only today is asked of the time zone. The earlier dates are counted back on
// the calendar through Date.UTC, which has no daylight saving: stepping back 24
// hours at a time would give the same date twice on the night the clocks go
// back and skip one when they go forward.
const dayKeys = (now, tz, count) => {
  // en-CA is the locale that writes a date as YYYY-MM-DD.
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const [year, month, day] = today.split('-').map(Number);

  return Array.from({ length: count }, (_, index) =>
    new Date(Date.UTC(year, month - 1, day - (count - 1 - index))).toISOString().slice(0, 10)
  );
};

// The list of people is part of user management, so it goes only to someone
// who could open the Users screen anyway.
const maySeeUsers = (actor) =>
  actor?.role === ROLES.SUPER_ADMIN ||
  satisfies(actor?.permissions?.get(PERMISSIONS.USER_MANAGEMENT), ACCESS_LEVEL.READ);

// `method` says whether Google is linked to the account, not how the account
// was made. The two are not separate kinds: signing in with Google links it
// onto a password account with the same email, and an account made with Google
// gains a password through the reset flow. So 'google' means "has Google
// linked" and 'password' means "password only". googleId itself stays here:
// the panel is told which, never Google's id for the person.
const toRecentUser = (doc) => ({
  id: String(doc._id),
  name: doc.name,
  email: doc.email,
  avatar: doc.avatar ?? null,
  method: doc.googleId ? 'google' : 'password',
  // Older accounts have neither flag and are verified and active.
  emailVerified: doc.emailVerified !== false,
  isActive: doc.isActive !== false,
  createdAt: doc.createdAt,
});

const add = (counts, name, count) => counts.set(name, (counts.get(name) || 0) + count);

// Highest count first. Equal counts go by name, so the same data always comes
// out in the same order.
const ranked = (counts, label) =>
  [...counts]
    .sort(([a, countA], [b, countB]) => countB - countA || (a < b ? -1 : 1))
    .map(([name, count]) => ({ [label]: name, count }));

/**
 * Turns what the queries returned into what the panel is sent. No database and
 * no clock of its own, so every sum in it can be tested with made-up buckets.
 *
 * `raw` is what getDashboard collects:
 *   userDays, groupDays, expenseDays, jobDays  one row per bucket, its day in _id.day
 *   userSnapshot                               the one row of conditional sums, if any
 *   counts                                     { groups, expenses, aiPlans } that exist now
 *   recentUsers                                lean documents, or null when withheld
 */
const buildDashboard = (raw, { days, tz, now }) => {
  // Both periods at once: the first half is the previous one, the second the
  // current one.
  const allKeys = dayKeys(now, tz, 2 * days);
  const previousKeys = new Set(allKeys.slice(0, days));
  const series = new Map(
    allKeys.slice(days).map((date) => [date, { date, users: 0, groups: 0, expenses: 0 }])
  );

  // Sorts one collection's buckets into the two periods. The queries reach a
  // little further back than the first day, so a bucket on a day in neither
  // period is expected, and is dropped.
  const split = (rows, onCurrent) => {
    const sums = { current: 0, previous: 0 };
    for (const row of rows) {
      const point = series.get(row._id.day);
      if (point) {
        sums.current += row.count;
        onCurrent(row, point);
      } else if (previousKeys.has(row._id.day)) {
        sums.previous += row.count;
      }
    }
    return sums;
  };

  const groupTypes = new Map();
  const expenseCategories = new Map();
  const failures = new Map();
  const runs = { done: 0, failed: 0, running: 0 };
  const tokens = { input: 0, output: 0 };
  const timed = { ms: 0, runs: 0 };

  const users = split(raw.userDays, (row, point) => {
    point.users += row.count;
  });

  const groups = split(raw.groupDays, (row, point) => {
    point.groups += row.count;
    add(groupTypes, row._id.type, row.count);
  });

  const expenses = split(raw.expenseDays, (row, point) => {
    point.expenses += row.count;
    add(expenseCategories, row._id.category, row.count);
  });

  const aiPlans = split(raw.jobDays, (row) => {
    const { status, errorCode } = row._id;
    if (status === 'done') {
      runs.done += row.count;
    } else if (status === 'failed') {
      runs.failed += row.count;
      add(failures, errorCode || 'AI_FAILED', row.count);
    } else {
      // A run is running until it is marked done or failed, which is also what
      // the model's default says about one with no status stored.
      runs.running += row.count;
    }
    tokens.input += row.inputTokens;
    tokens.output += row.outputTokens;
    timed.ms += row.durationMs;
    timed.runs += row.timed;
  });

  const snapshot = raw.userSnapshot || {};
  const totalUsers = snapshot.total || 0;
  const googleUsers = snapshot.google || 0;
  const dates = [...series.keys()];

  return {
    range: { days, timezone: tz, from: dates[0], to: dates[dates.length - 1] },
    totals: {
      users: { total: totalUsers, ...users },
      groups: { total: raw.counts.groups, ...groups },
      expenses: { total: raw.counts.expenses, ...expenses },
      aiPlans: { total: raw.counts.aiPlans, ...aiPlans },
    },
    series: [...series.values()],
    users: {
      total: totalUsers,
      // Password only, and Google linked: see toRecentUser.
      password: totalUsers - googleUsers,
      google: googleUsers,
      unverified: snapshot.unverified || 0,
      blocked: snapshot.blocked || 0,
      signedIn: snapshot.signedIn || 0,
    },
    ai: {
      runs: aiPlans.current,
      ...runs,
      averageMs: timed.runs ? Math.round(timed.ms / timed.runs) : null,
      inputTokens: tokens.input,
      outputTokens: tokens.output,
      failures: ranked(failures, 'code').slice(0, TOP_FAILURES),
    },
    groupTypes: ranked(groupTypes, 'type'),
    expenseCategories: ranked(expenseCategories, 'category'),
    recentUsers: raw.recentUsers ? raw.recentUsers.map(toRecentUser) : null,
  };
};

// The calendar date of a stored instant, in the admin's time zone.
const dayOf = (field, tz) => ({
  $dateToString: { format: '%Y-%m-%d', date: field, timezone: tz },
});

const getDashboard = async ({ days, tz }, actor, now = new Date()) => {
  // A generous floor, as an instant. The first of the 2 × days calendar days
  // began 2 × days × 24 hours ago at the earliest, give or take an hour of
  // daylight saving, so two spare days cover it in any zone. Whatever that
  // lets in from before the first day is dropped, by date, in buildDashboard.
  const lowerBound = new Date(now.getTime() - (2 * days + 2) * DAY_MS);

  // The same floor as an _id, for the three collections dated by createdAt,
  // none of which has an index on it. An ObjectId starts with the second it
  // was made and _id is always indexed, so a match bounded on _id reads only
  // the recent documents and not the whole collection. It is safe because
  // every User, Group and Expense is made with Model.create(), which makes the
  // _id and stamps createdAt at the same moment: the two agree to within a
  // second, and the two spare days in lowerBound absorb any drift.
  const floorId = mongoose.Types.ObjectId.createFromTime(Math.floor(lowerBound.getTime() / 1000));
  const signedInSince = new Date(now.getTime() - days * DAY_MS);
  const finished = { $and: [{ $eq: ['$status', 'done'] }, { $gt: ['$finishedAt', null] }] };

  let results;
  try {
    results = await Promise.all([
      User.aggregate([
        { $match: { ...APP_USERS, _id: { $gte: floorId }, createdAt: { $gte: lowerBound } } },
        { $group: { _id: { day: dayOf('$createdAt', tz) }, count: { $sum: 1 } } },
      ]),

      // One pipeline for the chart and for the split by type.
      Group.aggregate([
        { $match: { _id: { $gte: floorId }, createdAt: { $gte: lowerBound } } },
        {
          $group: {
            _id: { day: dayOf('$createdAt', tz), type: { $ifNull: ['$groupType', 'trip'] } },
            count: { $sum: 1 },
          },
        },
      ]),

      // Counts only, never a sum of `amount`: no model records a currency, so a
      // total across groups would be adding rupees to dollars.
      //
      // Dated by createdAt, which is when the expense was logged; `date` is
      // whatever day the person says it was paid. This is the collection that
      // keeps growing, and the _id floor is the only bound it is given.
      Expense.aggregate([
        { $match: { _id: { $gte: floorId } } },
        {
          $group: {
            _id: { day: dayOf('$createdAt', tz), category: { $ifNull: ['$category', 'general'] } },
            count: { $sum: 1 },
          },
        },
      ]),

      // This model has no timestamps; startedAt is its date, and is indexed.
      // Only a plan that was finished has a duration worth averaging: a failure
      // after two seconds says nothing about how long planning takes.
      ItineraryJob.aggregate([
        { $match: { startedAt: { $gte: lowerBound } } },
        {
          $group: {
            _id: { day: dayOf('$startedAt', tz), status: '$status', errorCode: '$errorCode' },
            count: { $sum: 1 },
            durationMs: { $sum: { $cond: [finished, { $subtract: ['$finishedAt', '$startedAt'] }, 0] } },
            timed: { $sum: { $cond: [finished, 1, 0] } },
            inputTokens: { $sum: { $ifNull: ['$usage.inputTokens', 0] } },
            outputTokens: { $sum: { $ifNull: ['$usage.outputTokens', 0] } },
          },
        },
      ]),

      // Every app user there is, in one pass. Relied on, and checked against
      // MongoDB 8: $eq with false is true only for a stored false, not for null
      // or a missing field; and both of those sort below every string and
      // every date, so $gt '' and $gte <date> are false for an account with no
      // googleId or no lastLoginAt, as $gt null is for a run with no finishedAt
      // above.
      User.aggregate([
        { $match: APP_USERS },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            google: { $sum: { $cond: [{ $gt: ['$googleId', ''] }, 1, 0] } },
            unverified: { $sum: { $cond: [{ $eq: ['$emailVerified', false] }, 1, 0] } },
            blocked: { $sum: { $cond: [{ $eq: ['$isActive', false] }, 1, 0] } },
            signedIn: { $sum: { $cond: [{ $gte: ['$lastLoginAt', signedInSince] }, 1, 0] } },
          },
        },
      ]),

      Group.estimatedDocumentCount(),
      Expense.estimatedDocumentCount(),
      ItineraryJob.estimatedDocumentCount(),

      // Not asked for at all unless it may be shown. App users only, so an
      // owner account can never turn up in front of a co-admin.
      //
      // Newest first by _id, not by createdAt: the _id index hands the accounts
      // over already in that order, so the read ends at the sixth app user
      // and nothing is sorted. The two orders are the same here because an _id
      // starts with the second its account was created (see floorId); only
      // accounts made within the same second could come out the other way
      // round.
      maySeeUsers(actor)
        ? User.find(APP_USERS)
            .select('name email avatar googleId emailVerified isActive createdAt')
            .sort({ _id: -1 })
            .limit(RECENT_USERS)
            .lean()
        : null,
    ]);
  } catch (err) {
    // The route lets through any zone this server's JavaScript knows, and
    // MongoDB keeps a list of its own: it is stricter about capitals and may
    // not have the newest zones. Its refusal is the caller's to fix, not a
    // server fault.
    if (err.code === UNKNOWN_TIME_ZONE) throw ApiError.badRequest('Unknown time zone');
    throw err;
  }

  const [
    userDays,
    groupDays,
    expenseDays,
    jobDays,
    [userSnapshot],
    groupCount,
    expenseCount,
    jobCount,
    recentUsers,
  ] = results;

  return buildDashboard(
    {
      userDays,
      groupDays,
      expenseDays,
      jobDays,
      userSnapshot,
      counts: { groups: groupCount, expenses: expenseCount, aiPlans: jobCount },
      recentUsers,
    },
    { days, tz, now }
  );
};

module.exports = { dayKeys, buildDashboard, getDashboard };
