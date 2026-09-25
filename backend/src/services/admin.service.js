const jwt = require('jsonwebtoken');
const env = require('../config/env');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const { ROLES, MODULE_LIST } = require('../config/permissions');

const STAFF_ROLES = [ROLES.ADMIN, ROLES.SUPER_ADMIN];

// `scope: 'admin'` is what stops a mobile app token being replayed against the
// admin API — see middleware/adminAuth.js.
const signAdminToken = (userId, rememberMe) =>
  jwt.sign({ sub: userId.toString(), scope: 'admin' }, env.jwtSecret, {
    expiresIn: rememberMe ? env.adminJwtRememberExpiresIn : env.adminJwtExpiresIn,
  });

// A search term goes into a RegExp, so its metacharacters must be inert:
// without this, a stray "(" is a 500 and ".*" walks the whole collection.
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Panel sign-in. Deliberately separate from the mobile app's login: this one
// refuses anyone who is not staff, so a normal account cannot obtain a token
// carrying the admin scope in the first place.
const login = async ({ email, password, rememberMe }) => {
  // `password` is select:false on the model, so it must be asked for.
  const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password');

  // One message for "no such account" and "wrong password" alike, so the panel
  // cannot be used to find out which email addresses are staff.
  const refuse = () => ApiError.unauthorized('Incorrect email or password');
  if (!user) throw refuse();
  if (!STAFF_ROLES.includes(user.role)) throw refuse();
  if (!(await user.comparePassword(password))) throw refuse();
  // Checked after the password so a suspended account is not revealed to
  // someone guessing addresses.
  if (user.isActive === false) throw ApiError.forbidden('This account is suspended');

  user.lastLoginAt = new Date();
  await user.save();

  return { user, token: signAdminToken(user._id, rememberMe), rememberMe: !!rememberMe };
};

// Builds the filter for the user directory. Exported so the role rule below can
// be tested without a database.
const buildListQuery = ({ role, search }) => {
  const query = {};
  if (role === 'staff') {
    query.role = { $in: STAFF_ROLES };
  } else if (role === ROLES.USER) {
    // Accounts created before `role` existed have no such field at all — the
    // schema default is applied when Mongoose reads them, not retroactively to
    // what is stored. A plain { role: 'user' } matches only documents that
    // carry the field, which on a live database is none of the existing users.
    // $nin matches a missing field, so this reads as "everyone who is not
    // staff", which is what the Users screen means by an app user.
    query.role = { $nin: STAFF_ROLES };
  } else if (role) {
    query.role = role;
  }

  const term = (search || '').trim();
  if (term) {
    const pattern = new RegExp(escapeRegex(term), 'i');
    query.$or = [{ name: pattern }, { email: pattern }];
  }

  return query;
};

// Paginated directory. `role` narrows to staff or app users; `search` matches
// name or email. Never returns password hashes: the field is select:false and
// User.toJSON strips it as well.
const listUsers = async ({ role, search, page, limit }) => {
  const query = buildListQuery({ role, search });

  const [users, total] = await Promise.all([
    User.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    User.countDocuments(query),
  ]);

  return { users, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) };
};

const getUser = async (id) => {
  const user = await User.findById(id);
  if (!user) throw ApiError.notFound('User not found');
  return user;
};

// Rejects permission keys that are not real modules, so a hand-crafted request
// cannot write junk into the Map that the matrix UI would later render.
const cleanPermissions = (permissions) => {
  if (!permissions) return undefined;
  const cleaned = {};
  for (const [key, value] of Object.entries(permissions)) {
    if (!MODULE_LIST.includes(key)) throw ApiError.badRequest(`Unknown module: ${key}`);
    cleaned[key] = value;
  }
  return cleaned;
};

