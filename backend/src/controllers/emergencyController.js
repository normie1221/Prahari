import * as emergencyService from "../services/emergencyService.js";
import { asyncHandler } from "../middleware/errorHandler.js";

export const triggerSos = asyncHandler(async (req, res) => {
  const result = await emergencyService.triggerSos({ user: req.user, ...req.body });
  const anySimulated = result.notificationResults.some((r) => r.simulated);
  res.status(201).json({
    ...result,
    disclaimer: "PRAHARI has notified your saved emergency contacts. This is NOT a substitute for calling local emergency services — please also call them directly if you are in danger.",
    ...(anySimulated
      ? { devNotice: "One or more notification channels are not yet configured (see backend .env — TWILIO_*/SMTP_*), so those sends were simulated, not actually delivered." }
      : {}),
  });
});

export const listContacts = asyncHandler(async (req, res) => {
  res.json({ contacts: await emergencyService.listContacts(req.user.id) });
});

export const addContact = asyncHandler(async (req, res) => {
  const contact = await emergencyService.addContact({ userId: req.user.id, ...req.body });
  res.status(201).json({ contact });
});

export const removeContact = asyncHandler(async (req, res) => {
  const ok = await emergencyService.removeContact({ userId: req.user.id, contactId: req.params.id });
  if (!ok) return res.status(404).json({ error: "NotFound" });
  res.json({ removed: true });
});
