const asyncHandler = require('../utils/asyncHandler');
const emailTemplateService = require('../services/emailTemplate.service');
const emailService = require('../services/email.service');

const list = asyncHandler(async (req, res) => {
  const data = await emailTemplateService.list(req.query);
  res.json({ success: true, data });
});

const get = asyncHandler(async (req, res) => {
  const template = await emailTemplateService.get(req.params.key);
  res.json({ success: true, data: { template } });
});

const update = asyncHandler(async (req, res) => {
  const template = await emailTemplateService.update(req.params.key, req.body, req.user);
  res.json({ success: true, data: { template } });
});

const setActive = asyncHandler(async (req, res) => {
  const template = await emailTemplateService.setActive(req.params.key, req.body.isActive, req.user);
  res.json({ success: true, data: { template } });
});

const reset = asyncHandler(async (req, res) => {
  const template = await emailTemplateService.reset(req.params.key, req.user);
  res.json({ success: true, data: { template } });
});

const preview = asyncHandler(async (req, res) => {
  const data = await emailTemplateService.preview(req.params.key, req.body.draft);
  res.json({ success: true, data });
});

// Goes to the signed-in admin's own address and nowhere else: a field for the
// recipient would turn the panel into a way of emailing anybody, in Splix's
// name, with whatever the template was edited to say.
const sendTest = asyncHandler(async (req, res) => {
  const { problems, ...mail } = await emailTemplateService.preview(req.params.key, req.body.draft);
  const { delivered } = await emailService.sendTest(req.user.email, mail);
  res.json({ success: true, data: { delivered, to: req.user.email, problems } });
});

module.exports = { list, get, update, setActive, reset, preview, sendTest };
