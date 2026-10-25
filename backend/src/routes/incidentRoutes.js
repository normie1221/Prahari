import { Router } from "express";
import { requireAuthUser, optionalAuthUser, requireRole } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { perUserLimiter } from "../middleware/perUserLimiter.js";
import { env } from "../config/env.js";
import { createIncidentSchema, listIncidentsQuerySchema } from "../validators/incidentValidators.js";
import * as ctrl from "../controllers/incidentController.js";
import { uploadIncidentMedia } from "../middleware/upload.js";
import { z } from "zod";

const router = Router();

const incidentLimiter = perUserLimiter({
  windowMs: env.perUserIncidentWindowMs,
  max: env.perUserIncidentMax,
  action: "incident report",
});

// Upload media first (returns URLs), then reference them in the incident
// report body — keeps the JSON incident payload simple and validated.
router.post("/media", optionalAuthUser(), uploadIncidentMedia.array("files", 5), ctrl.uploadMedia);
router.post("/", optionalAuthUser(), incidentLimiter, validate(createIncidentSchema), ctrl.createIncident);
router.get("/", validate(listIncidentsQuerySchema, "query"), ctrl.listIncidents);
router.get("/area-confidence", ctrl.getAreaConfidence);
router.get("/:id", ctrl.getIncident);
router.patch(
  "/:id/status",
  requireAuthUser(),
  requireRole("ADMIN", "MODERATOR"),
  validate(z.object({ status: z.enum(["PENDING", "VERIFIED", "REJECTED", "RESOLVED"]) })),
  ctrl.updateIncidentStatus,
);

export default router;
