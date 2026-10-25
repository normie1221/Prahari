import { prisma } from "../config/prisma.js";

/** Every number here comes from a live database query — no hardcoded
 * dashboard statistics, per spec section 23. */
export async function getSafetyStats() {
  const [
    totalReports, verifiedReports, pendingReports, resolvedReports,
    activeJourneys, totalUsers, totalCommunityPosts, openSosEvents,
  ] = await Promise.all([
    prisma.incident.count(),
    prisma.incident.count({ where: { status: "VERIFIED" } }),
    prisma.incident.count({ where: { status: "PENDING" } }),
    prisma.incident.count({ where: { status: "RESOLVED" } }),
    prisma.journey.count({ where: { status: "ACTIVE" } }),
    prisma.user.count(),
    prisma.discussionPost.count(),
    prisma.emergencyEvent.count({ where: { status: "TRIGGERED" } }),
  ]);

  const recentIncidents = await prisma.incident.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { id: true, type: true, severity: true, status: true, createdAt: true, latitude: true, longitude: true },
  });

  return {
    totalReports, verifiedReports, pendingReports, resolvedReports,
    activeJourneys, totalUsers, totalCommunityPosts, openSosEvents,
    recentIncidents,
  };
}

export async function getIncidentTrends({ days = 30 } = {}) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const incidents = await prisma.incident.findMany({
    where: { createdAt: { gte: since } },
    select: { type: true, severity: true, createdAt: true },
  });

  const byDay = {};
  const byType = {};
  for (const inc of incidents) {
    const day = inc.createdAt.toISOString().slice(0, 10);
    byDay[day] = (byDay[day] || 0) + 1;
    byType[inc.type] = (byType[inc.type] || 0) + 1;
  }
  return { byDay, byType, totalInWindow: incidents.length, windowDays: days };
}

export async function listPendingReports({ page = 1, pageSize = 20 } = {}) {
  const [items, total] = await Promise.all([
    prisma.incident.findMany({
      where: { status: "PENDING" },
      include: { media: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.incident.count({ where: { status: "PENDING" } }),
  ]);
  return { items, total, page, pageSize };
}

export async function listFlaggedPosts({ page = 1, pageSize = 20 } = {}) {
  const [items, total] = await Promise.all([
    prisma.discussionPost.findMany({
      where: { isFlagged: true },
      include: { user: { select: { id: true, name: true } }, group: { select: { name: true } }, reports: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.discussionPost.count({ where: { isFlagged: true } }),
  ]);
  return { items, total, page, pageSize };
}
