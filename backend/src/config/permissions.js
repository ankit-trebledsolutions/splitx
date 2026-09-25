// Admin panel access control.
//
// Two independent dimensions decide whether an admin request is allowed:
//   role        — what kind of account this is (see ROLES)
//   permissions — for `admin` accounts only, a per-module access level
//
// `super_admin` ignores the permission map entirely and may do anything.
// `user` (every mobile app account) is refused from the admin API outright.

const ROLES = {
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
  USER: 'user',
};

// One key per admin panel module. Adding a module here makes it appear in the
// co-admin permission matrix automatically — the UI renders whatever this lists.
const PERMISSIONS = {
  USER_MANAGEMENT: 'user_management',
  GENERAL_SETTINGS: 'general_settings',
};

const ACCESS_LEVEL = {
  NONE: 'none',
  READ: 'read',
  READ_WRITE: 'read_write',
};

// Ordered so a required level can be compared against a granted one with `>=`.
const ACCESS_WEIGHT = {
  [ACCESS_LEVEL.NONE]: 0,
  [ACCESS_LEVEL.READ]: 1,
  [ACCESS_LEVEL.READ_WRITE]: 2,
};

const ROLE_LIST = Object.values(ROLES);
const MODULE_LIST = Object.values(PERMISSIONS);
const ACCESS_LEVEL_LIST = Object.values(ACCESS_LEVEL);

// True when `granted` is at least as permissive as `required`. Unknown values
// weigh 0, so a permission map holding a stale or hand-edited level denies
// rather than accidentally allowing.
const satisfies = (granted, required) =>
  (ACCESS_WEIGHT[granted] || 0) >= (ACCESS_WEIGHT[required] || 0);

module.exports = {
  ROLES,
  PERMISSIONS,
  ACCESS_LEVEL,
  ROLE_LIST,
  MODULE_LIST,
  ACCESS_LEVEL_LIST,
  satisfies,
};
