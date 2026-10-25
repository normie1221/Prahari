import { Router } from "express";
import { requireAuthUser, optionalAuthUser } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { routeRequestSchema, heatmapQuerySchema } from "../validators/navigationValidators.js";
import * as ctrl from "../controllers/navigationController.js";

const router = Router();

// Route computation works for guests too (safety info shouldn't require
// an account), but we attach a user if signed in so history is saved.
router.post("/route", optionalAuthUser(), validate(routeRequestSchema), ctrl.computeRoute);
router.post("/recalculate/:routeId", requireAuthUser(), ctrl.recalculateRoute);
router.get("/heatmap", validate(heatmapQuerySchema, "query"), ctrl.getHeatmap);
router.get("/my-routes", requireAuthUser(), ctrl.getMyRoutes);

export default router;
