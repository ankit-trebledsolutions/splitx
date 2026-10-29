require('../testkit/safeEnv');

/**
 * Saving a day sends every activity back; this is the rule for which of them
 * stay the same activity, and that a tick on the roadmap survives that save.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const env = require('../src/config/env');
require('../testkit/safeEnv').assertSafe(env);
const { reconcileActivities } = require('../src/utils/itineraryActivities');

const A = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const B = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const C = 'cccccccccccccccccccccccc';

const current = [
  { _id: A, title: 'Airport pickup', done: true },
  { _id: B, title: 'Hotel check-in', done: null },
];

test('an activity sent back with its own id keeps that id and its done mark', () => {
  const out = reconcileActivities(current, [
    { _id: A, title: 'Airport pickup (changed)' },
    { _id: B, title: 'Hotel check-in' },
  ]);
  assert.deepEqual(out, [
    { _id: A, done: true, title: 'Airport pickup (changed)' },
    { _id: B, done: null, title: 'Hotel check-in' },
  ]);
});

test('a done mark in the payload wins over the stored one', () => {
  const out = reconcileActivities(current, [{ _id: A, title: 'Airport pickup', done: false }]);
  assert.equal(out[0].done, false);
});

test('an id that is not one of this day, or sent twice, gets a fresh activity', () => {
  const out = reconcileActivities(current, [
    { _id: C, title: 'Planted id' },
    { _id: A, title: 'First copy' },
    { _id: A, title: 'Second copy' },
    { title: 'No id at all' },
  ]);
  assert.deepEqual(out, [
    { title: 'Planted id' },
    { _id: A, done: true, title: 'First copy' },
    { title: 'Second copy' },
    { title: 'No id at all' },
  ]);
});

test('ids match whatever their letter case, and ObjectId-like values', () => {
  const asObject = [{ _id: { toString: () => A.toUpperCase() }, title: 'x', done: true }];
  const out = reconcileActivities(asObject, [{ _id: A, title: 'x' }]);
  assert.deepEqual(out, [{ _id: A, done: true, title: 'x' }]);
});

test('a stored activity without the field reads as auto (null)', () => {
  const out = reconcileActivities([{ _id: A, title: 'old row' }], [{ _id: A, title: 'old row' }]);
  assert.equal(out[0].done, null);
});
