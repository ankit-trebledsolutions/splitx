const { Router } = require('express');
const { z } = require('zod');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const controller = require('../controllers/auth.controller');

const router = Router();

const registerSchema = {
  body: z.object({
    name: z.string().min(2, 'Name must be at least 2 characters').max(60),
    email: z.string().email('A valid email is required'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
  }),
};

const loginSchema = {
  body: z.object({
    email: z.string().email('A valid email is required'),
    password: z.string().min(1, 'Password is required'),
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

const resetPasswordSchema = {
  body: z.object({
    resetToken: z.string().min(1, 'Reset token is required'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
  }),
};

router.post('/register', validate(registerSchema), controller.register);
router.post('/login', validate(loginSchema), controller.login);
router.get('/me', protect, controller.me);
router.post('/forgot-password', validate(forgotPasswordSchema), controller.forgotPassword);
router.post('/verify-otp', validate(verifyOtpSchema), controller.verifyOtp);
router.post('/reset-password', validate(resetPasswordSchema), controller.resetPassword);

module.exports = router;
