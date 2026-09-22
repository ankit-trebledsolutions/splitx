const mongoose = require('mongoose');
const env = require('../config/env');
const ItineraryJob = require('../models/ItineraryJob');
const ItineraryDay = require('../models/ItineraryDay');
const Group = require('../models/Group');
const User = require('../models/User');
const Stay = require('../models/Stay');
const Attraction = require('../models/Attraction');
const ApiError = require('../utils/ApiError');
const AiError = require('../utils/AiError');
// Called as realtime.emitToGroup(...), never destructured, so tests can swap the functions.
const realtime = require('../realtime/socket');
const ai = require('./ai.service');
const groupService = require('./group.service');
const messageService = require('./message.service');
const notificationService = require('./notification.service');
const { buildFacts, MAX_DAYS } = require('./aiItinerary.prompt');
const { sanitizeItinerary } = require('./aiItinerary.sanitizer');

/**
 * AI itinerary planning as a background job.
 *
 * Planning takes about a minute, several times the app's request timeout, so
 * start() only checks and records the request and the controller answers 202.
 * run() then does the paid call and saves the days on its own. The app learns
 * the outcome from the `itinerary:ai` socket event, from polling getStatus()
 * and from a push; none of the three is relied on alone.
 *
 * A job always ends. A failed call, a bad answer, a member removed mid-way, a
 * deploy (abortLocalJobs) and a crashed server (reapStale) each close it with a
 * fixed, user-safe message, so the app's "AI is planning" state cannot hang.
 *
 * Nothing the model writes goes anywhere except itinerary days: chat lines and
 * notifications are built from our own data only.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_GROUP_SIZE = 50;
// A group location shorter than this ("-", "?") tells the AI nothing, so it counts as blank.
const MIN_DESTINATION_LENGTH = 2;

// All measured from the job's startedAt, on top of the per-attempt OpenAI
// timeout. The AI call itself gives up at +60 s (see ai.service). A swap of old
// days for new never starts after +75 s, and the reaper only treats a job as
// dead at +90 s, which leaves a started swap 15 s to finish undisturbed.
const SWAP_CUTOFF_MS = 75 * 1000;
const STALE_AFTER_MS = 90 * 1000;
const staleBefore = () => new Date(Date.now() - (env.openai.timeoutMs + STALE_AFTER_MS));

// The only failure text the app ever shows. Each one names something the
// person can actually do next.
const ERROR_MESSAGES = {
  AI_UNAVAILABLE: 'AI planner is unavailable right now. You can still add days by hand.',
  AI_BUSY: 'The AI planner is busy. Try again in a minute.',
  AI_TIMEOUT: 'That took longer than expected. Try again.',
  AI_STALE: 'That took longer than expected. Try again.',
  AI_REFUSED: 'AI could not plan this trip. Check the destination and your notes, then try again.',
  AI_BAD_DESTINATION: 'AI did not recognise that destination. Correct it and try again.',
  AI_TRUNCATED: 'The plan came out too long. Try a more relaxed pace.',
  AI_BAD_OUTPUT: 'AI returned a plan we could not read. Try again.',
  AI_CONFLICT: 'The itinerary changed while AI was planning. Nothing was replaced. Try again.',
  AI_CANCELLED: 'Planning was cancelled.',
  AI_FAILED: 'Something went wrong while planning. Try again.',
};

const CODE_BY_KIND = {
  AUTH: 'AI_UNAVAILABLE',
  QUOTA: 'AI_UNAVAILABLE',
  MODEL_NOT_FOUND: 'AI_UNAVAILABLE',
  RATE_LIMIT: 'AI_BUSY',
  SERVER: 'AI_BUSY',
  NETWORK: 'AI_BUSY',
  TIMEOUT: 'AI_TIMEOUT',
  REFUSED: 'AI_REFUSED',
  TRUNCATED: 'AI_TRUNCATED',
  BAD_DESTINATION: 'AI_BAD_DESTINATION',
  BAD_OUTPUT: 'AI_BAD_OUTPUT',
  EMPTY: 'AI_BAD_OUTPUT',
};
const codeFor = (kind) => CODE_BY_KIND[kind] ?? 'AI_FAILED';

// After these the destination itself is the likely culprit, so the app lets the
// requester correct it for the next run even though the group already has one.
const DESTINATION_FAILURES = ['AI_BAD_DESTINATION', 'AI_REFUSED'];

// Jobs this process is running, and the day swaps it is in the middle of, so a
// shutdown can finish or fail them instead of leaving them for the reaper.
const localJobs = new Set();
const swaps = new Set();
let shuttingDown = false;

// Null-safe: a day whose creator's account is gone has no createdBy to compare.
const sameId = (a, b) => a != null && b != null && String(a) === String(b);

const daysLabel = (count) => `${count} day${count === 1 ? '' : 's'}`;

const unavailable = () =>
  new ApiError(503, ERROR_MESSAGES.AI_UNAVAILABLE, { code: 'AI_UNAVAILABLE' });

const alreadyRunning = (job) =>
  new ApiError(409, 'AI is already planning this itinerary.', {
    code: 'AI_ALREADY_RUNNING',
    data: { job },
  });

// The Job shape of the API contract. Everything else on the row (the answers,
// the backup, token usage, billing) stays on the server.
const toClient = async (job) => {
  if (!job) return null;
  const requester = await User.findById(job.requestedBy).select('name').lean();
  return {
    _id: String(job._id),
    group: String(job.group),
    status: job.status,
    replace: job.replace,
    requestedBy: { _id: String(job.requestedBy), name: requester?.name ?? 'A member' },
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    dayCount: job.dayCount,
    errorCode: job.errorCode,
    errorMessage: job.errorMessage,
  };
};

// To the group room and to the requester directly: the creator of a brand-new
// group is not in its room until they open the group screen. Clients expect
// the duplicate and merge by job id.
const announce = (job, clientJob) => {
  const payload = { groupId: String(job.group), job: clientJob };
  realtime.emitToGroup(payload.groupId, 'itinerary:ai', payload);
  realtime.emitToUser(String(job.requestedBy), 'itinerary:ai', payload);
};

// Carries no days: every client refetches through the normal GET, which is
// always consistent.
const announceDays = (groupId) =>
  realtime.emitToGroup(String(groupId), 'itinerary:updated', { groupId: String(groupId) });

const latestJobOf = (groupId) => ItineraryJob.findOne({ group: groupId }).sort({ startedAt: -1 }).lean();

const locationOf = (group) => (group.location || '').trim();
const isLocationUsable = (group) => locationOf(group).length >= MIN_DESTINATION_LENGTH;
const isDestinationUnlocked = (latestJob) =>
  latestJob?.status === 'failed' && DESTINATION_FAILURES.includes(latestJob.errorCode);

/**
 * Settles what is being planned. The group's own values win; the requester's
 * typed ones only fill gaps, plus the destination while it is unlocked.
 *
 * `writeBack` is what the group should learn from this run. It is applied only
 * after the plan is saved, never here, so a typo that makes the AI fail cannot
 * lock itself in as the group's location.
 */
