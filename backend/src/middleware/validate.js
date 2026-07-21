const ApiError = require('../utils/ApiError');

// Validates req.body / req.params / req.query against a zod schema object.
const validate = (schemas) => (req, _res, next) => {
  try {
    for (const key of ['body', 'params', 'query']) {
      if (schemas[key]) {
        req[key] = schemas[key].parse(req[key]);
      }
    }
    next();
  } catch (err) {
    const message = err.errors?.map((e) => e.message).join(', ') || 'Invalid request';
    next(ApiError.badRequest(message));
  }
};

module.exports = validate;
