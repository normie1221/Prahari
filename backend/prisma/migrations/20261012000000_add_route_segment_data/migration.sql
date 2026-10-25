-- Adds per-segment safety data to saved routes (used by the Journey map).
-- IF NOT EXISTS makes this safe even if the columns were already added by an
-- earlier `prisma migrate dev` run.
ALTER TABLE "Route" ADD COLUMN IF NOT EXISTS "segmentData" JSONB;
ALTER TABLE "Route" ADD COLUMN IF NOT EXISTS "avgSafetyScore" DOUBLE PRECISION;
