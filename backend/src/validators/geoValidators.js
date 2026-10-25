import { z } from "zod";

const nearFields = {
  lat: z.coerce.number().min(-90).max(90).optional(),
  lon: z.coerce.number().min(-180).max(180).optional(),
};

export const suggestQuerySchema = z.object({ q: z.string().trim().min(2).max(200), ...nearFields });
export const geocodeQuerySchema = z.object({ q: z.string().trim().min(2).max(200), ...nearFields });
export const reverseQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
});
