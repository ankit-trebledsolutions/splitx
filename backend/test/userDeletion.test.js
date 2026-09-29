require('../testkit/safeEnv');

/**
 * When an account may be deleted.
 *
 * The rule is outstanding money, not involvement. A fully settled expense has
 * already moved whatever it was going to move, so removing it changes nobody's
 * balance — and it must not stand in the way of deleting the account. Who
 * pressed "settle" is irrelevant: the payer is allowed to settle another
 * member's share, and a share settled that way counts exactly the same.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const env = require('../src/config/env');
require('../testkit/safeEnv').assertSafe(env);
const { owesOrIsOwed } = require('../src/services/userDeletion.service');

const ME = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const OTHER = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const THIRD = 'cccccccccccccccccccccccc';

const expense = (paidBy, splits) => ({
  paidBy,
  splits: splits.map(([user, amount, settled]) => ({ user, amount, settled })),
});

test('an unsettled share of someone else’s expense blocks deletion', () => {
  const e = expense(OTHER, [[ME, 50, false], [OTHER, 50, true]]);
  assert.equal(owesOrIsOwed(e, ME), true);
});

test('once that share is settled, it no longer blocks — whoever settled it', () => {
  const e = expense(OTHER, [[ME, 50, true], [OTHER, 50, true]]);
  assert.equal(owesOrIsOwed(e, ME), false);
});

test('being owed money blocks deletion too', () => {
  // They paid; somebody else has not paid them back yet.
  const e = expense(ME, [[ME, 50, true], [OTHER, 50, false]]);
  assert.equal(owesOrIsOwed(e, ME), true);
});

test('an expense they paid for, fully settled by the others, does not block', () => {
  const e = expense(ME, [[ME, 40, true], [OTHER, 30, true], [THIRD, 30, true]]);
  assert.equal(owesOrIsOwed(e, ME), false);
});

test('their own unsettled share of their own expense is not a debt to anyone', () => {
  // Nobody is owed anything here: they paid, and the outstanding share is their
  // own. Treating this as a blocker would make some accounts undeletable for a
  // debt that does not exist.
  const e = expense(ME, [[ME, 50, false], [OTHER, 50, true]]);
  assert.equal(owesOrIsOwed(e, ME), false);
});

test('an expense between two other people never blocks', () => {
  const e = expense(OTHER, [[OTHER, 50, false], [THIRD, 50, false]]);
  assert.equal(owesOrIsOwed(e, ME), false);
});

test('ids are compared as strings, so ObjectIds behave like the plain ones', () => {
  // Mongoose hands back ObjectId instances; === on them is always false, which
  // would quietly make every check pass and let debts through.
  const asObjectId = (hex) => ({ toString: () => hex });
  const e = {
    paidBy: asObjectId(OTHER),
    splits: [{ user: asObjectId(ME), amount: 50, settled: false }],
  };
  assert.equal(owesOrIsOwed(e, asObjectId(ME)), true);
});
