import { Router } from "express";
import { requireAuthUser } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { startJourneySchema, updateJourneySchema } from "../validators/journeyValidators.js";
import * as ctrl from "../controllers/journeyController.js";

const router = Router();

router.use(requireAuthUser());
router.post("/", validate(startJourneySchema), ctrl.startJourney);
router.get("/", ctrl.listMyJourneys);
router.get("/:id", ctrl.getJourney);
router.patch("/:id", validate(updateJourneySchema), ctrl.updateJourney);

export default router;