const resolveTrip = (group, prefs, latestJob) => {
  const groupLocation = locationOf(group);
  const typedWins = isDestinationUnlocked(latestJob) && Boolean(prefs.destination);
  const destination = typedWins || !isLocationUsable(group) ? prefs.destination : groupLocation;

  const totalDays = group.totalDays ?? prefs.days;
  const days = totalDays ? Math.min(MAX_DAYS, totalDays) : undefined;

  const missing = [];
  if (!destination) missing.push('destination');
  if (!days) missing.push('days');

  const writeBack = {};
  if (destination && destination !== groupLocation) writeBack.location = destination;
  if (group.startDate == null && prefs.startDate) writeBack.startDate = prefs.startDate;
  if (group.totalDays == null && days) writeBack.totalDays = days;

  return {
    missing,
    writeBack,
    resolved: {
      destination,
      startDate: group.startDate ?? prefs.startDate ?? null,
      days,
      groupSize: Math.min(MAX_GROUP_SIZE, prefs.groupSize ?? group.members.length),
      // The group's trip is longer than one run plans, so the last planned day
      // is an ordinary day, not the day everyone goes home.
      tripContinuesAfter: (group.totalDays ?? 0) > days,
    },
  };
};

// Seconds until enough counted jobs have aged out of the 24 hour window for one more to fit.
const retryAfterSeconds = (startedAts, cap, now = Date.now()) => {
  if (!startedAts.length) return DAY_MS / 1000;
  const oldestFirst = startedAts.map((at) => new Date(at).getTime()).sort((a, b) => a - b);
  // With exactly `cap` jobs counted that is the oldest; with more, the one
  // whose exit finally brings the count under the cap.
  const blocking = oldestFirst[Math.max(0, oldestFirst.length - Math.max(1, cap))];
  return Math.max(1, Math.ceil((blocking + DAY_MS - now) / 1000));
};

