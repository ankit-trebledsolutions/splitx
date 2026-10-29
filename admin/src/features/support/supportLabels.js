// How the panel names what the server stores about a report. The keys are the
// server's (backend/src/models/SupportReport.js); the words and colours are
// the panel's, kept in one place so a status reads the same in the queue, on
// a report and on the dashboard.

export const CATEGORIES = [
  { key: 'bug', label: 'Bug' },
  { key: 'feature', label: 'Feature request' },
  { key: 'payment', label: 'Expense or payment' },
  { key: 'account', label: 'Account or login' },
  { key: 'abuse', label: 'User or group' },
  { key: 'general', label: 'General' },
];

// Open is coloured as something waiting, in progress as something being done,
// resolved as done, closed as put away.
export const STATUSES = [
  { key: 'open', label: 'Open', variant: 'warning' },
  { key: 'in_progress', label: 'In progress', variant: 'info' },
  { key: 'resolved', label: 'Resolved', variant: 'success' },
  { key: 'closed', label: 'Closed', variant: 'secondary' },
];

export const PRIORITIES = [
  { key: 'low', label: 'Low', variant: 'secondary' },
  { key: 'normal', label: 'Normal', variant: 'outline' },
  { key: 'high', label: 'High', variant: 'destructive' },
];

const byKey = (list, key, fallback) =>
  list.find((entry) => entry.key === key) ?? fallback;

// An unknown or missing value reads as the server's own default for it.
export const categoryOf = (key) => byKey(CATEGORIES, key, CATEGORIES[5]);
export const statusOf = (key) => byKey(STATUSES, key, STATUSES[0]);
export const priorityOf = (key) => byKey(PRIORITIES, key, PRIORITIES[1]);

/**
 * Who sent a report, for the row and the reporter card.
 *
 * The server sends the account populated. An older Contact Us row carries the
 * name and address typed into the form, which is what there is when nothing
 * else was kept; `known` says whether there is an account to point at.
 */
export const reporterOf = (report) => {
  const user = report?.user;
  if (user && typeof user === 'object') {
    return {
      known: true,
      id: user._id,
      name: user.name || 'Unnamed account',
      email: user.email || '',
      username: user.username || '',
      avatar: user.avatar || null,
      isActive: user.isActive !== false,
    };
  }
  return {
    known: false,
    id: null,
    name: report?.name || 'Unknown account',
    email: report?.email || '',
    username: '',
    avatar: null,
    isActive: true,
  };
};

// 14 Oct 2026, 09:30
export const formatWhen = (value) =>
  value
    ? new Intl.DateTimeFormat('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(value))
    : '';

export const plural = (count, one, many) => (count === 1 ? one : many);
