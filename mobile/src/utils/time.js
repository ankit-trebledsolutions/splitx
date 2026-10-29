// Activity times are plain text like "9:30 AM". The server sorts a day's
// activities by parsing that text, so what the app accepts has to be what the
// server can read. These helpers are the one place that rule lives.

// Same pattern the server sorts with (backend utils/itineraryTime.js).
const TIME_TEXT = /^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i;

// 570 -> "9:30 AM". Always this exact shape, whatever the phone's locale.
export const minutesToLabel = (minutes) => {
  const total = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const hours24 = Math.floor(total / 60);
  const mins = total % 60;
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${String(mins).padStart(2, '0')} ${hours24 < 12 ? 'AM' : 'PM'}`;
};

// "9:30 AM" -> 570; null when the text isn't a time.
export const labelToMinutes = (label) => {
  const match = TIME_TEXT.exec(String(label ?? '').trim());
  if (!match) return null;
  let hours = Number(match[1]);
  const mins = Number(match[2] ?? 0);
  const meridiem = match[3]?.toUpperCase();
  if (mins > 59) return null;
  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    hours = (hours % 12) + (meridiem === 'PM' ? 12 : 0);
  } else if (hours > 23) {
    return null;
  }
  return hours * 60 + mins;
};

// The rule for times a person types. Empty is fine: an activity without a time
// is a supported state (the Itinerary tab shows "—" for it).
export const isValidTimeText = (text) => {
  const value = String(text ?? '').trim();
  return value === '' || labelToMinutes(value) !== null;
};

// Tidies what was typed without changing its meaning: "9:30 am " -> "9:30 AM".
export const normalizeTimeText = (text) =>
  String(text ?? '')
    .trim()
    .replace(/\s*(am|pm)$/i, (_all, meridiem) => ` ${meridiem.toUpperCase()}`);
