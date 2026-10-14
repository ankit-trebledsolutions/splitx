const SupportReport = require('../models/SupportReport');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const storage = require('../storage');
const notificationService = require('./notification.service');

const { STATUSES, MAX_ATTACHMENTS } = SupportReport;

/**
 * Reports people send from the app, and what the admin panel does with them.
 *
 * Two views of the same document. The person who sent a report sees what they
 * wrote, where it stands, and the replies written for them. The panel sees
 * all of that plus the notes admins leave each other, the priority, and who
 * the reporter is. `present` is the one place that decides which is which, so
 * no route can hand an internal note to the app by picking the wrong fields.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
// Reports one person may send in a rolling day. Plenty for anyone with a
// problem; a brake on a script, or a grudge.
const DAILY_CAP = 10;
// How many of their own reports the app is sent. Nobody has more that matter.
const MINE_LIMIT = 50;
// When the queue is searched by a person's name, how many matching people are
// looked up: a search for "a" must not become a query over every account.
const SEARCH_PEOPLE = 200;
// What the panel is told about the reporter. No phone: it is private, and the
// panel's user screen is where someone with that access would look anyway.
const REPORTER_FIELDS = 'name email avatar username isActive';

// A search term goes into a RegExp, so its metacharacters must be inert.
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Cut to fit a notification without chopping a word in half where it can.
const shorten = (text, max) => {
  const value = String(text || '').trim();
  if (value.length <= max) return value;
  let cut = value.slice(0, max - 1);
  // Back up to the last whole word, unless the cut already ends on one or
  // backing up would throw away most of the room.
  if (!/\s/.test(value[max - 1])) {
    const space = cut.lastIndexOf(' ');
    if (space > max / 2) cut = cut.slice(0, space);
  }
  return `${cut.trimEnd()}…`;
};

// Events the reporter may see. Notes are between admins; a priority is how the
// team orders its own work, not a judgement on the person.
const VISIBLE_KINDS = new Set(['reply', 'status']);

/**
 * One report as a client sees it.
 *
 * `forAdmin` adds what is the panel's business: the admin-only notes, the
 * priority and the reporter. Storage keys never leave the server either way;
 * `toJSON` on the model strips them from documents, and this strips them
 * from lean rows, which bypass toJSON.
 */
const present = (doc, { forAdmin = false } = {}) => {
  const report = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  const events = (report.events || []).filter((event) => forAdmin || VISIBLE_KINDS.has(event.kind));
  const attachments = (report.attachments || []).map(({ storageKey, ...file }) => file);

  const shared = {
    _id: report._id,
    category: report.category || 'general',
    subject: report.subject,
    message: report.message,
    attachments,
    status: report.status || 'open',
    device: report.device || {},
    events,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
  };
  if (!forAdmin) return shared;

  return {
    ...shared,
    priority: report.priority || 'normal',
    // A populated reporter, or just their id when nothing populated it.
    user: report.user,
    // Older Contact Us rows carry what was typed into the form.
    name: report.name,
    email: report.email,
    // Shown in the queue so an admin can see at a glance what has been said.
    replies: events.filter((event) => event.kind === 'reply').length,
    notes: events.filter((event) => event.kind === 'note').length,
  };
};

// Tell the reporter something about their report, in-app and on the phone.
// notifyUser never throws: a push hiccup must not fail the admin's action.
const tell = (report, { title, body }) => {
  const userId = report.user?._id ?? report.user;
  return notificationService.notifyUser({
    userId,
    type: 'support',
    title,
    body: shorten(body, 300),
    entityId: report._id,
  });
};

// What the person is told when an admin moves their report on.
const statusWords = (report) => {
  const subject = shorten(report.subject, 60);
  return {
    open: {
      title: 'Your report was reopened',
      body: `"${subject}" is open again and back with the team.`,
    },
    in_progress: {
      title: 'Your report is being looked at',
      body: `Someone on the team is now working on "${subject}".`,
    },
    resolved: {
      title: 'Your report was resolved',
      body: `"${subject}" has been marked resolved. Open it to see what was done.`,
    },
    closed: {
      title: 'Your report was closed',
      body: `"${subject}" has been closed.`,
    },
  }[report.status];
};

// --- The app ----------------------------------------------------------------

/**
 * A new report. `files` are multer memory files, the screenshots the person
 * attached. They are stored first and taken out of storage again if the report
 * itself cannot then be saved, so no file is left that nothing points to.
 */
const createReport = async (user, { category, subject, message, device = {} }, files = []) => {
  if (files.length > MAX_ATTACHMENTS) {
    throw ApiError.badRequest(`Attach up to ${MAX_ATTACHMENTS} screenshots`);
  }

  const sentToday = await SupportReport.countDocuments({
    user: user._id,
    createdAt: { $gte: new Date(Date.now() - DAY_MS) },
  });
  if (sentToday >= DAILY_CAP) {
    throw new ApiError(429, 'You have sent a lot of reports today. Please try again tomorrow.', {
      code: 'SUPPORT_DAILY_CAP',
    });
  }

  const folder = `splix/support/${user._id}`;
  const uploads = await Promise.allSettled(files.map((file) => storage.upload(file, { folder })));
  const stored = uploads.filter((u) => u.status === 'fulfilled').map((u) => u.value);
  const discard = () => Promise.all(stored.map((s) => storage.remove(s.key, s.provider)));

  const failed = uploads.find((u) => u.status === 'rejected');
  if (failed) {
    await discard();
    throw failed.reason;
  }

  try {
    const report = await SupportReport.create({
      user: user._id,
      category,
      subject,
      message,
      device,
      attachments: stored.map((file, index) => ({
        url: file.url,
        thumbUrl: file.thumbUrl,
        mimeType: files[index].mimetype,
        size: files[index].size,
        storageProvider: file.provider,
        storageKey: file.key,
      })),
    });
    return present(report);
  } catch (err) {
    await discard();
    throw err;
  }
};

