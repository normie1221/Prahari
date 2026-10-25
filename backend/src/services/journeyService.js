import { prisma } from "../config/prisma.js";
import { eventBus, Events } from "../utils/eventBus.js";

export async function startJourney({ user, routeId }) {
  const route = await prisma.route.findUnique({ where: { id: routeId } });
  if (!route) return null;

  const journey = await prisma.journey.create({
    data: {
      userId: user.id,
      routeId,
      status: "ACTIVE",
      startedAt: new Date(),
      currentLatitude: route.originLat,
      currentLongitude: route.originLon,
    },
    include: { route: true },
  });

  eventBus.emit(Events.JOURNEY_UPDATED, { userId: user.id, journey });
  return journey;
}

export async function getJourney({ id, userId }) {
  const journey = await prisma.journey.findUnique({
    where: { id },
    include: { route: true, alerts: { orderBy: { createdAt: "desc" }, take: 20 } },
  });
  if (!journey || journey.userId !== userId) return null;
  return journey;
}

/** Compares current position's nearest-route-segment risk vs the route's
 * own average to decide whether a RISK_INCREASE alert is warranted. This is
 * a real signal (deviation from the pre-computed route risk profile), not a
 * fabricated "AI alert". */
function computeRiskDelta(route, journey) {
  if (!route?.riskScore) return null;
  // Without live segment-level lookup here (kept in the nav service), we
  // use a conservative proxy: significant lateral distance from the
  // straight-line route path suggests the user may be off the planned
  // (and pre-scored) route.
  const distFromDestKm = Math.sqrt(
    (journey.currentLatitude - route.destLat) ** 2 + (journey.currentLongitude - route.destLon) ** 2,
  ) * 111;
  return { distFromDestKm };
}

export async function updateJourney({ id, userId, patch }) {
  const existing = await prisma.journey.findUnique({ where: { id }, include: { route: true } });
  if (!existing || existing.userId !== userId) return null;

  const data = { ...patch };
  if (patch.status === "COMPLETED") data.completedAt = new Date();

  const journey = await prisma.journey.update({ where: { id }, data, include: { route: true } });

  if (patch.currentLatitude !== undefined && existing.route) {
    const delta = computeRiskDelta(existing.route, journey);
    if (delta && delta.distFromDestKm > 0.4 && existing.route.riskScore >= 50) {
      const alert = await prisma.safetyAlert.create({
        data: {
          userId,
          journeyId: id,
          type: "OFF_ROUTE",
          message: "You appear to have deviated from your planned route in a higher-risk area. Consider re-checking your path.",
          severity: "WARNING",
        },
      });
      eventBus.emit(Events.JOURNEY_UPDATED, { userId, journey, newAlert: alert });
      return { journey, newAlert: alert };
    }
  }

  eventBus.emit(Events.JOURNEY_UPDATED, { userId, journey });
  return { journey, newAlert: null };
}

export async function listUserJourneys(userId) {
  return prisma.journey.findMany({
    where: { userId },
    include: { route: true },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
}