/**
 * Daily spend caps, counted from the job rows so they survive restarts and
 * hold across instances. A job counts when OpenAI may have charged for it:
 * running, done, or failed with `billed`. Failures that cost nothing (their
 * outage, a rate limit, our bad key) do not, so an OpenAI outage cannot lock
 * people out for the day.
 */
const assertWithinCaps = async (userId, groupId) => {
  const counted = {
    startedAt: { $gte: new Date(Date.now() - DAY_MS) },
    $or: [{ status: { $ne: 'failed' } }, { billed: true }],
  };
  const scopes = [
    {
      scope: 'user',
      filter: { requestedBy: userId },
      cap: env.openai.userDailyCap,
      message: "You have reached today's AI planning limit. Try again tomorrow.",
    },
    {
      scope: 'group',
      filter: { group: groupId },
      cap: env.openai.groupDailyCap,
      message: "This group has reached today's AI planning limit. Try again tomorrow.",
    },
  ];
  for (const { scope, filter, cap, message } of scopes) {
    // eslint-disable-next-line no-await-in-loop
    const jobs = await ItineraryJob.find({ ...filter, ...counted }).select('startedAt').lean();
    if (jobs.length >= cap) {
      const retryAfter = retryAfterSeconds(jobs.map((job) => job.startedAt), cap);
      throw new ApiError(429, message, { code: 'AI_LIMIT', data: { retryAfter, scope } });
    }
  }
  // The whole server's budget. Nothing the person can wait out, so it reads as "unavailable".
  if ((await ItineraryJob.countDocuments(counted)) >= env.openai.globalDailyCap) throw unavailable();
};

// True when every write the driver refused was refused for a duplicate key.
const isDuplicateOnly = (err) => (err.writeErrors ?? [err]).every((writeError) => writeError.code === 11000);

/**
 * Puts back the days a replace deleted, if this job got that far. Safe to call
 * more than once and from any instance: it only inserts what is missing.
 *
 * Throws when the days could not be put back for any reason other than their
 * day number being taken. Callers must then leave the job, and the backup on
 * it, alone: closing the job deletes the only copy of the old itinerary.
 */
const restoreBackup = async (job) => {
  if (!job.backupDays) return;
  await ItineraryDay.deleteMany({ _id: { $in: job.newDayIds ?? [] } });
  const present = await ItineraryDay.find({ group: job.group }).distinct('_id');
  const missing = job.backupDays.filter((day) => !present.some((id) => sameId(id, day._id)));
  if (missing.length) {
    try {
      // The driver's insert, not Mongoose's: the days go back exactly as they
      // were, with their ids, timestamps and activity ids.
      await ItineraryDay.collection.insertMany(missing, { ordered: false });
    } catch (err) {
      if (!isDuplicateOnly(err)) throw err;
      // A duplicate day number means a member added that day by hand after the
      // write guard expired. Theirs stays; the rest are back.
      console.error(`[ai] job ${job._id}: could not restore every day:`, err.message);
    }
  }
  announceDays(job.group);
};

