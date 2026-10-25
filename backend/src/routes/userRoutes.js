import { Router } from "express";
import { requireAuthUser } from "../middleware/auth.js";
import * as ctrl from "../controllers/userController.js";

const router = Router();

router.get("/me", requireAuthUser(), ctrl.getMe);

export default router;
