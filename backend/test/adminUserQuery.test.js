require('../testkit/safeEnv');

/**
 * The filter behind the Users screen.
 *
 * The rule that matters: `role` was added long after these accounts were
 * created, so the documents already in the database carry no such field.
 * Mongoose fills the default in when it READS one, which makes the field look
 * present in application code while being absent in the database — so a query
 * that tests for it finds nothing. Against the live database, filtering with
 * { role: 'user' } returned 0 of 14 real accounts.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const env = require('../src/config/env');
require('../testkit/safeEnv').assertSafe(env);
const { buildListQuery } = require('../src/services/admin.service');
const { ROLES } = require('../src/config/permissions');

test('app users are matched by exclusion, so accounts predating the field are found', () => {
  const query = buildListQuery({ role: ROLES.USER });

  // $nin matches a document whose field is missing entirely; a plain equality
  // test does not. That difference is the whole bug.
  assert.deepEqual(query.role, { $nin: [ROLES.ADMIN, ROLES.SUPER_ADMIN] });
  assert.notDeepEqual(query.role, ROLES.USER);
});

test('staff are matched by inclusion, which correctly excludes a missing field', () => {
  const query = buildListQuery({ role: 'staff' });
  assert.deepEqual(query.role, { $in: [ROLES.ADMIN, ROLES.SUPER_ADMIN] });
});

test('no role filter means no role condition at all', () => {
  assert.equal('role' in buildListQuery({}), false);
});

test('a search term is matched against name and email, and cannot inject a pattern', () => {
  const query = buildListQuery({ search: 'a.b(c' });
  assert.equal(query.$or.length, 2);
  // Escaped, so the parentheses are literal text rather than a capture group.
  assert.equal(query.$or[0].name.source, 'a\\.b\\(c');
  assert.equal(query.$or[0].name.flags, 'i');
  assert.ok(query.$or[1].email instanceof RegExp);
});

test('a blank or whitespace-only search adds no condition', () => {
  assert.equal('$or' in buildListQuery({ search: '   ' }), false);
  assert.equal('$or' in buildListQuery({ search: '' }), false);
});
