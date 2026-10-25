import { z } from "zod";

export const INCIDENT_TYPES = [
  "HARASSMENT", "THEFT", "ASSAULT", "SUSPICIOUS_ACTIVITY",
  "ACCIDENT", "POOR_LIGHTING", "UNSAFE_AREA", "OTHER",
];

export const createIncidentSchema = z.object({
  type: z.enum(INCIDENT_TYPES),
  description: z.string().min(5).max(2000),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
  isAnonymous: z.boolean().default(false),
  // Relative paths (local/dev storage) or absolute URLs (cloud storage in prod)
  mediaUrls: z.array(z.string().min(1)).max(5).optional(),
});

export const listIncidentsQuerySchema = z.object({
  type: z.enum(INCIDENT_TYPES).optional(),
  status: z.enum(["PENDING", "VERIFIED", "REJECTED", "RESOLVED"]).optional(),
  minLat: z.coerce.number().optional(),
  minLon: z.coerce.number().optional(),
  maxLat: z.coerce.number().optional(),
  maxLon: z.coerce.number().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
