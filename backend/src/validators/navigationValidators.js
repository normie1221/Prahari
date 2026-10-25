import { z } from "zod";

const latLon = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});

export const routeRequestSchema = z.object({
  origin: latLon,
  destination: latLon,
  mode: z.enum(["walking", "driving"]).default("walking"),
  departureTime: z.string().datetime().optional(),
  originLabel: z.string().max(200).optional(),
  destLabel: z.string().max(200).optional(),
});

export const heatmapQuerySchema = z.object({
  minLat: z.coerce.number().min(-90).max(90),
  minLon: z.coerce.number().min(-180).max(180),
  maxLat: z.coerce.number().min(-90).max(90),
  maxLon: z.coerce.number().min(-180).max(180),
});
