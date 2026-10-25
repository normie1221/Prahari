import { Router } from "express";
import rateLimit from "express-rate-limit";
import { validate } from "../middleware/validate.js";
import { suggestQuerySchema, geocodeQuerySchema, reverseQuerySchema } from "../validators/geoValidators.js";
import * as ctrl from "../controllers/geoController.js";

const router = Router();

// Typing produces many requests; the client debounces, and this caps abuse per IP.
const geoLimiter = rateLimit({ windowMs: 60_000, max: 90, standardHeaders: true, legacyHeaders: false,
  message: { error: "TooManyRequests", message: "Too many place searches - please slow down." } });

router.use(geoLimiter);
router.get("/suggest", validate(suggestQuerySchema, "query"), ctrl.suggest);
router.get("/geocode", validate(geocodeQuerySchema, "query"), ctrl.geocode);
router.get("/reverse", validate(reverseQuerySchema, "query"), ctrl.reverse);

export default router;
