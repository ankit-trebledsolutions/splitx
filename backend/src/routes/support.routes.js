const { Router } = require('express');
const { z } = require('zod');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const { photoUpload } = require('../middleware/upload');
const controller = require('../controllers/support.controller');
const { CATEGORIES, MAX_ATTACHMENTS } = require('../models/SupportReport');

const router = Router();
router.use(protect);

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

// A field the phone fills in about itself. Short, optional, never required.
const deviceField = z.string().trim().max(40).optional();

// Multipart fields arrive as strings, so this schema reads the same whether
// the report came with screenshots or as JSON. Unknown fields are dropped.
const reportSchema = {
  body: z.object({
    category: z.enum(CATEGORIES, { message: 'Pick what kind of report this is' }),
    subject: z.string().trim().min(3, 'Give your report a short title').max(150),
    message: z.string().trim().min(10, 'Tell us a little more about what happened').max(2000),
    platform: deviceField,
    model: z.string().trim().max(60).optional(),
    osVersion: deviceField,
    appVersion: deviceField,
    build: deviceField,
  }),
};

// Contact Us. `name` and `email` are what the form used to ask for; they are
// still accepted, and ignored, so a phone on an older build is not refused.
// The phone's details come along as they do with a report.
const contactSchema = {
  body: reportSchema.body.omit({ category: true }).extend({
    name: z.string().max(80).optional(),
    email: z.string().max(120).optional(),
    subject: z.string().trim().min(2, 'Subject is required').max(150),
    message: z.string().trim().min(5, 'Tell us a little more').max(2000),
  }),
};

router.post('/contact', validate(contactSchema), controller.contact);

// multer first, so the form's text fields are in req.body by the time the
// schema reads them. A JSON body passes multer untouched. The screenshots are
// held in memory and must be images; a fourth one is refused with a 400.
router.post(
  '/reports',
  photoUpload.array('screenshots', MAX_ATTACHMENTS),
  validate(reportSchema),
  controller.create
);
router.get('/reports', controller.listMine);
router.get('/reports/:id', validate({ params: z.object({ id: objectId }) }), controller.getMine);

module.exports = router;
