const { Router } = require('express');
const { z } = require('zod');
const validate = require('../middleware/validate');
const controller = require('../controllers/admin.controller');
const {
  adminProtect,
  requirePermission,
  requireSuperAdmin,
  requireAdminCsrfHeader,
} = require('../middleware/adminAuth');
const {
  adminLoginLimiter,
  adminReadLimiter,
  adminWriteLimiter,
} = require('../middleware/adminRateLimit');
const { PERMISSIONS, ACCESS_LEVEL, ROLES, MODULE_LIST, ACCESS_LEVEL_LIST } =
  require('../config/permissions');

const router = Router();

const canReadUsers = requirePermission(PERMISSIONS.USER_MANAGEMENT, ACCESS_LEVEL.READ);
const canWriteUsers = requirePermission(PERMISSIONS.USER_MANAGEMENT, ACCESS_LEVEL.READ_WRITE);

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

// Counted, not measured by string length: a plain `z.string().max(100)` caps how
// many characters the number has, so `limit=99999` would pass and return the
// whole collection.
const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(120).optional(),
  role: z.enum([...Object.values(ROLES), 'staff']).optional(),
});

// Keys are checked against the real module list here and again in the service,
// so neither a new route nor a direct service call can store an unknown module.
const permissionMapSchema = z.record(z.enum(MODULE_LIST), z.enum(ACCESS_LEVEL_LIST));

const loginSchema = {
  body: z.object({
    email: z.string().email('A valid email is required'),
    password: z.string().min(1, 'Password is required'),
    rememberMe: z.boolean().optional(),
  }),
};

// `permissions` is accepted here on purpose: treble-d's equivalent schema was
// .strict() and omitted the key, so the service's permissions argument could
// never arrive and every new admin silently started with none.
const createUserSchema = {
  body: z.object({
    name: z.string().min(2, 'Name must be at least 2 characters').max(60),
    email: z.string().email('A valid email is required'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    role: z.enum(Object.values(ROLES)),
    permissions: permissionMapSchema.optional(),
  }),
};

const updateUserSchema = {
  params: z.object({ id: objectId }),
  body: z
    .object({
      name: z.string().min(2).max(60).optional(),
      email: z.string().email('A valid email is required').optional(),
      password: z.string().min(8, 'Password must be at least 8 characters').optional(),
      role: z.enum(Object.values(ROLES)).optional(),
      permissions: permissionMapSchema.optional(),
    })
    .refine((body) => Object.keys(body).length > 0, 'Nothing to update'),
};

// --- Sign in / sign out -----------------------------------------------------
// Open routes: no session exists yet. The limiter is the only brake.
router.post('/auth/login', adminLoginLimiter, validate(loginSchema), controller.login);
router.post('/auth/logout', controller.logout);

// Everything below requires an active staff session.
router.use(adminProtect);
router.use(requireAdminCsrfHeader);

router.get('/auth/me', controller.me);
router.get('/meta/modules', adminReadLimiter, controller.modules);

// --- User management --------------------------------------------------------
// The read guard here is the fix for treble-d's listing route, which carried no
// permission middleware at all: any signed-in account could read every user.
router.get(
  '/users',
  adminReadLimiter,
  canReadUsers,
  validate({ query: paginationSchema }),
  controller.listUsers
);

router.get(
  '/users/:id',
  adminReadLimiter,
  canReadUsers,
  validate({ params: z.object({ id: objectId }) }),
  controller.getUser
);

// The guard is write access, not super admin: the service refuses to create an
// ADMIN unless the caller is a super admin, so a co-admin can add an app user
// without being able to mint administrators.
router.post(
  '/users',
  adminWriteLimiter,
  canWriteUsers,
  validate(createUserSchema),
  controller.createUser
);

router.patch(
  '/users/:id',
  adminWriteLimiter,
  canWriteUsers,
  validate(updateUserSchema),
  controller.updateUser
);

router.put(
  '/users/:id/permissions',
  adminWriteLimiter,
  requireSuperAdmin,
  validate({
    params: z.object({ id: objectId }),
    body: z.object({ permissions: permissionMapSchema }),
  }),
  controller.setPermissions
);

// Naming the desired state rather than toggling: a retried or double-clicked
// request lands on the same result instead of flipping it back.
router.patch(
  '/users/:id/active',
  adminWriteLimiter,
  canWriteUsers,
  validate({
    params: z.object({ id: objectId }),
    body: z.object({ isActive: z.boolean() }),
  }),
  controller.setActive
);

router.delete(
  '/users/:id',
  adminWriteLimiter,
  canWriteUsers,
  validate({ params: z.object({ id: objectId }) }),
  controller.deleteUser
);

module.exports = router;
