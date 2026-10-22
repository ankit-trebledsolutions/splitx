require('../testkit/safeEnv');

/**
 * The pure rules of the wallet: how a spend or a deduction splits across the
 * two pots, the month arithmetic, prices, and how call blocks are counted.
 * The flows that touch a database are covered by scripts/smoke-wallet.js.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const env = require('../src/config/env');
require('../testkit/safeEnv').assertSafe(env);
const wallet = require('../src/services/wallet.service');
const { blocksDue, chargeKeyOf } = require('../src/services/callBilling.service');

const MINUTE_MS = 60 * 1000;

test('a spend takes free credits first, then the rest from the person’s own', () => {
  assert.deepEqual(wallet.spendSplit({ free: 20, paid: 50 }, 5), { free: -5, paid: -0 });
  assert.deepEqual(wallet.spendSplit({ free: 20, paid: 50 }, 30), { free: -20, paid: -10 });
  assert.deepEqual(wallet.spendSplit({ free: 0, paid: 50 }, 30), { free: -0, paid: -30 });
  assert.deepEqual(wallet.spendSplit({ free: 20, paid: 0 }, 20), { free: -20, paid: -0 });
});

test('a spend larger than the balance is refused with NO_CREDITS and the numbers', () => {
  assert.throws(
    () => wallet.spendSplit({ free: 3, paid: 4 }, 10, 'call'),
    (err) =>
      err.statusCode === 402 &&
      err.code === 'NO_CREDITS' &&
      err.data.needed === 10 &&
      err.data.balance === 7 &&
      err.data.feature === 'call'
  );
});

test('a negative pot never shows as a negative balance in the refusal', () => {
  assert.throws(
    () => wallet.spendSplit({ free: 0, paid: -5 }, 1),
    (err) => err.code === 'NO_CREDITS' && err.data.balance === 0
  );
});

test('an admin deduction takes back granted credits before the month’s free ones', () => {
  assert.deepEqual(wallet.deductSplit({ free: 20, paid: 50 }, 30), { free: -0, paid: -30 });
  assert.deepEqual(wallet.deductSplit({ free: 20, paid: 50 }, 60), { free: -10, paid: -50 });
  assert.throws(() => wallet.deductSplit({ free: 1, paid: 1 }, 3), (err) => err.statusCode === 400);
});

test('months are UTC, and the free credits renew at the start of the next one', () => {
  assert.equal(wallet.monthOf(new Date('2026-10-31T23:59:59Z')), '2026-10');
  assert.equal(wallet.monthOf(new Date('2026-11-01T00:00:00Z')), '2026-11');
  assert.equal(wallet.nextMonthStart(new Date('2026-12-15T10:00:00Z')).toISOString(), '2027-01-01T00:00:00.000Z');
});

test('prices are read per feature, and an unknown feature is a programming error', () => {
  const settings = { prices: { aiItinerary: 10, callBlock: 5 } };
  assert.equal(wallet.priceOf(settings, 'ai_itinerary'), 10);
  assert.equal(wallet.priceOf(settings, 'call'), 5);
  assert.throws(() => wallet.priceOf(settings, 'teleport'));
});

test('a call pays its first block at once and one more at each block boundary', () => {
  const start = new Date('2026-10-21T10:00:00Z');
  const at = (minutes) => start.getTime() + minutes * MINUTE_MS;
  assert.equal(blocksDue(start, 10, at(0)), 1);
  assert.equal(blocksDue(start, 10, at(9.99)), 1);
  assert.equal(blocksDue(start, 10, at(10)), 2);
  assert.equal(blocksDue(start, 10, at(25)), 3);
  // A clock a little behind the session's start does not count as no blocks.
  assert.equal(blocksDue(start, 10, at(-1)), 1);
});

test('each block of each call has its own charge key', () => {
  assert.equal(chargeKeyOf('abc', 1), 'call:abc:1');
  assert.notEqual(chargeKeyOf('abc', 1), chargeKeyOf('abc', 2));
});
