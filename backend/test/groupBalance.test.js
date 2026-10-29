require('../testkit/safeEnv');

/**
 * The balance shown next to each group on the Groups tab.
 *
 * Only money still outstanding counts, in both directions: shares the user
 * has not paid on other members' expenses, and shares other members have not
 * paid on theirs. A settled share has already moved its money, and a user's
 * own share of their own expense is not a debt to anyone. The same rule
 * drives the Home tab's net balance and the Expenses tab's tiles.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const env = require('../src/config/env');
require('../testkit/safeEnv').assertSafe(env);
const { outstandingShares } = require('../src/services/group.service');

const ME = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const OTHER = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const THIRD = 'cccccccccccccccccccccccc';

const expense = (paidBy, splits) => ({
  paidBy,
  splits: splits.map(([user, amount, settled]) => ({ user, amount, settled })),
});

test('a group with no expenses is settled', () => {
  assert.deepEqual(outstandingShares([], ME), { youOwe: 0, owedToYou: 0, net: 0 });
});

test('their unsettled share of someone else’s expense is money they owe', () => {
  const e = expense(OTHER, [[ME, 50, false], [OTHER, 50, true]]);
  assert.deepEqual(outstandingShares([e], ME), { youOwe: 50, owedToYou: 0, net: -50 });
});

test('other members’ unsettled shares of their expense are money owed to them', () => {
  const e = expense(ME, [[ME, 40, false], [OTHER, 30, false], [THIRD, 30, true]]);
  assert.deepEqual(outstandingShares([e], ME), { youOwe: 0, owedToYou: 30, net: 30 });
});

test('a settled share no longer counts, whoever settled it', () => {
  const e = expense(OTHER, [[ME, 50, true], [OTHER, 50, false]]);
  assert.deepEqual(outstandingShares([e], ME), { youOwe: 0, owedToYou: 0, net: 0 });
});

test('their own share of their own expense is neither owed nor owing', () => {
  const e = expense(ME, [[ME, 50, false], [OTHER, 50, true]]);
  assert.deepEqual(outstandingShares([e], ME), { youOwe: 0, owedToYou: 0, net: 0 });
});

test('an expense between two other people never counts', () => {
  const e = expense(OTHER, [[OTHER, 50, false], [THIRD, 50, false]]);
  assert.deepEqual(outstandingShares([e], ME), { youOwe: 0, owedToYou: 0, net: 0 });
});

test('owing and being owed in the same group are reported separately, with the net', () => {
  const dinner = expense(OTHER, [[ME, 20, false], [OTHER, 20, false]]);
  const taxi = expense(ME, [[ME, 15, false], [OTHER, 15, false], [THIRD, 15, false]]);
  assert.deepEqual(outstandingShares([dinner, taxi], ME), { youOwe: 20, owedToYou: 30, net: 10 });
});

test('ids may be ObjectId-like objects or strings', () => {
  const id = (s) => ({ toString: () => s });
  const e = expense(id(OTHER), [[id(ME), 12.5, false], [id(OTHER), 12.5, false]]);
  assert.deepEqual(outstandingShares([e], id(ME)), { youOwe: 12.5, owedToYou: 0, net: -12.5 });
});

test('sums are rounded to cents', () => {
  const e = expense(OTHER, [[ME, 0.1, false], [THIRD, 0.2, false], [OTHER, 0.7, false]]);
  const again = expense(OTHER, [[ME, 0.2, false], [OTHER, 0.8, false]]);
  // 0.1 + 0.2 in floating point is 0.30000000000000004.
  assert.deepEqual(outstandingShares([e, again], ME), { youOwe: 0.3, owedToYou: 0, net: -0.3 });
});
