/**
 * Per-user rate limiting
 * =======================
 * express-rate-limit (see middleware/rateLimiter.js) is IP-based, which
 * doesn't stop a single account from spamming incident reports or forum
 * posts from different networks/devices, and can over-block shared
 * networks (campus wifi, offices). This middleware limits by the
 * authenticated user's own id instead, using a simple in-memory sliding
 * window — sufficient for a single-process deployment; swap the Map for a
 * Redis-backed counter (e.g. via `rate-limiter-flexible`) if you run
 * multiple backend instances behind a load balancer.
 */
import { ApiError } from "./errorHandler.js";

const buckets = new Map(); // key -> array of timestamps (ms)

function withinWindow(key, windowMs, max) {
  const now = Date.now();
  const timestamps = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  timestamps.push(now);
  buckets.set(key, timestamps);
  return timestamps.length <= max;
}

export function perUserLimiter({ windowMs, max, action }) {
  return (req, res, next) => {
    if (!req.user) return next(); // anonymous/guest requests fall back to the IP limiter only
    const key = `${action}:${req.user.id}`;
    if (!withinWindow(key, windowMs, max)) {
      return next(
        new ApiError(429, `You're doing that a bit too often. Please wait a few minutes before submitting another ${action}.`),
      );
    }
    return next();
  };
}

// Periodic cleanup so the Map doesn't grow unbounded over a long-running process.
setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [key, timestamps] of buckets.entries()) {
    const kept = timestamps.filter((t) => t > cutoff);
    if (kept.length === 0) buckets.delete(key);
    else buckets.set(key, kept);
  }
}, 5 * 60 * 1000).unref();