const billingFields = ({ billed, usage, aiModel } = {}) => ({
  ...(billed !== undefined ? { billed } : {}),
  ...(usage ? { usage } : {}),
  ...(aiModel ? { aiModel } : {}),
});

/**
 * Closes a running job as failed and tells the requester. Does nothing when the
 * job is no longer running: whoever finished it first has already told
 * everyone, and a "failed" must never follow a plan that was saved.
 */
const fail = async (jobId, errorCode, billing = {}) => {
  const job = await ItineraryJob.findById(jobId).lean();
  if (!job || job.status !== 'running') return;
  await restoreBackup(job);

  const failed = await ItineraryJob.findOneAndUpdate(
    { _id: jobId, status: 'running' },
    {
      $set: {
        status: 'failed',
        errorCode,
        errorMessage: ERROR_MESSAGES[errorCode],
        finishedAt: new Date(),
        ...billingFields(billing),
      },
      $unset: { backupDays: '', newDayIds: '' },
    },
    { new: true }
  ).lean();
  if (!failed) return;

  announce(failed, await toClient(failed));
  // Cancelled means the requester was removed or the group is gone. They have
  // already been told that, and a push would deep-link into a group they lost.
  if (errorCode === 'AI_CANCELLED') return;
  // Only the requester hears about a failure: no chat line, no group notification.
  await notificationService.notifyUser({
    userId: failed.requestedBy,
    groupId: failed.group,
    type: 'itinerary',
    title: 'Could not create itinerary',
    body: failed.errorMessage,
  });
};

/**
 * Fails jobs whose server died mid-run, restoring any half-done replace first.
 * Runs on boot and before every status read and start, so a dead job is never
 * what stops the next one. Silent: the app has long since timed out on its own
 * and the requester has moved on.
 */
const reapStale = async (extraFilter = {}) => {
  const stale = await ItineraryJob.find({
    ...extraFilter,
    status: 'running',
    startedAt: { $lt: staleBefore() },
  }).lean();

  for (const job of stale) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await restoreBackup(job);
    } catch (err) {
      // Left running, backup intact, for the next reap to try again.
      console.error(`[ai] job ${job._id}: backup restore failed:`, err.message);
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    await ItineraryJob.updateOne(
      { _id: job._id, status: 'running' },
      {
        $set: {
          status: 'failed',
          errorCode: 'AI_STALE',
          errorMessage: ERROR_MESSAGES.AI_STALE,
          finishedAt: new Date(),
          // Nobody knows how far the dead server got, so assume OpenAI charged.
          billed: true,
        },
        $unset: { backupDays: '', newDayIds: '' },
      }
    );
  }
};

/**
 * The write guard: while AI is planning a group's itinerary nobody edits it by
 * hand, or the plan would land on top of (or wipe) their change. Looks only at
 * jobs young enough to be alive, so a crashed one stops blocking edits by
 * itself even if nothing has run the reaper.
 */
const assertNotGenerating = async (groupId) => {
  const running = await ItineraryJob.exists({
    group: groupId,
    status: 'running',
    startedAt: { $gte: staleBefore() },
  });
  if (running) {
    throw new ApiError(409, 'AI is planning this itinerary. Try again in a moment.', {
      code: 'AI_GENERATING',
    });
  }
};

