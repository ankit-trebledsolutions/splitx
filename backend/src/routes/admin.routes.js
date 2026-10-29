const { Router } = require('express');
const { z } = require('zod');
const validate = require('../middleware/validate');
const controller = require('../controllers/admin.controller');
const dashboard = require('../controllers/adminDashboard.controller');
const emailTemplates = require('../controllers/emailTemplate.controller');
const integrations = require('../controllers/integration.controller');
const support = require('../controllers/adminSupport.controller');
const wallet = require('../controllers/adminWallet.controller');
const appRelease = require('../controllers/appRelease.controller');
const branding = require('../controllers/branding.controller');
const { logoUpload } = require('../middleware/upload');
const { NAME_MIN: BRAND_NAME_MIN, NAME_MAX: BRAND_NAME_MAX } = require('../models/Branding');
const { TYPES: TRANSACTION_TYPES, FEATURES: PAID_FEATURES } = require('../models/CreditTransaction');
const { INTEGRATION_KEYS } = require('../integrations/definitions');
const { TEMPLATE_KEYS } = require('../emails/defaults');
const { CATEGORIES, STATUSES, PRIORITIES } = require('../models/SupportReport');
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
const canReadSupport = requirePermission(PERMISSIONS.SUPPORT, ACCESS_LEVEL.READ);
const canWriteSupport = requirePermission(PERMISSIONS.SUPPORT, ACCESS_LEVEL.READ_WRITE);
const canReadWallet = requirePermission(PERMISSIONS.WALLET, ACCESS_LEVEL.READ);
const canWriteWallet = requirePermission(PERMISSIONS.WALLET, ACCESS_LEVEL.READ_WRITE);

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

