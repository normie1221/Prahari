import { Router } from "express";
import { requireAuthUser, requireRole } from "../middleware/auth.js";
import * as ctrl from "../controllers/adminController.js";

const router = Router();

router.use(requireAuthUser(), requireRole("ADMIN", "MODERATOR"));
router.get("/stats", ctrl.getStats);
router.get("/trends", ctrl.getTrends);
router.get("/reports/pending", ctrl.getPendingReports);
router.get("/posts/flagged", ctrl.getFlaggedPosts);
router.patch("/reports/:id/status", ctrl.updateReportStatus);

export default router;
