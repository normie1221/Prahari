import { describe, it, expect } from "vitest";
import {
  computeInitialConfidence,
  recomputeConfidenceOnVerification,
  aggregateAreaConfidence,
} from "../riskWeightingService.js";

describe("computeInitialConfidence", () => {
  it("gives higher base weight to more severe reports", () => {
    const low = computeInitialConfidence({ severity: "LOW", isAnonymous: false });
    const critical = computeInitialConfidence({ severity: "CRITICAL", isAnonymous: false });
    expect(critical).toBeGreaterThan(low);
  });

  it("reduces confidence slightly for anonymous reports", () => {
    const named = computeInitialConfidence({ severity: "MEDIUM", isAnonymous: false });
    const anon = computeInitialConfidence({ severity: "MEDIUM", isAnonymous: true });
    expect(anon).toBeLessThan(named);
  });

  it("never exceeds 1.0", () => {
    const w = computeInitialConfidence({ severity: "CRITICAL", isAnonymous: false });
    expect(w).toBeLessThanOrEqual(1);
  });
});

describe("recomputeConfidenceOnVerification", () => {
  it("boosts confidence when a moderator verifies", () => {
    const boosted = recomputeConfidenceOnVerification({ currentWeight: 0.3, verifiedByModerator: true });
    expect(boosted).toBeGreaterThan(0.3);
  });

  it("leaves confidence unchanged if not verified", () => {
    const unchanged = recomputeConfidenceOnVerification({ currentWeight: 0.3, verifiedByModerator: false });
    expect(unchanged).toBe(0.3);
  });

  it("caps boosted confidence at 1.0", () => {
    const boosted = recomputeConfidenceOnVerification({ currentWeight: 0.9, verifiedByModerator: true });
    expect(boosted).toBeLessThanOrEqual(1);
  });
});

describe("aggregateAreaConfidence", () => {
  it("returns zero score for no incidents", () => {
    expect(aggregateAreaConfidence([])).toEqual({ score: 0, count: 0 });
  });

  it("a single unverified report should NOT push confidence to a high value", () => {
    const now = new Date();
    const oneReport = [{ confidenceWeight: 0.3, status: "PENDING", createdAt: now.toISOString() }];
    const { score } = aggregateAreaConfidence(oneReport, now);
    // Spec requirement: one unverified report alone must not make an area
    // look confidently "dangerous" — assert it stays well below a
    // moderate/high threshold.
    expect(score).toBeLessThan(0.3);
  });

  it("multiple independent reports increase confidence more than one repeated", () => {
    const now = new Date();
    const single = [{ confidenceWeight: 0.3, status: "PENDING", createdAt: now.toISOString() }];
    const multiple = [
      { confidenceWeight: 0.3, status: "PENDING", createdAt: now.toISOString() },
      { confidenceWeight: 0.3, status: "PENDING", createdAt: now.toISOString() },
      { confidenceWeight: 0.3, status: "PENDING", createdAt: now.toISOString() },
    ];
    const singleResult = aggregateAreaConfidence(single, now);
    const multiResult = aggregateAreaConfidence(multiple, now);
    expect(multiResult.score).toBeGreaterThan(singleResult.score);
    expect(multiResult.count).toBe(3);
  });

  it("verified reports count more than unverified ones", () => {
    const now = new Date();
    const unverified = [{ confidenceWeight: 0.3, status: "PENDING", createdAt: now.toISOString() }];
    const verified = [{ confidenceWeight: 0.3, status: "VERIFIED", createdAt: now.toISOString() }];
    expect(aggregateAreaConfidence(verified, now).score).toBeGreaterThan(
      aggregateAreaConfidence(unverified, now).score,
    );
  });

  it("older reports contribute less than recent ones (recency decay)", () => {
    const now = new Date();
    const recent = [{ confidenceWeight: 0.3, status: "PENDING", createdAt: now.toISOString() }];
    const old = [{ confidenceWeight: 0.3, status: "PENDING", createdAt: new Date(now - 90 * 24 * 3600 * 1000).toISOString() }];
    expect(aggregateAreaConfidence(recent, now).score).toBeGreaterThan(
      aggregateAreaConfidence(old, now).score,
    );
  });

  it("score never exceeds 1", () => {
    const now = new Date();
    const many = Array.from({ length: 50 }, () => ({ confidenceWeight: 1, status: "VERIFIED", createdAt: now.toISOString() }));
    expect(aggregateAreaConfidence(many, now).score).toBeLessThanOrEqual(1);
  });
});
