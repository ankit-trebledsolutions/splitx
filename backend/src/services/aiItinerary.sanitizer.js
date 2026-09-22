const AiError = require('../utils/AiError');
const { TIME_12H, sortByTime } = require('../utils/itineraryTime');
const { ICONS, MAX_ACTIVITIES_PER_DAY } = require('./aiItinerary.prompt');

/**
 * Turns whatever the model returned into days that are safe to save. The strict
 * schema makes the shape right almost always, but it cannot limit lengths and a
 * model can still slip in a link or a line break, so nothing from the AI reaches
 * the database without passing through here. Pure: no database, no environment.
 *
 * Every error thrown is for a result OpenAI has already charged for.
 */
const DAY_MS = 86400000;
const FALLBACK_ICON = 'location-outline';

// Field limits of the ItineraryDay model. Mongoose rejects longer values rather
// than trimming them, which would fail the whole insert.
const MAX_DAY_TITLE = 120;
const MAX_ACTIVITY_TITLE = 200;
const MAX_LOCATION = 200;
const MAX_NOTE = 300;

const clean = (value) =>
  String(value ?? '')
    // Control characters and every kind of line break become a plain space.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029]/g, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/www\.\S+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// A time the app cannot parse would sort last and read oddly in the narrow time
// column. Empty is a supported state: the tab shows it as a dash.
const cleanTime = (value) => {
  const time = clean(value);
  return TIME_12H.test(time) ? time : '';
};

const cleanActivity = (raw) => ({
  time: cleanTime(raw?.time),
  endTime: cleanTime(raw?.endTime),
  title: clean(raw?.title).slice(0, MAX_ACTIVITY_TITLE).trim(),
  location: clean(raw?.location).slice(0, MAX_LOCATION).trim(),
  icon: ICONS.includes(raw?.icon) ? raw.icon : FALLBACK_ICON,
  note: clean(raw?.note).slice(0, MAX_NOTE).trim(),
});

const cleanActivities = (raw) =>
  sortByTime(
    (Array.isArray(raw) ? raw : [])
      .map(cleanActivity)
      .filter((activity) => activity.title)
      .slice(0, MAX_ACTIVITIES_PER_DAY)
  );

const sanitizeItinerary = (raw, { dayCount, startDate = null }) => {
  if (!Array.isArray(raw?.days)) throw new AiError('BAD_OUTPUT', { billed: true });
  // The instructions tell the model to answer with no days for a made-up place.
  if (raw.days.length === 0) throw new AiError('BAD_DESTINATION', { billed: true });

  const days = raw.days
    .slice(0, dayCount)
    .map((day) => ({ title: clean(day?.title), activities: cleanActivities(day?.activities) }))
    .filter((day) => day.activities.length > 0)
    // Numbered by position, not by what the model wrote: the unique
    // (group, dayNumber) index needs 1..k with no repeats.
    .map((day, index) => {
      const dayNumber = index + 1;
      return {
        dayNumber,
        title: day.title.slice(0, MAX_DAY_TITLE).trim() || `Day ${dayNumber}`,
        // Whole-day steps from a start pinned to local noon keep the calendar day stable.
        date: startDate ? new Date(new Date(startDate).getTime() + index * DAY_MS) : null,
        activities: day.activities,
      };
    });

  if (days.length === 0) throw new AiError('BAD_OUTPUT', { billed: true });
  if (days.length !== dayCount) {
    console.warn(`[ai] planned ${days.length} usable day(s) for a ${dayCount}-day request`);
  }
  return days;
};

module.exports = { sanitizeItinerary, clean };
