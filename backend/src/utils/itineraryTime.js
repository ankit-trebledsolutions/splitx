// The one time format AI output and the app's time stepper use: "9:30 AM".
const TIME_12H = /^(1[0-2]|[1-9]):[0-5][0-9] (AM|PM)$/;

// "10:30 AM" -> minutes since midnight; unparseable times sort last.
const timeToMinutes = (value = '') => {
  const match = /^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i.exec(String(value).trim());
  if (!match) return Number.MAX_SAFE_INTEGER;
  let hours = parseInt(match[1], 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  const meridiem = match[3]?.toUpperCase();
  if (meridiem === 'PM' && hours !== 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;
  return hours * 60 + minutes;
};

// Keep every day's schedule in chronological order regardless of insertion order.
const sortByTime = (activities = []) =>
  [...activities].sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));

module.exports = { TIME_12H, timeToMinutes, sortByTime };