const getStatus = async (groupId, userId) => {
  const group = await groupService.getGroupForMember(groupId, userId);
  await reapStale({ group: groupId });
  const [latest, mine] = await Promise.all([
    latestJobOf(groupId),
    ItineraryJob.findOne({ group: groupId, requestedBy: userId })
      .sort({ startedAt: -1 })
      .select('prefs')
      .lean(),
  ]);
  return {
    configured: ai.isConfigured(),
    job: await toClient(latest),
    // The caller's own last answers, so the form opens the way they left it.
    lastPrefs: mine?.prefs ?? null,
    // Decided here so the app never re-implements the rule.
    destinationEditable: !isLocationUsable(group) || isDestinationUnlocked(latest),
    // The app judges how old `finishedAt` is against this, never against the phone's clock.
    serverNow: new Date(),
  };
};

/**
 * Checks a planning request and records it as a running job. Gates run cheapest
 * first and none of them costs money. Nothing is written to the group here.
 * Resolves to the client Job; the controller answers 202 and calls run().
 */
const start = async (userId, groupId, body) => {
  if (!ai.isConfigured()) {
    throw new ApiError(503, 'AI itinerary planning is not set up on the server yet.', {
      code: 'AI_NOT_CONFIGURED',
    });
  }
  // A job started during shutdown would die with the process a moment later.
  if (ai.isBreakerOpen() || shuttingDown) throw unavailable();

  const group = await groupService.getGroupForMember(groupId, userId);
  if (group.groupType !== 'trip') {
    throw new ApiError(400, 'AI itineraries are only available for trip groups.', {
      code: 'AI_TRIP_ONLY',
    });
  }

  await reapStale({ group: groupId });
  const latest = await latestJobOf(groupId);
  if (latest?.status === 'running') throw alreadyRunning(await toClient(latest));

  const { replace, ...answers } = body;
  const prefs = { ...answers, interests: [...new Set(answers.interests)] };
  const { resolved, writeBack, missing } = resolveTrip(group, prefs, latest);
  if (missing.length) {
    throw new ApiError(400, 'Add a destination and the number of days before planning.', {
      code: 'AI_TRIP_DETAILS_REQUIRED',
      data: { missing },
    });
  }

  const existing = await ItineraryDay.find({ group: groupId }).select('createdBy').lean();
  if (existing.length && !replace) {
    throw new ApiError(409, 'This group already has an itinerary.', {
      code: 'ITINERARY_EXISTS',
      data: { dayCount: existing.length },
    });
  }
  // Same rule as deleting a day: replacing deletes every one of them.
  const mayReplace =
    sameId(group.adminId, userId) || existing.every((day) => sameId(day.createdBy, userId));
  if (!mayReplace) {
    throw new ApiError(
      403,
      'Only the group admin, or the member who added every existing day, can replace the itinerary.',
      { code: 'AI_REPLACE_FORBIDDEN' }
    );
  }

  await assertWithinCaps(userId, groupId);

  let job;
  try {
    job = await ItineraryJob.create({
      group: groupId,
      requestedBy: userId,
      replace,
      prefs,
      resolved,
      writeBack,
    });
  } catch (err) {
    if (err.code !== 11000) throw err;
    // Two requests passed the checks together; the unique index let one through.
    throw alreadyRunning(await toClient(await latestJobOf(groupId)));
  }

  try {
    const clientJob = await toClient(job);
    announce(job, clientJob);
    return clientJob;
  } catch (err) {
    // A row left "running" with nobody working on it would block the group for minutes.
    await fail(job._id, 'AI_FAILED');
    throw err;
  }
};

/**
 * Swaps the plan in and marks the job done, as one unit that a shutdown waits
 * for. Resolves to the finished job, or null when it has been failed or taken
 * over by someone else (they have told everyone what they needed to).
 *
 * No transactions: a standalone mongod has none. Instead a replace first copies
 * the old days onto the job row, where fail() and the reaper can find them, so
 * a crash at any point below ends with the old itinerary back in place.
 */