// Creates an account of any role. Making STAFF is restricted to a super admin;
// making an ordinary app user only needs write access to this module, so a
// co-admin can add someone without being able to mint administrators.
//
// The password is set in plain text on purpose: the model's pre('save') hook
// hashes it, and hashing here too would store a hash of a hash and lock the
// account out.
const createUser = async ({ name, email, password, role, permissions }, actor) => {
  const makingStaff = role === ROLES.ADMIN || role === ROLES.SUPER_ADMIN;
  if (makingStaff && actor.role !== ROLES.SUPER_ADMIN) {
    throw ApiError.forbidden('Only a super admin can create admin accounts');
  }

  const normalizedEmail = email.toLowerCase().trim();
  if (await User.findOne({ email: normalizedEmail })) {
    throw ApiError.conflict('An account with this email already exists');
  }

  return User.create({
    name,
    email: normalizedEmail,
    password,
    role,
    // A super admin ignores the map entirely, so storing one would only ever
    // mislead whoever read it later.
    permissions: role === ROLES.ADMIN ? cleanPermissions(permissions) : undefined,
    // Created by hand from the panel, so there is nobody to email a code to.
    emailVerified: true,
    isActive: true,
  });
};

// Guards shared by every mutating action below. `actor` is the signed-in admin.
const assertNotSelf = (actor, targetId, action) => {
  if (actor._id.toString() === targetId.toString()) {
    throw ApiError.badRequest(`You cannot ${action} your own account`);
  }
};

// Losing the last super admin would lock everyone out of the panel with no way
// back in except editing the database by hand.
const assertNotLastSuperAdmin = async (target) => {
  if (target.role !== ROLES.SUPER_ADMIN) return;
  const remaining = await User.countDocuments({
    role: ROLES.SUPER_ADMIN,
    _id: { $ne: target._id },
    isActive: { $ne: false },
  });
  if (remaining === 0) throw ApiError.badRequest('This is the last active super admin');
};

const updateUser = async (id, data, actor) => {
  const user = await User.findById(id).select('+password');
  if (!user) throw ApiError.notFound('User not found');

  if (data.role !== undefined && data.role !== user.role) {
    assertNotSelf(actor, id, 'change the role of');
    await assertNotLastSuperAdmin(user);
    user.role = data.role;
    // Dropping out of `admin` makes any stored permissions meaningless.
    if (data.role !== ROLES.ADMIN) user.permissions = undefined;
  }

  if (data.name !== undefined) user.name = data.name;

  if (data.email !== undefined) {
    const normalizedEmail = data.email.toLowerCase().trim();
    if (normalizedEmail !== user.email) {
      const clash = await User.findOne({ email: normalizedEmail, _id: { $ne: user._id } });
      if (clash) throw ApiError.conflict('An account with this email already exists');
      user.email = normalizedEmail;
    }
  }

  // Plain text again: the pre('save') hook does the hashing.
  if (data.password) user.password = data.password;

  if (data.permissions !== undefined) {
    const effectiveRole = data.role || user.role;
    if (effectiveRole !== ROLES.ADMIN) {
      throw ApiError.badRequest('Only admin accounts carry module permissions');
    }
    user.permissions = cleanPermissions(data.permissions);
  }

  await user.save();
  return user;
};

// Kept apart from updateUser because the permission matrix saves on its own and
// should not be able to change a role or password as a side effect.
const setPermissions = async (id, permissions) => {
  const user = await User.findById(id);
  if (!user) throw ApiError.notFound('User not found');
  if (user.role !== ROLES.ADMIN) {
    throw ApiError.badRequest('Only admin accounts carry module permissions');
  }
  user.permissions = cleanPermissions(permissions) || {};
  await user.save();
  return user;
};

// Suspend or restore. Replaces treble-d's toggle: naming the desired state
// makes the request idempotent, so a double click cannot un-suspend someone.
const setActive = async (id, isActive, actor) => {
  const user = await User.findById(id);
  if (!user) throw ApiError.notFound('User not found');
  assertNotSelf(actor, id, 'suspend');
  if (isActive === false) await assertNotLastSuperAdmin(user);

  user.isActive = isActive;
  await user.save();
  return user;
};

const deleteUser = async (id, actor) => {
  const user = await User.findById(id);
  if (!user) throw ApiError.notFound('User not found');
  assertNotSelf(actor, id, 'delete');
  await assertNotLastSuperAdmin(user);

  await user.deleteOne();
  return user;
};

module.exports = {
  buildListQuery,
  login,
  listUsers,
  getUser,
  createUser,
  updateUser,
  setPermissions,
  setActive,
  deleteUser,
};
