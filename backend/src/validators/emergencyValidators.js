import { z } from "zod";

export const sosSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  message: z.string().max(500).optional(),
  journeyId: z.string().optional(),
  // True for a silent/duress trigger (long-press, shake gesture, code
  // phrase) — same urgency server-side and to admins, but the triggering
  // user's own client shows no alarming confirmation UI.
  isSilent: z.boolean().default(false),
});

export const emergencyContactSchema = z.object({
  name: z.string().min(1).max(100),
  phone: z.string().min(6).max(20),
  email: z.string().email().optional(),
  relationship: z.string().max(50).optional(),
});
