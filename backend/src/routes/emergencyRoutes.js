import { Router } from "express";
import { requireAuthUser } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { emergencyLimiter } from "../middleware/rateLimiter.js";
import { sosSchema, emergencyContactSchema } from "../validators/emergencyValidators.js";
import * as ctrl from "../controllers/emergencyController.js";

const router = Router();

router.use(requireAuthUser());
router.post("/sos", emergencyLimiter, validate(sosSchema), ctrl.triggerSos);
router.get("/contacts", ctrl.listContacts);
router.post("/contacts", validate(emergencyContactSchema), ctrl.addContact);
router.delete("/contacts/:id", ctrl.removeContact);

export default router;
