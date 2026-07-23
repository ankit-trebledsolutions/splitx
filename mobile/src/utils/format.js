export const formatMoney = (amount, currency = '₹') =>
  `${currency}${Math.abs(amount).toFixed(2)}`;

export const formatDate = (value) =>
  new Date(value).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

export const usd = (amount = 0) =>
  `$${Math.abs(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export const formatTime = (value) =>
  new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

const sameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

// "TODAY · AUG 15" / "YESTERDAY · AUG 14" / "AUG 12"
export const formatDayDivider = (value) => {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const stamp = date
    .toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    .toUpperCase();

  if (sameDay(date, today)) return `TODAY · ${stamp}`;
  if (sameDay(date, yesterday)) return `YESTERDAY · ${stamp}`;
  return stamp;
};

// "Aug 16, 2025 at 10:00 AM"
export const formatDateTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return `${date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })} at ${formatTime(date)}`;
};

export const isToday = (value) => value && sameDay(new Date(value), new Date());

export const initials = (name = '') =>
  name
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
