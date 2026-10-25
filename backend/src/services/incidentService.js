import { prisma } from "../config/prisma.js";
import { logger } from "../config/logger.js";
import { computeInitialConfidence, aggregateAreaConfidence } from "./riskWeightingService.js";

export async function createIncident({ user, payload }) {
  const confidenceWeight = computeInitialConfidence({
    severity: payload.severity,
    isAnonymous: payload.isAnonymous,
  });

  const incident = await prisma.incident.create({
    data: {
      userId: payload.isAnonymous ? null : user?.id ?? null,
      type: payload.type,
      description: payload.description,
      latitude: payload.latitude,
      longitude: payload.longitude,
      severity: payload.severity,
      isAnonymous: payload.isAnonymous,
      confidenceWeight,
      media: payload.mediaUrls?.length
        ? { create: payload.mediaUrls.map((url) => ({ url, type: "image" })) }
        : undefined,
    },
    include: { media: true },
  });

  return incident;
}

const BBOX_DEGREE_PAD = 0.01; // ~1.1km, used when only a point is supplied

// Once true, we stop retrying PostGIS after it's confirmed unavailable —
// avoids a failed extension check on every single request in deployments
// that haven't run the enable-postgis migration.
let postgisConfirmedUnavailable = false;

/**
 * True circular-radius search using PostGIS's ST_DWithin, which is both
 * more accurate (a real radius, not a lat/lon bounding square that over-
 * includes corners and distorts with latitude) and faster at scale than
 * filtering all rows in application code. Falls back to the simpler
 * bounding-box query automatically if the `postgis` extension hasn't been
 * enabled yet (see prisma/migrations/00000000000000_enable_postgis) — this
 * is a performance/accuracy upgrade, not a hard requirement to run PRAHARI.
 */
async function findIncidentsWithinRadiusMeters({ lat, lon, radiusMeters, where = {} }) {
  if (postgisConfirmedUnavailable) return null;

  const conditions = [];
  const params = [lon, lat, radiusMeters];
  let i = 4;
  if (where.type) { conditions.push(`type = $${i}::"IncidentType"`); params.push(where.type); i += 1; }
  if (where.status) { conditions.push(`status = $${i}::"IncidentStatus"`); params.push(where.status); i += 1; }
  const extraWhere = conditions.length ? `AND ${conditions.join(" AND ")}` : "";

  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT * FROM "Incident"
       WHERE ST_DWithin(
         ST_MakePoint(longitude, latitude)::geography,
         ST_MakePoint($1, $2)::geography,
         $3
       ) ${extraWhere}
       ORDER BY "createdAt" DESC`,
      ...params,
    );
    return rows;
  } catch (err) {
    // Most likely cause: the postgis extension isn't enabled on this
    // database yet. Degrade gracefully rather than breaking incident
    // queries entirely.
    postgisConfirmedUnavailable = true;
    logger.warn(
      { err: err.message },
      "[incidentService] PostGIS ST_DWithin query failed — falling back to bounding-box search. " +
        "Run the enable-postgis migration for more accurate radius queries.",
    );
    return null;
  }
}

export async function listIncidents(query) {
  const where = {};
  if (query.type) where.type = query.type;
  if (query.status) where.status = query.status;
  if (query.minLat !== undefined && query.maxLat !== undefined) {
    where.latitude = { gte: query.minLat, lte: query.maxLat };
    where.longitude = { gte: query.minLon, lte: query.maxLon };
  }

  const [items, total] = await Promise.all([
    prisma.incident.findMany({
      where,
      include: { media: true },
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.incident.count({ where }),
  ]);

  return { items, total, page: query.page, pageSize: query.pageSize };
}

export async function getIncidentById(id) {
  return prisma.incident.findUnique({ where: { id }, include: { media: true } });
}

export async function getAreaConfidence({ lat, lon, radiusMeters = 1200, radiusDeg = BBOX_DEGREE_PAD }) {
  const viaPostgis = await findIncidentsWithinRadiusMeters({ lat, lon, radiusMeters });
  if (viaPostgis) return aggregateAreaConfidence(viaPostgis);

  const nearby = await prisma.incident.findMany({
    where: {
      latitude: { gte: lat - radiusDeg, lte: lat + radiusDeg },
      longitude: { gte: lon - radiusDeg, lte: lon + radiusDeg },
    },
  });
  return aggregateAreaConfidence(nearby);
}

export async function updateIncidentStatus({ id, status, moderatorId }) {
  const incident = await prisma.incident.update({ where: { id }, data: { status } });
  await prisma.auditLog.create({
    data: {
      actorId: moderatorId,
      action: `incident.status.${status.toLowerCase()}`,
      targetType: "Incident",
      targetId: id,
    },
  });
  return incident;
}
