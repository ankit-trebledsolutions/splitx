const { Router } = require('express');
const { z } = require('zod');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const SupportMessage = require('../models/SupportMessage');

const router = Router();
router.use(protect);

const contactSchema = {
  body: z.object({
    name: z.string().min(2, 'Name is required').max(80),
    email: z.string().email('Enter a valid email').max(120),
    subject: z.string().min(2, 'Subject is required').max(150),
    message: z.string().min(5, 'Tell us a little more').max(2000),
  }),
};

router.post(
  '/contact',
  validate(contactSchema),
  asyncHandler(async (req, res) => {
    const ticket = await SupportMessage.create({ user: req.user._id, ...req.body });
    res.status(201).json({ success: true, data: { ticket } });
  })
);

module.exports = router;
