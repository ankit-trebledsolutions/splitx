// What a report can be about, and where it can stand. The values are the
// server's (backend/src/models/SupportReport.js); the words are the app's.

export const REPORT_CATEGORIES = [
  { value: 'bug', label: 'Bug', icon: 'bug-outline' },
  { value: 'feature', label: 'Idea', icon: 'bulb-outline' },
  { value: 'payment', label: 'Expense or payment', icon: 'card-outline' },
  { value: 'account', label: 'Account or login', icon: 'person-circle-outline' },
  { value: 'abuse', label: 'A user or group', icon: 'flag-outline' },
  { value: 'general', label: 'Something else', icon: 'chatbubble-ellipses-outline' },
];

export const REPORT_STATUSES = {
  open: { label: 'Open', tint: '#F5B342', hint: "We've got it and will look soon." },
  in_progress: { label: 'In progress', tint: '#4A7DF7', hint: 'Someone on the team is on it.' },
  resolved: { label: 'Resolved', tint: '#17E695', hint: 'This has been dealt with.' },
  closed: { label: 'Closed', tint: '#8A97A6', hint: 'This report has been closed.' },
};

// Screenshots one report may carry, matching the server.
export const MAX_SCREENSHOTS = 3;

export const categoryLabel = (value) =>
  REPORT_CATEGORIES.find((category) => category.value === value)?.label ?? 'Something else';

export const statusOf = (value) => REPORT_STATUSES[value] ?? REPORT_STATUSES.open;

// The latest thing the team wrote back, if anything.
export const lastReply = (report) =>
  [...(report?.events ?? [])].reverse().find((event) => event.kind === 'reply') ?? null;
