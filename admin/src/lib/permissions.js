// Mirrors backend/src/config/permissions.js. The two must agree: this file
// decides what the menu shows and which routes render, the server decides what
// actually happens. Hiding a menu item is a courtesy, never a security control.
//
// The server is the source of truth for the module list — /meta/modules returns
// it, and the permission matrix renders from that rather than from this file,
// so a module added on the server appears without a frontend change.

export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
  USER: 'user',
};

export const ACCESS_LEVEL = {
  NONE: 'none',
  READ: 'read',
  READ_WRITE: 'read_write',
};

export const PERMISSIONS = {
  USER_MANAGEMENT: 'user_management',
  GENERAL_SETTINGS: 'general_settings',
};

const ACCESS_WEIGHT = {
  [ACCESS_LEVEL.NONE]: 0,
  [ACCESS_LEVEL.READ]: 1,
  [ACCESS_LEVEL.READ_WRITE]: 2,
};

// Permissions arrive as a plain object once the server has serialised the
// Mongoose Map. The older shapes are still handled because a cached response
// from a previous build can outlive a deploy.
const normalizePermissions = (permissions) => {
  if (!permissions) return {};
  if (permissions instanceof Map) return Object.fromEntries(permissions);
  if (Array.isArray(permissions)) {
    return permissions.reduce((acc, entry) => {
      if (typeof entry === 'string') acc[entry] = ACCESS_LEVEL.READ;
      else if (entry?.permission) acc[entry.permission] = entry.access || ACCESS_LEVEL.READ;
      return acc;
    }, {});
  }
  return permissions;
};

export const hasRole = (user, roles) => {
  if (!roles || roles.length === 0) return true;
  if (!user) return false;
  return (Array.isArray(roles) ? roles : [roles]).includes(user.role);
};

export const hasPermission = (user, permission, requiredAccess = ACCESS_LEVEL.READ) => {
  if (!permission) return true;
  if (!user) return false;
  if (user.role === ROLES.SUPER_ADMIN) return true;

  const granted = normalizePermissions(user.permissions)?.[permission];
  // An unrecognised level weighs nothing, so a stale or hand-edited value
  // denies rather than quietly allowing — same rule as the server.
  return (ACCESS_WEIGHT[granted] || 0) >= (ACCESS_WEIGHT[requiredAccess] || 0);
};

export const hasAnyPermission = (user, permissions, requiredAccess = ACCESS_LEVEL.READ) => {
  if (!permissions || permissions.length === 0) return true;
  const list = Array.isArray(permissions) ? permissions : [permissions];
  return list.some((permission) => hasPermission(user, permission, requiredAccess));
};

export const isSuperAdmin = (user) => user?.role === ROLES.SUPER_ADMIN;

export const canAccess = (user, item = {}) =>
  hasRole(user, item.roles) &&
  hasPermission(user, item.permission, item.access || ACCESS_LEVEL.READ) &&
  hasAnyPermission(user, item.anyPermissions, item.access || ACCESS_LEVEL.READ);
