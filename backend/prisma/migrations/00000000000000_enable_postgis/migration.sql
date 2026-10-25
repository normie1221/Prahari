-- Enables PostGIS on Neon (Neon supports this extension out of the box).
-- This migration is intentionally separate from Prisma's own generated
-- migrations so it can run first, before any geometry columns/indexes
-- that depend on it.
CREATE EXTENSION IF NOT EXISTS postgis;
