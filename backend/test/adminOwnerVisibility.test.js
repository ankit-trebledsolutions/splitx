require('../testkit/safeEnv');

/**
 * Owner (super_admin) accounts are invisible to co-admins.
 *
 * Hiding them in the panel's UI alone would be theatre: a co-admin could still
 * list them, and then suspend or delete one, with a hand-made request. So the
 * listing filter excludes them and every single-account action refuses by id.
 *
 * The refusal is "not found" rather than "not allowed" on purpose — a 403 would
 * confirm the account exists, which is the thing being hidden.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const env = require('../src/config/env');
require('../testkit/safeEnv').assertSafe(env);
const { buildListQuery, assertVisible } = require('../src/services/admin.service');
const { ROLES } = require('../src/config/permissions');

const OWNER = ROLES.SUPER_ADMIN;
const CO_ADMIN = ROLES.ADMIN;

test('an owner listing staff sees every kind of staff', () => {
  const query = buildListQuery({ role: 'staff', viewerRole: OWNER });
  assert.deepEqual(query.role, { $in: [ROLES.ADMIN, ROLES.SUPER_ADMIN] });
});

test('a co-admin listing staff sees only other co-admins', () => {
  const query = buildListQuery({ role: 'staff', viewerRole: CO_ADMIN });
  assert.equal(query.role, ROLES.ADMIN);
});

test('a co-admin asking for owners directly gets a filter that matches nothing', () => {
  const query = buildListQuery({ role: ROLES.SUPER_ADMIN, viewerRole: CO_ADMIN });
  assert.notEqual(query.role, ROLES.SUPER_ADMIN);
});

test('the unfiltered listing still hides owners from a co-admin', () => {
  // The branch that handles a named role does not run here, so without an
  // explicit guard "everyone" would quietly include the owners.
  const query = buildListQuery({ viewerRole: CO_ADMIN });
  assert.deepEqual(query.role, { $ne: ROLES.SUPER_ADMIN });
});

test('the unfiltered listing shows everyone to an owner', () => {
  assert.equal('role' in buildListQuery({ viewerRole: OWNER }), false);
});

test('searching does not become a way around the filter', () => {
  const query = buildListQuery({ search: 'rajeev', viewerRole: CO_ADMIN });
  assert.deepEqual(query.role, { $ne: ROLES.SUPER_ADMIN });
  assert.equal(query.$or.length, 2);
});

test('reaching an owner by id is refused, and refused as "not found"', () => {
  const owner = { role: OWNER };
  assert.throws(
    () => assertVisible(owner, { role: CO_ADMIN }),
    (err) => err.statusCode === 404 && /not found/i.test(err.message)
  );
});

test('an owner may act on another owner, and anyone may act on a co-admin', () => {
  assert.doesNotThrow(() => assertVisible({ role: OWNER }, { role: OWNER }));
  assert.doesNotThrow(() => assertVisible({ role: CO_ADMIN }, { role: CO_ADMIN }));
  assert.doesNotThrow(() => assertVisible({ role: ROLES.USER }, { role: CO_ADMIN }));
});
