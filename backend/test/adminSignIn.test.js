require('../testkit/safeEnv');

/**
 * Who may change whose sign-in details through PATCH /admin/users/:id.
 *
 * The route only needs user-management write access, which co-admins can hold.
 * Before this rule a co-admin could reset a peer admin's password and sign in
 * as them (and give themselves any module, which the route no longer accepts).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const env = require('../src/config/env');
require('../testkit/safeEnv').assertSafe(env);
const { assertMayChangeSignIn } = require('../src/services/admin.service');
const { ROLES } = require('../src/config/permissions');

const account = (id, role, email = `${id}@example.test`) => ({
  _id: { toString: () => id },
  role,
  email,
});

const owner = account('owner', ROLES.SUPER_ADMIN);
const coAdmin = account('co', ROLES.ADMIN);
const peerAdmin = account('peer', ROLES.ADMIN);
const appUser = account('app', ROLES.USER);

const refused = (err) => err.statusCode === 403;

test("a co-admin cannot reset another admin's password or email", () => {
  assert.throws(() => assertMayChangeSignIn(peerAdmin, coAdmin, { password: 'new-pass-123' }), refused);
  assert.throws(() => assertMayChangeSignIn(peerAdmin, coAdmin, { email: 'mine@example.test' }), refused);
});

test('an owner may change any admin sign-in details', () => {
  assert.doesNotThrow(() => assertMayChangeSignIn(peerAdmin, owner, { password: 'new-pass-123' }));
  assert.doesNotThrow(() => assertMayChangeSignIn(peerAdmin, owner, { email: 'x@example.test' }));
});

test('a co-admin may change their own details and an app user’s', () => {
  assert.doesNotThrow(() => assertMayChangeSignIn(coAdmin, coAdmin, { password: 'new-pass-123' }));
  assert.doesNotThrow(() => assertMayChangeSignIn(appUser, coAdmin, { password: 'new-pass-123' }));
  assert.doesNotThrow(() => assertMayChangeSignIn(appUser, coAdmin, { email: 'x@example.test' }));
});

test('renaming a peer, or re-sending the same email, is not a sign-in change', () => {
  assert.doesNotThrow(() => assertMayChangeSignIn(peerAdmin, coAdmin, { name: 'Renamed' }));
  assert.doesNotThrow(() =>
    assertMayChangeSignIn(peerAdmin, coAdmin, { email: ' PEER@example.test ' })
  );
});
