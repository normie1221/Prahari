import rateLimit from "express-rate-limit";
import { env } from "../config/env.js";

export const generalLimiter = rateLimit({
  windowMs: env.rateLimitWindowMs,
  max: env.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "TooManyRequests", message: "Please slow down and try again shortly." },
});

// SOS must never be blocked by a rate limiter tuned for normal traffic —
// generous but still bounded to prevent abuse.
export const emergencyLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "TooManyRequests", message: "Too many emergency requests — if this is a real emergency, contact local emergency services directly." },
});

export const authedWriteLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});
