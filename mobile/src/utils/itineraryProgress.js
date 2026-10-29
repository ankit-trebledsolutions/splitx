// How far along the trip is, worked out from the itinerary alone. Pure, so the
// progress strip, the roadmap and the day list all agree on it.
//
// A stop (activity) is done when a member ticked it (done === true), or when
// nobody said otherwise (done == null) and its time has passed by the clock.
// done === false is a member unticking a stop whose time has passed: it is
// "skipped", counts as not done, and the road moves on past it. The first stop
// in trip order that is neither done nor skipped is the current one.
import { labelToMinutes } from './time';

const MINUTE = 60000;
const DAY = 24 * 60 * MINUTE;
// A stop with a start but no usable end time is taken to last an hour.
const DEFAULT_DURATION = 60;

export const STOP_STATUS = {
  done: 'done',
  current: 'current',
  pending: 'pending',
  skipped: 'skipped',
};

// Local midnight of the calendar day a stored date falls on. Day dates are
// pinned to local noon when written (GroupChatScreen's dateForDayNumber, the
// DateField), so this is the day the member picked whatever the zone.
export const dayStart = (date) => {
  if (!date) return null;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

// [start, end] timestamps of a stop, or null when its day has no date. A stop
// without a readable time spans its whole day.
export const stopWindow = (activity, dayStartMs) => {
  if (dayStartMs == null) return null;
  const startMin = labelToMinutes(activity?.time);
  if (startMin == null) return [dayStartMs, dayStartMs + DAY];
  const endParsed = labelToMinutes(activity?.endTime);
  const endMin =
    endParsed != null && endParsed > startMin ? endParsed : startMin + DEFAULT_DURATION;
  return [dayStartMs + startMin * MINUTE, dayStartMs + endMin * MINUTE];
};

const statusOf = (activity, elapsed) => {
  if (activity.done === true) return STOP_STATUS.done;
  if (activity.done === false) return elapsed ? STOP_STATUS.skipped : STOP_STATUS.pending;
  return elapsed ? STOP_STATUS.done : STOP_STATUS.pending;
};

export const buildItineraryProgress = (days = [], now = Date.now()) => {
  const ordered = [...days].sort((a, b) => a.dayNumber - b.dayNumber);
  const stops = [];
  const dayRows = [];
  const stopById = new Map();
  let currentStop = null;

  for (const day of ordered) {
    const startMs = dayStart(day.date);
    const row = {
      day,
      dayId: day._id,
      dayNumber: day.dayNumber,
      date: startMs,
      isToday: startMs != null && now >= startMs && now < startMs + DAY,
      isPast: startMs != null && now >= startMs + DAY,
      stops: [],
      total: 0,
      done: 0,
      status: STOP_STATUS.pending,
    };

    (day.activities ?? []).forEach((activity, index) => {
      const window = stopWindow(activity, startMs);
      const elapsed = window != null && now >= window[1];
      const stop = {
        id: activity._id ?? `${day._id}:${index}`,
        dayId: day._id,
        dayNumber: day.dayNumber,
        index,
        ordinal: stops.length,
        activity,
        elapsed,
        live: window != null && now >= window[0] && now < window[1],
        status: statusOf(activity, elapsed),
      };
      if (stop.status === STOP_STATUS.pending && !currentStop) {
        stop.status = STOP_STATUS.current;
        currentStop = stop;
      }
      stops.push(stop);
      row.stops.push(stop);
      row.total += 1;
      if (stop.status === STOP_STATUS.done) row.done += 1;
      stopById.set(stop.id, stop);
    });

    if (row.total > 0) {
      if (currentStop && currentStop.dayId === row.dayId) row.status = STOP_STATUS.current;
      else if (row.stops.every((s) => s.status !== STOP_STATUS.pending)) {
        row.status = STOP_STATUS.done;
      }
    } else if (row.isPast) {
      row.status = STOP_STATUS.done;
    } else if (row.isToday) {
      row.status = STOP_STATUS.current;
    }
    dayRows.push(row);
  }

  const total = stops.length;
  const done = stops.filter((s) => s.status === STOP_STATUS.done).length;
  const skipped = stops.filter((s) => s.status === STOP_STATUS.skipped).length;
  const allDone = total > 0 && !currentStop;
  const currentDay =
    (currentStop && dayRows.find((r) => r.dayId === currentStop.dayId)) ||
    dayRows.find((r) => r.status === STOP_STATUS.current) ||
    (allDone ? dayRows[dayRows.length - 1] : null);

  return {
    days: dayRows,
    stops,
    stopById,
    total,
    done,
    skipped,
    percent: total ? Math.round((done / total) * 100) : 0,
    currentStop,
    currentDay,
    dayCount: ordered.length,
    lastDayNumber: ordered.length ? ordered[ordered.length - 1].dayNumber : 0,
    allDone,
  };
};

// What a tap on a stop writes: a tick, or its undo. Undoing a tick on a stop
// whose time has passed has to say "did not happen" (false), or the clock
// would tick it straight back; before its time, clearing the mark is enough.
export const nextDoneFor = (stop) => {
  if (stop.status === STOP_STATUS.done) return stop.elapsed ? false : null;
  return true;
};
