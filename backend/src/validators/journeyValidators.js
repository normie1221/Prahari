import { z } from "zod";

export const startJourneySchema = z.object({
  routeId: z.string().min(1),
});

export const updateJourneySchema = z.object({
  status: z.enum(["ACTIVE", "PAUSED", "COMPLETED", "CANCELLED"]).optional(),
  currentLatitude: z.number().min(-90).max(90).optional(),
  currentLongitude: z.number().min(-180).max(180).optional(),
});
