require('../testkit/safeEnv');

const test = require('node:test');
const assert = require('node:assert/strict');
const AiError = require('../src/utils/AiError');
const { sanitizeItinerary } = require('../src/services/aiItinerary.sanitizer');

const activity = (overrides = {}) => ({
  time: '9:00 AM',
  endTime: '10:30 AM',
  title: 'Old town walk',
  location: 'Clock Tower, Old Town',
  icon: 'walk-outline',
  note: 'Start early.',
  ...overrides,
});
const day = (overrides = {}) => ({ dayNumber: 1, title: 'Old Town', activities: [activity()], ...overrides });
const plan = (count) => ({ days: Array.from({ length: count }, (_, i) => day({ dayNumber: i + 1, title: `Day theme ${i + 1}` })) });

const sanitize = (raw, options = {}) => sanitizeItinerary(raw, { dayCount: raw?.days?.length || 1, ...options });

const thrownBy = (fn) => {
  try {
    fn();
  } catch (err) {
    return err;
  }
  return assert.fail('expected an error');
};

// The sanitizer warns when it keeps fewer days than were asked for. Expected here.
test.beforeEach(() => test.mock.method(console, 'warn', () => {}));
test.afterEach(() => test.mock.restoreAll());

test('over-long strings are cut to what the ItineraryDay model accepts', () => {
  const [saved] = sanitize({
    days: [
      day({
        title: 'T'.repeat(500),
        activities: [activity({ title: 'A'.repeat(500), location: 'L'.repeat(500), note: 'N'.repeat(500) })],
      }),
    ],
  });
  assert.equal(saved.title.length, 120);
  assert.equal(saved.activities[0].title.length, 200);
  assert.equal(saved.activities[0].location.length, 200);
  assert.equal(saved.activities[0].note.length, 300);
});

test('50 activities in one day: the first 8 are kept, in time order', () => {
  const activities = Array.from({ length: 50 }, (_, i) => activity({ title: `Stop ${i + 1}`, time: i === 0 ? '8:00 PM' : '9:00 AM' }));
  const [saved] = sanitize({ days: [day({ activities })] });
  assert.equal(saved.activities.length, 8);
  assert.equal(saved.activities[7].title, 'Stop 1', 'the 8:00 PM stop sorts last');
});

test('a time the app cannot show becomes empty, and the activity is kept', () => {
  const [saved] = sanitize({
    days: [day({ activities: [activity({ time: 'Morning', endTime: '25:00' }), activity({ time: '09:00 AM', endTime: '1:05 PM' })] })],
  });
  assert.deepEqual(
    saved.activities.map(({ time, endTime }) => ({ time, endTime })),
    // "09:00 AM" is not h:mm either. Untimed activities sort after timed ones.
    [
      { time: '', endTime: '' },
      { time: '', endTime: '1:05 PM' },
    ]
  );
});

test('an icon outside the whitelist becomes the default pin', () => {
  const [saved] = sanitize({ days: [day({ activities: [activity({ icon: 'skull-outline' }), activity({ icon: undefined })] })] });
  assert.deepEqual(saved.activities.map((a) => a.icon), ['location-outline', 'location-outline']);
});

test('links, line breaks and control characters never reach the database', () => {
  const [saved] = sanitize({
    days: [
      day({
        title: 'Forts\nand   palaces',
        activities: [
          activity({
            title: 'Amber Fort https://evil.example/x?y=1 tour',
            location: 'see www.example.com/map\r\nJaipur',
            note: 'Book at HTTP://tickets.example now or\tlater',
          }),
        ],
      }),
    ],
  });
  assert.equal(saved.title, 'Forts and palaces');
  assert.equal(saved.activities[0].title, 'Amber Fort tour');
  assert.equal(saved.activities[0].location, 'see Jaipur');
  assert.equal(saved.activities[0].note, 'Book at now or later');
});

test('an activity with no title is dropped, and a day left with none is dropped too', () => {
  const saved = sanitize(
    {
      days: [
        day({ title: 'Empty', activities: [activity({ title: '   ' }), activity({ title: 'https://only-a-link.example' })] }),
        day({ title: '', activities: [activity()] }),
      ],
    },
    { dayCount: 2 }
  );
  assert.equal(saved.length, 1);
  // Renumbered from 1, and a missing title falls back to the day number.
  assert.equal(saved[0].dayNumber, 1);
  assert.equal(saved[0].title, 'Day 1');
});

test('20 days returned for a 5-day request: the first 5 are kept and numbered 1 to 5', () => {
  const raw = plan(20);
  raw.days.forEach((d, i) => Object.assign(d, { dayNumber: 20 - i }));
  const saved = sanitizeItinerary(raw, { dayCount: 5 });
  assert.deepEqual(saved.map((d) => d.dayNumber), [1, 2, 3, 4, 5]);
  assert.deepEqual(saved.map((d) => d.title), ['Day theme 1', 'Day theme 2', 'Day theme 3', 'Day theme 4', 'Day theme 5']);
});

test('days: [] means "not a real place": BAD_DESTINATION, already paid for', () => {
  const err = thrownBy(() => sanitizeItinerary({ days: [] }, { dayCount: 3 }));
  assert.ok(err instanceof AiError);
  assert.equal(err.kind, 'BAD_DESTINATION');
  assert.equal(err.billed, true);
});

test('anything that is not a list of usable days is BAD_OUTPUT, already paid for', () => {
  for (const raw of [null, {}, { days: 'none' }, { days: [day({ activities: [] })] }, { days: [null] }]) {
    const err = thrownBy(() => sanitizeItinerary(raw, { dayCount: 3 }));
    assert.ok(err instanceof AiError, JSON.stringify(raw));
    assert.equal(err.kind, 'BAD_OUTPUT', JSON.stringify(raw));
    assert.equal(err.billed, true);
  }
});

test('dates step one whole day from a start pinned to local noon', () => {
  // Noon in India. Whole-day steps keep 06:30Z, so no day drifts across midnight.
  const startDate = new Date('2026-12-30T06:30:00.000Z');
  const saved = sanitizeItinerary(plan(4), { dayCount: 4, startDate });
  assert.deepEqual(
    saved.map((d) => d.date.toISOString()),
    ['2026-12-30T06:30:00.000Z', '2026-12-31T06:30:00.000Z', '2027-01-01T06:30:00.000Z', '2027-01-02T06:30:00.000Z']
  );
  // The job row stores the start date, so it can also arrive as a string.
  const fromString = sanitizeItinerary(plan(1), { dayCount: 1, startDate: '2026-12-30T06:30:00.000Z' });
  assert.equal(fromString[0].date.toISOString(), '2026-12-30T06:30:00.000Z');
});

test('no start date: every day is undated', () => {
  assert.deepEqual(sanitizeItinerary(plan(2), { dayCount: 2 }).map((d) => d.date), [null, null]);
});