const listMine = async (userId) => {
  const reports = await SupportReport.find({ user: userId })
    .sort({ createdAt: -1 })
    .limit(MINE_LIMIT)
    .lean();
  return reports.map((report) => present(report));
};

// "Not found" rather than "not yours": a 403 would confirm the id exists.
const getMine = async (id, userId) => {
  const report = await SupportReport.findById(id).lean();
  if (!report || String(report.user) !== String(userId)) throw ApiError.notFound('Report not found');
  return present(report);
};

// Everything a person sent, with the screenshots behind it, when their account
// is deleted. Files first: a row that is gone cannot say where its files were.
const removeForUser = async (userId) => {
  const reports = await SupportReport.find({ user: userId, 'attachments.0': { $exists: true } })
    .select('+attachments.storageKey')
    .lean();
  for (const report of reports) {
    for (const file of report.attachments) {
      if (file.storageKey) {
        // eslint-disable-next-line no-await-in-loop
        await storage.remove(file.storageKey, file.storageProvider);
      }
    }
  }
  await SupportReport.deleteMany({ user: userId });
};

// --- The admin panel --------------------------------------------------------

// The queue's filter. Exported so the search rule can be tested on its own.
// `people` are the ids of reporters whose name or email matched the search.
const buildQueueQuery = ({ status, category, search }, people = []) => {
  const query = {};
  if (status) query.status = status;
  if (category) query.category = category;
  const term = (search || '').trim();
  if (term) {
    const pattern = new RegExp(escapeRegex(term), 'i');
    query.$or = [{ subject: pattern }, { user: { $in: people } }];
  }
  return query;
};

const listQueue = async ({ status, category, search, page, limit }) => {
  const term = (search || '').trim();
  const people = term
    ? await User.find({
        $or: [
          { name: new RegExp(escapeRegex(term), 'i') },
          { email: new RegExp(escapeRegex(term), 'i') },
        ],
      })
        .select('_id')
        .limit(SEARCH_PEOPLE)
        .lean()
    : [];
  const query = buildQueueQuery({ status, category, search }, people.map((p) => p._id));

  const [reports, total] = await Promise.all([
    SupportReport.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('user', REPORTER_FIELDS)
      .lean(),
    SupportReport.countDocuments(query),
  ]);

  return {
    reports: reports.map((report) => present(report, { forAdmin: true })),
    total,
    page,
    limit,
    pages: Math.max(1, Math.ceil(total / limit)),
  };
};

// How many reports stand in each status, for the badge beside the menu entry
// and the tile on the dashboard. `pending` is what still needs someone.
const summary = async () => {
  const rows = await SupportReport.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]);
  const counts = Object.fromEntries(STATUSES.map((status) => [status, 0]));
  for (const row of rows) {
    // A row with no status stored is read as open, as the schema default says.
    const status = row._id in counts ? row._id : 'open';
    counts[status] += row.count;
  }
  return {
    ...counts,
    pending: counts.open + counts.in_progress,
    total: Object.values(counts).reduce((sum, count) => sum + count, 0),
  };
};

const getForAdmin = async (id) => {
  const report = await SupportReport.findById(id).populate('user', REPORTER_FIELDS).lean();
  if (!report) throw ApiError.notFound('Report not found');
  return present(report, { forAdmin: true });
};

// A report as a document, for the changes below to push onto and save.
const load = async (id) => {
  const report = await SupportReport.findById(id).populate('user', REPORTER_FIELDS);
  if (!report) throw ApiError.notFound('Report not found');
  return report;
};

const stamp = (actor) => ({ by: actor._id, byName: actor.name });

// Names the state rather than toggling it, like everything else in the panel:
// setting a status the report already has changes nothing and tells nobody.
const setStatus = async (id, status, actor) => {
  const report = await load(id);
  if (report.status !== status) {
    report.status = status;
    report.events.push({ kind: 'status', status, ...stamp(actor) });
    await report.save();
    await tell(report, statusWords(report));
  }
  return present(report, { forAdmin: true });
};

// Priority is the team's own ordering, so the reporter is not told about it.
const setPriority = async (id, priority, actor) => {
  const report = await load(id);
  if (report.priority !== priority) {
    report.priority = priority;
    report.events.push({ kind: 'priority', priority, ...stamp(actor) });
    await report.save();
  }
  return present(report, { forAdmin: true });
};

/**
 * A reply the person sees, or (`internal`) a note only admins see. Answering
 * a report nobody had picked up moves it to In progress, since somebody now
 * has; a note does not, and a reply to a resolved or closed report leaves it
 * where it is.
 */
const addReply = async (id, { body, internal = false }, actor) => {
  const report = await load(id);
  report.events.push({ kind: internal ? 'note' : 'reply', body, ...stamp(actor) });
  if (!internal && report.status === 'open') {
    report.status = 'in_progress';
    report.events.push({ kind: 'status', status: 'in_progress', ...stamp(actor) });
  }
  await report.save();
  if (!internal) {
    await tell(report, {
      title: `Reply to "${shorten(report.subject, 60)}"`,
      body: shorten(body, 140),
    });
  }
  return present(report, { forAdmin: true });
};

module.exports = {
  DAILY_CAP,
  present,
  shorten,
  buildQueueQuery,
  createReport,
  listMine,
  getMine,
  removeForUser,
  listQueue,
  summary,
  getForAdmin,
  setStatus,
  setPriority,
  addReply,
};
