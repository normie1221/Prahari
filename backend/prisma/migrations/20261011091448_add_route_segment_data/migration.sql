-- AlterTable
ALTER TABLE "Route" ADD COLUMN     "avgSafetyScore" DOUBLE PRECISION,
ADD COLUMN     "segmentData" JSONB;