const savePlan = async (job, snapshot, docs, billing) => {
  // Checked in the same tick that run() registers this promise in `swaps`, so a
  // shutdown either sees the swap and waits for it, or the swap never starts.
  if (shuttingDown) {
    await fail(job._id, 'AI_FAILED', billing);
    return null;
  }
  const newDayIds = docs.map((doc) => doc._id);

  if (snapshot.length) {
    const backedUp = await ItineraryJob.updateOne(
      { _id: job._id, status: 'running' },
      { $set: { backupDays: snapshot, newDayIds } }
    );
    if (backedUp.matchedCount !== 1) return null;
    try {
      await ItineraryDay.deleteMany({ group: job.group });
      await ItineraryDay.insertMany(docs);
    } catch (err) {
      console.error(`[ai] job ${job._id}: replacing the itinerary failed:`, err.message);
      await fail(job._id, 'AI_CONFLICT', billing);
      return null;
    }
  } else {
    try {
      await ItineraryDay.insertMany(docs);
    } catch (err) {
      console.error(`[ai] job ${job._id}: saving the itinerary failed:`, err.message);
      await ItineraryDay.deleteMany({ _id: { $in: newDayIds } });
      await fail(job._id, 'AI_CONFLICT', billing);
      return null;
    }
  }

  // Only now does the group learn what the requester typed (a missing
  // destination, start date or length). Without touching updatedAt, which
  // orders the group list: planning is not activity in the group.
  if (Object.keys(job.writeBack ?? {}).length) {
    try {
      await Group.updateOne({ _id: job.group }, { $set: job.writeBack }, { timestamps: false });
    } catch (err) {
      console.error(`[ai] job ${job._id}: could not update the group's trip details:`, err.message);
    }
  }

  const done = await ItineraryJob.findOneAndUpdate(
    { _id: job._id, status: 'running' },
    {
      $set: { status: 'done', dayCount: docs.length, finishedAt: new Date(), ...billingFields(billing) },
      $unset: { backupDays: '', newDayIds: '' },
    },
    { new: true }
  ).lean();
  if (!done) console.error(`[ai] job ${job._id} was closed by someone else while its days were being saved`);
  return done;
};

// Each step on its own: a chat or push hiccup must not stop the others, and
// must never turn a saved plan into a "failed" job.
const tellGroup = async ({ job, groupName, requesterName, replaced }) => {
  const steps = {
    // First: the app fills the Itinerary tab from these, and a member watching
    // the cloud animation should not wait on push delivery to see their plan.
    'socket events': async () => {
      announceDays(job.group);
      announce(job, await toClient(job));
    },
    'chat line': () =>
      messageService.postSystem(
        job.group,
        replaced
          ? `${requesterName} replanned the itinerary with AI (${daysLabel(job.dayCount)})`
          : `${requesterName} planned a ${job.dayCount}-day itinerary with AI`
      ),
    'group notification': () =>
      notificationService.notifyGroup({
        groupId: job.group,
        actorId: job.requestedBy,
        type: 'itinerary',
        title: 'Itinerary Ready',
        body: `${requesterName} planned a ${job.dayCount}-day itinerary for "${groupName}" with AI.`,
      }),
    // notifyGroup skips the actor, and the requester may have left the app by now.
    'requester notification': () =>
      notificationService.notifyUser({
        userId: job.requestedBy,
        groupId: job.group,
        type: 'itinerary',
        title: 'Your itinerary is ready',
        body: `AI planned ${daysLabel(job.dayCount)} for "${groupName}". Tap to review and edit.`,
      }),
  };
  for (const [label, step] of Object.entries(steps)) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await step();
    } catch (err) {
      console.error(`[ai] job ${job._id}: ${label} failed:`, err.message);
    }
  }
};

/**
 * Does the work of one job: the paid call, the clean-up of its answer, and the
 * save. Never awaited by a request. Whatever goes wrong, the job is closed.
 */
