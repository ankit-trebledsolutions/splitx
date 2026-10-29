const { Router } = require('express');
const { z } = require('zod');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const controller = require('../controllers/auth.controller');

const router = Router();

// Lowercase letters, digits, dots and underscores; lowercased before the check
// so "Jane.Doe" is accepted and stored as "jane.doe".
const usernameField = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._]{3,20}$/, 'Username must be 3-20 letters, numbers, dots or underscores');

// Loose on purpose: people type spaces, dashes and brackets. What matters is
// 7-15 digits, the range E.164 allows, with an optional leading +.
const phoneField = z
  .string()
  .trim()
  .max(20, 'Phone number is too long')
  .refine(
    (v) => /^\+?[\d\s()-]+$/.test(v) && /^\d{7,15}$/.test(v.replace(/\D/g, '')),
    'Enter a valid phone number'
  );

const registerSchema = {
  body: z.object({
    name: z.string().min(2, 'Name must be at least 2 characters').max(60),
    email: z.string().email('A valid email is required'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    // Optional here: the Complete Profile screen asks for it if it is missing.
    phone: phoneField.optional(),
  }),
};

const updateMeSchema = {
  body: z
    .object({
      name: z.string().trim().min(2, 'Name must be at least 2 characters').max(60).optional(),
      username: usernameField.optional(),
      phone: phoneField.optional(),
      bio: z.string().trim().max(160, 'Bio must be 160 characters or fewer').optional(),
    })
    .strict(),
};

const loginSchema = {
  body: z.object({
    email: z.string().email('A valid email is required'),
    password: z.string().min(1, 'Password is required'),
  }),
};

const googleSchema = {
  body: z.object({
    idToken: z.string().min(1, 'Google ID token is required'),
  }),
};

const forgotPasswordSchema = {
  body: z.object({ email: z.string().email('A valid email is required') }),
};

const verifyOtpSchema = {
  body: z.object({
    email: z.string().email('A valid email is required'),
    otp: z.string().regex(/^\d{6}$/, 'Code must be 6 digits'),
  }),
};

const resendCodeSchema = {
  body: z.object({
    email: z.string().email('A valid email is required'),
    purpose: z.enum(['verify-email', 'reset-password']),
  }),
};

const resetPasswordSchema = {
  body: z.object({
    resetToken: z.string().min(1, 'Reset token is required'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
  }),
};

router.post('/register', validate(registerSchema), controller.register);
router.post('/verify-email', validate(verifyOtpSchema), controller.verifyEmail);
router.post('/resend-code', validate(resendCodeSchema), controller.resendCode);
router.post('/login', validate(loginSchema), controller.login);
router.post('/google', validate(googleSchema), controller.googleLogin);
router.get('/me', protect, controller.me);
router.patch('/me', protect, validate(updateMeSchema), controller.updateMe);
router.get('/invite-code', protect, controller.inviteCode);
router.post('/forgot-password', validate(forgotPasswordSchema), controller.forgotPassword);
router.post('/verify-otp', validate(verifyOtpSchema), controller.verifyOtp);
router.post('/reset-password', validate(resetPasswordSchema), controller.resetPassword);

module.exports = router;
