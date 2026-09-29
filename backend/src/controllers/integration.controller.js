const asyncHandler = require('../utils/asyncHandler');
const integrationService = require('../services/integration.service');
const { markWrongPassword } = require('../middleware/adminRateLimit');

// Tells the limiter in front of these routes that this refusal was a wrong
// password, which is the only kind it counts.
const countingWrongPasswords = (handler) =>
  asyncHandler(async (req, res) => {
    try {
      await handler(req, res);
    } catch (err) {
      if (err.code === 'WRONG_PASSWORD') markWrongPassword(req);
      throw err;
    }
  });

const list = asyncHandler(async (_req, res) => {
  const data = await integrationService.list();
  res.json({ success: true, data });
});

const changes = asyncHandler(async (_req, res) => {
  const data = await integrationService.changes();
  res.json({ success: true, data: { changes: data } });
});

// Always answers 200 when the check could be run: "the provider refused this
// key" is the answer, not a failure of the request.
const test = asyncHandler(async (req, res) => {
  const result = await integrationService.test(req.params.key, req.body.values);
  res.json({ success: true, data: { test: result } });
});

const update = countingWrongPasswords(async (req, res) => {
  const data = await integrationService.update(req.params.key, req.body, req.user);
  res.json({ success: true, data });
});

const reset = countingWrongPasswords(async (req, res) => {
  const data = await integrationService.reset(req.params.key, req.body, req.user);
  res.json({ success: true, data });
});

module.exports = { list, changes, test, update, reset };
