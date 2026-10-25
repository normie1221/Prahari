import { prisma } from "../config/prisma.js";
import * as navClient from "../integrations/navigationServiceClient.js";

/** Compute routes via the navigation microservice and persist the result
 * for the user's route history / profile. Does not alter the model's
 * output — only shapes it for storage. */
export async function getRoutes({ user, origin, destination, mode, originLabel, destLabel }) {
  const result = await navClient.fetchRoutes({ origin, destination, mode });
  // Area still being prepared: nothing to save yet, the client polls again.
  if (result.building) return result;

  const savedRoutes = await Promise.all(
    result.routes.map((r) =>
      prisma.route.create({
        data: {
          userId: user?.id ?? null,
          originLat: origin.lat,
          originLon: origin.lon,
          destLat: destination.lat,
          destLon: destination.lon,
          originLabel: originLabel ?? null,
          destLabel: destLabel ?? null,
          distanceKm: r.distanceKm,
          durationMin: r.durationMin,
          riskScore: r.riskScore,
          routeType: r.type,
          geometry: r.geometry,
          roadNames: r.roadNames,
          riskFactors: r.riskFactors,
          segmentData: r.segments,
          avgSafetyScore: r.avgSafetyScore,
        },
      }),
    ),
  );

  return {
    routes: result.routes.map((r, i) => ({ ...r, savedRouteId: savedRoutes[i].id })),
    area: result.area,
    computeSeconds: result.computeSeconds,
  };
}

export async function getHeatmap(bbox) {
  return navClient.fetchHeatmap(bbox);
}

export async function getSavedRoutesForUser(userId, { page = 1, pageSize = 20 } = {}) {
  const [items, total] = await Promise.all([
    prisma.route.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.route.count({ where: { userId } }),
  ]);
  return { items, total, page, pageSize };
}

export async function recalculateRoute({ user, routeId }) {
  const existing = await prisma.route.findUnique({ where: { id: routeId } });
  if (!existing) return null;
  return getRoutes({
    user,
    origin: { lat: existing.originLat, lon: existing.originLon },
    destination: { lat: existing.destLat, lon: existing.destLon },
    mode: "walking",
    originLabel: existing.originLabel,
    destLabel: existing.destLabel,
  });
}
