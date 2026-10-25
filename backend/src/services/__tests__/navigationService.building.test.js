import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../config/prisma.js", () => ({ prisma: { route: { create: vi.fn() } } }));
vi.mock("../../integrations/navigationServiceClient.js", () => ({ fetchRoutes: vi.fn() }));

const { prisma } = await import("../../config/prisma.js");
const navClient = await import("../../integrations/navigationServiceClient.js");
const { getRoutes } = await import("../navigationService.js");

const args = { user: { id: "u1" }, origin: { lat: 12.93, lon: 77.62 }, destination: { lat: 12.97, lon: 77.64 }, mode: "walking" };

describe("navigationService.getRoutes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes a 'building' answer straight through and saves nothing", async () => {
    navClient.fetchRoutes.mockResolvedValueOnce({ building: true, status: "building", retryAfterSeconds: 8 });
    const result = await getRoutes(args);
    expect(result.building).toBe(true);
    expect(prisma.route.create).not.toHaveBeenCalled();
  });

  it("saves each ready route with its per-segment data", async () => {
    const seg = [{ geometry: [[12.93, 77.62], [12.94, 77.63]], safetyScore: 6.1 }];
    navClient.fetchRoutes.mockResolvedValueOnce({
      routes: [{ type: "SAFEST", distanceKm: 1, durationMin: 13, riskScore: 45, geometry: [], roadNames: [], riskFactors: [], segments: seg, avgSafetyScore: 6.1 }],
      area: { name: "x" },
    });
    prisma.route.create.mockResolvedValueOnce({ id: "r1" });
    const result = await getRoutes(args);
    expect(prisma.route.create).toHaveBeenCalledTimes(1);
    const data = prisma.route.create.mock.calls[0][0].data;
    expect(data.segmentData).toEqual(seg);
    expect(data.avgSafetyScore).toBe(6.1);
    expect(result.routes[0].savedRouteId).toBe("r1");
  });
});
