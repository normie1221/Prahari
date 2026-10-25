import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Prisma client before importing the service under test, so no
// real database connection is needed for this unit test.
vi.mock("../../config/prisma.js", () => ({
  prisma: {
    $queryRawUnsafe: vi.fn(),
    incident: { findMany: vi.fn() },
  },
}));

const { prisma } = await import("../../config/prisma.js");
const { getAreaConfidence } = await import("../incidentService.js");

describe("getAreaConfidence — PostGIS with bounding-box fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the PostGIS radius query when it succeeds", async () => {
    prisma.$queryRawUnsafe.mockResolvedValueOnce([
      { confidenceWeight: 0.3, status: "PENDING", createdAt: new Date().toISOString() },
    ]);

    const result = await getAreaConfidence({ lat: 12.93, lon: 77.62 });

    expect(prisma.$queryRawUnsafe).toHaveBeenCalled();
    expect(prisma.incident.findMany).not.toHaveBeenCalled();
    expect(result.count).toBe(1);
  });

  it("falls back to the bounding-box query if PostGIS is unavailable", async () => {
    prisma.$queryRawUnsafe.mockRejectedValueOnce(new Error('function st_dwithin does not exist'));
    prisma.incident.findMany.mockResolvedValueOnce([
      { confidenceWeight: 0.3, status: "PENDING", createdAt: new Date().toISOString() },
    ]);

    const result = await getAreaConfidence({ lat: 12.93, lon: 77.62 });

    expect(prisma.incident.findMany).toHaveBeenCalledTimes(1);
    expect(result.count).toBe(1);
  });
});