const run = async (jobId) => {
  const key = String(jobId);
  localJobs.add(key);
  // What is known so far about the cost, so a late failure still counts towards the caps.
  let billing = {};
  try {
    const job = await ItineraryJob.findById(jobId).lean();
    if (!job || job.status !== 'running') return;

    const [stays, attractions] = await Promise.all([
      Stay.find({ group: job.group }).lean(),
      Attraction.find({ group: job.group }).lean(),
    ]);
    const facts = buildFacts({ resolved: job.resolved, prefs: job.prefs, stays, attractions });

    let days;
    try {
      const result = await ai.generateItinerary({
        facts,
        dayCount: job.resolved.days,
        userId: job.requestedBy,
      });
      billing = { billed: true, usage: result.usage, aiModel: result.aiModel };
      days = sanitizeItinerary(result.data, {
        dayCount: job.resolved.days,
        startDate: job.resolved.startDate,
      });
    } catch (err) {
      if (!(err instanceof AiError)) throw err;
      // A sanitizer error knows nothing about tokens; what the call reported still stands.
      await fail(jobId, codeFor(err.kind), {
        billed: err.billed,
        usage: err.usage ?? billing.usage,
        aiModel: err.aiModel ?? billing.aiModel,
      });
      return;
    }

    // A minute has passed. Look again before touching anyone's itinerary.
    const current = await ItineraryJob.findById(jobId).select('status').lean();
    // Reaped, or failed by a shutdown: they have dealt with it.
    if (current?.status !== 'running') return;
    if (shuttingDown) {
      await fail(jobId, 'AI_FAILED', billing);
      return;
    }
    if (Date.now() - new Date(job.startedAt).getTime() > env.openai.timeoutMs + SWAP_CUTOFF_MS) {
      await fail(jobId, 'AI_TIMEOUT', billing);
      return;
    }
    const group = await Group.findById(job.group).select('name members').populate('members', 'name');
    const requester = group?.members.find((member) => sameId(member._id, job.requestedBy));
    if (!requester) {
      await fail(jobId, 'AI_CANCELLED', billing);
      return;
    }
    const snapshot = await ItineraryDay.find({ group: job.group }).lean();
    // The group had no days when this plan was asked for without `replace`.
    // Someone's hand-made days are not ours to overwrite.
    if (!job.replace && snapshot.length) {
      await fail(jobId, 'AI_CONFLICT', billing);
      return;
    }

    const docs = days.map((day) => ({
      _id: new mongoose.Types.ObjectId(),
      group: job.group,
      createdBy: job.requestedBy,
      ...day,
    }));
    const saving = savePlan(job, snapshot, docs, billing);
    swaps.add(saving);
    let done;
    try {
      done = await saving;
    } finally {
      swaps.delete(saving);
    }
    if (!done) return;

    await tellGroup({
      job: done,
      groupName: group.name,
      requesterName: requester.name,
      replaced: snapshot.length > 0,
    });
  } catch (err) {
    console.error(`[ai] job ${key} crashed:`, err);
    await fail(jobId, 'AI_FAILED', billing).catch((failErr) =>
      console.error(`[ai] job ${key} could not be closed:`, failErr.message)
    );
  } finally {
    localJobs.delete(key);
  }
};

/**
 * Called on shutdown (a deploy). Lets a swap that is under way finish, then
 * fails whatever else this process was running, so requesters hear at once
 * instead of watching the animation until the reaper catches up.
 */
const abortLocalJobs = async () => {
  shuttingDown = true;
  await Promise.allSettled([...swaps]);
  await Promise.allSettled([...localJobs].map((id) => fail(id, 'AI_FAILED')));
};

// Tests only: abortLocalJobs() is otherwise the last thing a process does.
const resetShutdown = () => {
  shuttingDown = false;
};

module.exports = {
  getStatus,
  start,
  run,
  fail,
  restoreBackup,
  reapStale,
  assertNotGenerating,
  abortLocalJobs,
  toClient,
  codeFor,
  retryAfterSeconds,
  resolveTrip,
  resetShutdown,
  ERROR_MESSAGES,
};
