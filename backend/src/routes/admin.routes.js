const { Router } = require('express');
const { z } = require('zod');
const validate = require('../middleware/validate');
const controller = require('../controllers/admin.controller');
const dashboard = require('../controllers/adminDashboard.controller');
const emailTemplates = require('../controllers/emailTemplate.controller');
const integrations = require('../controllers/integration.controller');
const { INTEGRATION_KEYS } = require('../integrations/definitions');
const { TEMPLATE_KEYS } = require('../emails/defaults');
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
  adminSensitiveLimiter,
} = require('../middleware/adminRateLimit');
const { PERMISSIONS, ACCESS_LEVEL, ROLES, MODULE_LIST, ACCESS_LEVEL_LIST } =
  require('../config/permissions');

const router = Router();

const canReadUsers = requirePermission(PERMISSIONS.USER_MANAGEMENT, ACCESS_LEVEL.READ);
const canWriteUsers = requirePermission(PERMISSIONS.USER_MANAGEMENT, ACCESS_LEVEL.READ_WRITE);
const canReadEmails = requirePermission(PERMISSIONS.EMAIL_TEMPLATE, ACCESS_LEVEL.READ);
const canWriteEmails = requirePermission(PERMISSIONS.EMAIL_TEMPLATE, ACCESS_LEVEL.READ_WRITE);

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

// Templates are addressed by what they are (`welcome`), not by a database id:
// the list of emails is fixed in code, and most have no document at all.
const templateKey = z.object({ key: z.enum(TEMPLATE_KEYS, { message: 'Unknown email template' }) });

// Lengths match models/EmailTemplate.js. Whether the content makes sense —
// placeholders that exist, a code email that still has its code — is judged in
// the service, where the answer depends on which email it is.
const templateContent = z.object({
  subject: z.string().max(200, 'The subject is too long (200 characters at most)'),
  preheader: z.string().max(200, 'The preview line is too long (200 characters at most)').default(''),
  body: z.string().max(100000, 'The design is too large'),
  text: z.string().max(20000, 'The plain-text version is too long'),
  reason: z.string().max(300, 'The footer line is too long (300 characters at most)').default(''),
});

// No draft means "the version that is saved".
const draftSchema = z.object({ draft: templateContent.optional() }).default({});

const integrationKey = z.object({ key: z.enum(INTEGRATION_KEYS, { message: 'Unknown service' }) });

// Field names are checked against the service they are for in the service
// layer; here it is enough that they are short strings. Numbers arrive as the
// text that was typed.
const integrationValues = z.record(z.string().max(40), z.string().max(500)).default({});

const passwordConfirmed = z.string({ required_error: 'Enter your password to confirm' }).min(1, 'Enter your password to confirm');

// The runtime's own list decides what a time zone is: a name it cannot build a
// formatter for is one the dashboard could not count days in either.
const isTimeZone = (value) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
};

// Three fixed ranges rather than any number: the panel offers exactly these,
// and `days=100000` would otherwise be a scan of everything ever stored. The
// time zone is the browser's, so that "today" is the admin's day and not the
// server's.
const dashboardSchema = z.object({
  days: z.coerce
    .number()
    .refine((value) => [7, 30, 90].includes(value), 'days must be 7, 30 or 90')
    .default(30),
  tz: z.string().max(64).refine(isTimeZone, 'Unknown time zone').default('UTC'),
});

// --- Sign in / sign out -----------------------------------------------------
// Open routes: no session exists yet. The limiter is the only brake.
router.post('/auth/login', adminLoginLimiter, validate(loginSchema), controller.login);
router.post('/auth/logout', controller.logout);

// Everything below requires an active staff session.
router.use(adminProtect);
router.use(requireAdminCsrfHeader);

router.get('/auth/me', controller.me);
router.get('/meta/modules', adminReadLimiter, controller.modules);

// --- Dashboard --------------------------------------------------------------
// No permission guard beyond being staff, on purpose: this is the screen every
// admin lands on, and what it returns is counts. The one part that names
// people, the newest sign-ups, is withheld inside the service from anyone
// without read access to user management.
router.get(
  '/dashboard',
  adminReadLimiter,
  validate({ query: dashboardSchema }),
  dashboard.get
);

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

// --- Email templates --------------------------------------------------------
// There is no create and no delete. Every template is an email some code
// sends: one made in the panel would never go out, and one deleted would still
// be sent, in its built-in design. Editing, switching off and resetting are the
// actions that mean something.
router.get(
  '/email-templates',
  adminReadLimiter,
  canReadEmails,
  validate({ query: paginationSchema.omit({ role: true }) }),
  emailTemplates.list
);

router.get(
  '/email-templates/:key',
  adminReadLimiter,
  canReadEmails,
  validate({ params: templateKey }),
  emailTemplates.get
);

router.put(
  '/email-templates/:key',
  adminWriteLimiter,
  canWriteEmails,
  validate({ params: templateKey, body: templateContent }),
  emailTemplates.update
);

router.patch(
  '/email-templates/:key/active',
  adminWriteLimiter,
  canWriteEmails,
  validate({ params: templateKey, body: z.object({ isActive: z.boolean() }) }),
  emailTemplates.setActive
);

router.post(
  '/email-templates/:key/reset',
  adminWriteLimiter,
  canWriteEmails,
  validate({ params: templateKey }),
  emailTemplates.reset
);

// A POST because it carries the unsaved draft, but it changes nothing, so read
// access and the read limiter are the right guards: the editor asks for a
// fresh preview every time the typing pauses.
router.post(
  '/email-templates/:key/preview',
  adminReadLimiter,
  canReadEmails,
  validate({ params: templateKey, body: draftSchema }),
  emailTemplates.preview
);

router.post(
  '/email-templates/:key/test',
  adminWriteLimiter,
  canWriteEmails,
  validate({ params: templateKey, body: draftSchema }),
  emailTemplates.sendTest
);

// --- Third-party APIs -------------------------------------------------------
// Owners only, with no permission a co-admin could be given. Whoever holds the
// email key can read every sign-up and reset code Splix sends, which is every
// account; that is not something to hand out module by module.
router.get('/integrations', adminReadLimiter, requireSuperAdmin, integrations.list);

router.get('/integrations/changes', adminReadLimiter, requireSuperAdmin, integrations.changes);

// Checks keys with the provider and saves nothing.
router.post(
  '/integrations/:key/test',
  adminWriteLimiter,
  requireSuperAdmin,
  validate({ params: integrationKey, body: z.object({ values: integrationValues }) }),
  integrations.test
);

router.put(
  '/integrations/:key',
  adminWriteLimiter,
  adminSensitiveLimiter,
  requireSuperAdmin,
  validate({
    params: integrationKey,
    body: z.object({ values: integrationValues, password: passwordConfirmed }),
  }),
  integrations.update
);

router.post(
  '/integrations/:key/reset',
  adminWriteLimiter,
  adminSensitiveLimiter,
  requireSuperAdmin,
  validate({ params: integrationKey, body: z.object({ password: passwordConfirmed }) }),
  integrations.reset
);

module.exports = router;
