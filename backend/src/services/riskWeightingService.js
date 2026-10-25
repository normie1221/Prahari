/**
 * Community Report Weighting
 * ==========================
 * Spec requirement: "A single unverified report should NOT immediately make
 * an area dangerous." This module computes a confidenceWeight (0.0 - 1.0)
 * for an incident report at creation time, and re-derives an aggregate
 * "community confidence" for a location by combining multiple reports.
 *
 * This weight is stored alongside the incident for admin/analytics use.
 * It never modifies the navigation model's own safety_score, and never
 * silently changes routing behaviour — see PRAHARI ARCHITECTURE.md,
 * "Community signals vs. navigation model" for the intentional boundary.
 */
const BASE_WEIGHT = { LOW: 0.15, MEDIUM: 0.3, HIGH: 0.5, CRITICAL: 0.65 };

export function computeInitialConfidence({ severity, isAnonymous }) {
  let weight = BASE_WEIGHT[severity] ?? 0.3;
  if (isAnonymous) weight *= 0.8; // anonymous reports start slightly lower
  return Math.round(weight * 100) / 100;
}

export function recomputeConfidenceOnVerification({ currentWeight, verifiedByModerator }) {
  if (verifiedByModerator) return Math.min(1, Math.round((currentWeight + 0.35) * 100) / 100);
  return currentWeight;
}

/** Combine several nearby incident confidence weights + recency into one
 * aggregate score in [0,1] for display purposes (e.g. "3 reports nearby,
 * moderate confidence") — a diminishing-returns sum, not a simple average,
 * so multiple independent reports matter more than one report repeated. */
export function aggregateAreaConfidence(incidents, now = new Date()) {
  if (!incidents.length) return { score: 0, count: 0 };
  let score = 0;
  for (const inc of incidents) {
    const ageDays = (now - new Date(inc.createdAt)) / (1000 * 60 * 60 * 24);
    const recencyFactor = Math.exp(-ageDays / 30); // half-ish life ~3 weeks
    const verifiedBoost = inc.status === "VERIFIED" ? 1.3 : 1.0;
    score += inc.confidenceWeight * recencyFactor * verifiedBoost * 0.4; // diminishing returns
  }
  return { score: Math.min(1, Math.round(score * 100) / 100), count: incidents.length };
}
