class ApiError extends Error {
  // code: optional machine-readable reason (e.g. 'EMAIL_NOT_VERIFIED') for the
  // app to branch on, since messages are for people and may be reworded.
  // data: optional extra fields merged into the error response.
  constructor(statusCode, message, { code, data } = {}) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.data = data;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message) {
    return new ApiError(400, message);
  }

  static unauthorized(message = 'Not authenticated') {
    return new ApiError(401, message);
  }

  static forbidden(message = 'Not allowed') {
    return new ApiError(403, message);
  }

  static notFound(message = 'Resource not found') {
    return new ApiError(404, message);
  }

  static conflict(message) {
    return new ApiError(409, message);
  }
}

module.exports = ApiError;
