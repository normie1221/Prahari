import { isProd } from "../config/env.js";
import { logger } from "../config/logger.js";

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function notFoundHandler(req, res) {
  res.status(404).json({ error: "NotFound", message: `No route: ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  const message = status === 500 && isProd ? "Something went wrong. Please try again." : err.message;

  if (status >= 500) {
    logger.error({ err, path: req.originalUrl, method: req.method }, "Unhandled error");
  }

  res.status(status).json({
    error: err.name || "Error",
    message,
    ...(err.details ? { details: err.details } : {}),
    ...(isProd ? {} : { stack: err.stack }),
  });
}

export function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}