// No `permissions` here, on purpose: this route only needs user-management
// write access, so accepting them let a co-admin grant themselves any module.
// They change through PUT /users/:id/permissions, which is owners only. An
// unknown key is stripped by zod, so a request that still sends one changes
// nothing.
const updateUserSchema = {
  params: z.object({ id: objectId }),
  body: z
    .object({
      name: z.string().min(2).max(60).optional(),
      email: z.string().email('A valid email is required').optional(),
      password: z.string().min(8, 'Password must be at least 8 characters').optional(),
      role: z.enum(Object.values(ROLES)).optional(),
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

// The support queue: the usual page and search, narrowed by status and by
// what kind of report it is. Both are the model's own lists, so a status that
// does not exist is a 400 rather than an empty page.
const supportQueueSchema = paginationSchema.omit({ role: true }).extend({
  status: z.enum(STATUSES, { message: 'Unknown status' }).optional(),
  category: z.enum(CATEGORIES, { message: 'Unknown category' }).optional(),
});

const reportParams = z.object({ id: objectId });

// Which app builds are still let in (see models/AppRelease.js). Build numbers
// are whole numbers that only ever go up; 0 means "nobody is forced".
const buildNumber = z
  .number({ invalid_type_error: 'Enter a whole number' })
  .int('Enter a whole number')
  .min(0)
  .max(1000000000);

const platformReleaseSchema = z
  .object({
    minBuild: buildNumber,
    latestBuild: buildNumber,
    latestVersion: z.string().trim().max(32, 'The version label is at most 32 characters'),
    downloadUrl: z
      .string()
      .trim()
      .max(500, 'The download link is at most 500 characters')
      .refine((url) => url === '' || /^https:\/\/\S+$/i.test(url), 'The download link must start with https://'),
    notes: z.string().trim().max(1000, "What's new is at most 1000 characters"),
  })
  .refine((v) => v.minBuild <= v.latestBuild, {
    message: 'The lowest allowed build cannot be above the latest build',
  })
  // The wall's only way out is the link, so forcing without one would strand everyone.
  .refine((v) => v.minBuild === 0 || v.downloadUrl !== '', {
    message: 'Add a download link before requiring a build',
  });

const appReleaseSchema = z.object({
  android: platformReleaseSchema,
  ios: platformReleaseSchema,
});

// The app's name. One line of ordinary text: it is drawn as the wordmark, put
// in notification titles and written into invite messages.
const brandingSchema = z.object({
  appName: z
    .string({ required_error: 'Enter the app name' })
    .trim()
    .min(BRAND_NAME_MIN, `The app name needs at least ${BRAND_NAME_MIN} characters`)
    .max(BRAND_NAME_MAX, `The app name can be at most ${BRAND_NAME_MAX} characters`)
    .regex(/^[^\r\n\t]+$/, 'The app name must be a single line'),
});

// Whole credits only. The ceilings are sanity limits, not business rules: the
// co-admin cap in the settings is the real brake on grants.
const credits = (max) => z.number({ invalid_type_error: 'Enter a whole number' }).int('Enter a whole number').min(0).max(max);

const walletSettingsSchema = z.object({
  prices: z.object({
    aiItinerary: credits(10000),
    callBlock: credits(10000),
  }),
  callBlockMinutes: z.number().int().min(1, 'A call block is at least 1 minute').max(60, 'A call block is at most 60 minutes'),
  signupBonus: credits(100000),
  monthlyFree: credits(100000),
  coAdminGrantCap: credits(1000000),
});

const walletPagingSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const walletHistorySchema = walletPagingSchema.extend({
  type: z.enum(TRANSACTION_TYPES, { message: 'Unknown type' }).optional(),
  feature: z.enum(PAID_FEATURES, { message: 'Unknown feature' }).optional(),
});

// `requestId` is made by the panel for each press of the button, so a double
// click or a retry is applied once (see wallet.service, adjust).
const walletAdjustSchema = z.object({
  type: z.enum(['grant', 'deduct']),
  amount: z.number({ invalid_type_error: 'Enter a whole number' }).int('Enter a whole number').min(1, 'Enter at least 1 credit').max(1000000),
  reason: z.string().trim().min(3, 'Say why, in a few words').max(300),
  requestId: z.string().uuid('Invalid request id'),
});

// `internal` makes it a note between admins; the reporter is told nothing.
const replySchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, 'Write something first')
    .max(2000, 'A reply can be 2000 characters at most'),
  internal: z.boolean().default(false),
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

// --- App updates -------------------------------------------------------------
// Which builds of the app are still allowed in, and where the newest one is.
// Owners only: raising the lowest allowed build locks every older phone out
// of the whole app at once (see middleware/appVersion.js).
router.get('/app-release', adminReadLimiter, requireSuperAdmin, appRelease.getSettings);

router.put(
  '/app-release',
  adminWriteLimiter,
  requireSuperAdmin,
  validate({ body: appReleaseSchema }),
  appRelease.updateSettings
);

// --- Branding ----------------------------------------------------------------
// The app's name and logo, shown on every phone and on this panel. Owners
// only, like the rest of General Settings.
router.get('/branding', adminReadLimiter, requireSuperAdmin, branding.getSettings);

router.put(
  '/branding',
  adminWriteLimiter,
  requireSuperAdmin,
  validate({ body: brandingSchema }),
  branding.updateSettings
);

// multipart, one `logo` image field. multer refuses anything but PNG, JPEG
// or WebP, and anything over 2 MB, before the handler runs.
router.post('/branding/logo', adminWriteLimiter, requireSuperAdmin, logoUpload.single('logo'), branding.uploadLogo);

router.delete('/branding/logo', adminWriteLimiter, requireSuperAdmin, branding.removeLogo);

// --- Support ----------------------------------------------------------------
// Reports people send from the app. A module of its own in the permission
// matrix: reading them shows what every reporter wrote, answering them speaks
// for Splix, and neither follows from being allowed to manage users or emails.
//
// Nothing here deletes. A report is closed, which keeps what was said and
// done; the rows go only when the account that sent them does.
router.get('/support/summary', adminReadLimiter, canReadSupport, support.summary);

router.get(
  '/support/reports',
  adminReadLimiter,
  canReadSupport,
  validate({ query: supportQueueSchema }),
  support.list
);

router.get(
  '/support/reports/:id',
  adminReadLimiter,
  canReadSupport,
  validate({ params: reportParams }),
  support.get
);

// Both name the state rather than toggling it, so a repeated request lands on
// the same result and the reporter is told about a change once.
router.patch(
  '/support/reports/:id/status',
  adminWriteLimiter,
  canWriteSupport,
  validate({
    params: reportParams,
    body: z.object({ status: z.enum(STATUSES, { message: 'Unknown status' }) }),
  }),
  support.setStatus
);

router.patch(
  '/support/reports/:id/priority',
  adminWriteLimiter,
  canWriteSupport,
  validate({
    params: reportParams,
    body: z.object({ priority: z.enum(PRIORITIES, { message: 'Unknown priority' }) }),
  }),
  support.setPriority
);

router.post(
  '/support/reports/:id/replies',
  adminWriteLimiter,
  canWriteSupport,
  validate({ params: reportParams, body: replySchema }),
  support.reply
);

// --- Wallet -----------------------------------------------------------------
// Reading and adjusting people's credits is the `wallet` module. Prices and
// allowances are owners only: they change what everyone pays.
router.get('/wallet/summary', adminReadLimiter, canReadWallet, wallet.summary);

router.get('/wallet/settings', adminReadLimiter, canReadWallet, wallet.getSettings);

router.put(
  '/wallet/settings',
  adminWriteLimiter,
  requireSuperAdmin,
  validate({ body: walletSettingsSchema }),
  wallet.updateSettings
);

router.get(
  '/wallet/transactions',
  adminReadLimiter,
  canReadWallet,
  validate({ query: walletHistorySchema }),
  wallet.listTransactions
);

router.get(
  '/wallet/users/:id',
  adminReadLimiter,
  canReadWallet,
  validate({ params: z.object({ id: objectId }), query: walletPagingSchema }),
  wallet.getUserWallet
);

router.post(
  '/wallet/users/:id/adjust',
  adminWriteLimiter,
  canWriteWallet,
  validate({ params: z.object({ id: objectId }), body: walletAdjustSchema }),
  wallet.adjust
);

module.exports = router;
