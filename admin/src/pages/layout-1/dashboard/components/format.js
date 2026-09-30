// How the dashboard writes its numbers. Kept in one place so a count reads the
// same on a tile, in a legend and in a tooltip.

const whole = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

// A field the server left out counts as nothing. Every figure on the page goes
// through here first, so a missing one prints "0" and never "NaN".
export const toCount = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

// 1,234
export const formatNumber = (value) => whole.format(toCount(value));

// 1,234 up to 9,999, then 12.9K: past that point the last digits are noise on
// a tile, and the exact figure is still there in the title.
export const formatCompact = (value) => {
  const number = toCount(value);
  return Math.abs(number) >= 10000
    ? compact.format(number)
    : whole.format(number);
};

// A whole percentage, or null when there is nothing to take a share of.
export const percentOf = (part, total) => {
  const all = toCount(total);
  return all > 0 ? Math.round((toCount(part) / all) * 100) : null;
};

// How far `current` is above or below `previous`, as a whole percentage. Null
// when the earlier period had none: growth from zero has no percentage.
export const changePercent = (current, previous) => {
  const before = toCount(previous);
  return before > 0
    ? Math.round(((toCount(current) - before) / before) * 100)
    : null;
};

// +12%, −12%, 0%. A real minus sign, which a screen reader says out loud.
export const formatSigned = (percent) => {
  if (percent > 0) return `+${formatNumber(percent)}%`;
  if (percent < 0) return `−${formatNumber(Math.abs(percent))}%`;
  return '0%';
};

// How many times the earlier figure `current` is, as a whole number, once it
// is ten times or more. Null below that, and when the earlier period had none.
// Growth from a handful has no readable percentage: 105 against 1 comes out
// as "+10,400%", where "105 times" is what happened.
export const changeMultiple = (current, previous) => {
  const before = toCount(previous);
  const times = before > 0 ? toCount(current) / before : 0;
  return times >= 10 ? Math.round(times) : null;
};

// What the badge says about a change: 105× from ten times upward, +12%, −12%
// or 0% below that. Null when the earlier period had none.
export const formatChange = (current, previous) => {
  const multiple = changeMultiple(current, previous);
  if (multiple !== null) return `${formatNumber(multiple)}×`;

  const percent = changePercent(current, previous);
  return percent === null ? null : formatSigned(percent);
};

// The y-axis for a chart whose tallest day is `peak`: where it ends and how
// many steps it takes to get there. Counts are whole, so the steps are too,
// and they come off the 1, 2, 2.5, 5 ladder so the labels are numbers a person
// would have picked: 0, 50, 100, 150 for a peak of 101, and not 0, 26, 52, 78,
// 104. The step is the first on the ladder that covers the peak in four, and
// the axis stops at the first line at or above the peak, so it can be shorter
// than four steps but never shorter than the data.
export const axisScale = (peak) => {
  const top = toCount(peak);
  const raw = Math.max(1, top / 4);
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10]
    .map((multiplier) => multiplier * magnitude)
    .find((candidate) => Number.isInteger(candidate) && candidate >= raw);

  // Up to a peak of 4 the step is a single count and all four are kept: an
  // axis that stopped at 1 would draw one sign-up as a chart-high spike.
  const ticks = step === 1 ? 4 : Math.ceil(top / step);

  return { max: step * ticks, ticks };
};

// 41s, 1m 12s, 2h 5m. A dash when there is nothing to average.
export const formatDuration = (milliseconds) => {
  if (milliseconds === null || milliseconds === undefined) return '—';
  const total = Number(milliseconds);
  if (!Number.isFinite(total) || total < 0) return '—';

  const seconds = Math.round(total / 1000);
  if (seconds < 1) return 'Under 1s';
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
};

// The server names each day of the series as 'YYYY-MM-DD', already worked out
// in the admin's time zone. Both helpers below read the three numbers straight
// from that key and never go through a local Date, so the day shown is the day
// the server meant, whatever zone this browser is in.
const dayParts = (key) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key ?? ''));
  return match ? match.slice(1).map(Number) : null;
};

// Midnight UTC of that day, for the chart's time axis. NaN when unreadable.
export const dayToUtc = (key) => {
  const parts = dayParts(key);
  return parts ? Date.UTC(parts[0], parts[1] - 1, parts[2]) : NaN;
};

// 01 Sep 2026
export const formatDay = (key) => {
  const parts = dayParts(key);
  if (!parts || !MONTHS[parts[1] - 1]) return '';
  const [year, month, day] = parts;
  return `${String(day).padStart(2, '0')} ${MONTHS[month - 1]} ${year}`;
};

// 'trip' becomes 'Trip'. The values are the app's own short codes.
export const capitalise = (value) => {
  const text = String(value ?? '')
    .replace(/_/g, ' ')
    .trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : 'Unknown';
};

export const plural = (count, one, many) => (count === 1 ? one : many);
