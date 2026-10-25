import { useMemo } from "react";

/**
 * The one deliberately bold visual in PRAHARI: instead of collapsing a
 * route to a single "risk score" number, the ribbon shows how safety
 * actually varies segment-by-segment along the walk — built directly from
 * `segmentSafetyScores` (the model's real per-edge safety_score, 1-10).
 * Nothing here is decorative; every colour stop is a real data point.
 */
function scoreToColor(score) {
  // score: 1 (risky) .. 10 (safe) -> coral -> amber -> banyan green
  const t = Math.max(0, Math.min(1, (score - 1) / 9));
  const stops = [
    { at: 0, c: [239, 97, 86] },   // --coral-signal
    { at: 0.5, c: [242, 183, 71] }, // --amber-streetlamp
    { at: 1, c: [69, 184, 146] },  // --green-banyan
  ];
  let a = stops[0], b = stops[1];
  if (t > 0.5) { a = stops[1]; b = stops[2]; }
  const localT = a.at === b.at ? 0 : (t - a.at) / (b.at - a.at);
  const c = a.c.map((v, i) => Math.round(v + (b.c[i] - v) * localT));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

export default function RouteRibbon({ scores = [], height = 34 }) {
  const gradient = useMemo(() => {
    if (!scores.length) return "var(--ink-line)";
    if (scores.length === 1) return scoreToColor(scores[0]);
    const stepPct = 100 / (scores.length - 1);
    const stops = scores.map((s, i) => `${scoreToColor(s)} ${(i * stepPct).toFixed(2)}%`);
    return `linear-gradient(90deg, ${stops.join(", ")})`;
  }, [scores]);

  return (
    <div
      role="img"
      aria-label={`Route safety ribbon: score ranges from ${Math.min(...scores).toFixed(1)} to ${Math.max(...scores).toFixed(1)} out of 10 along the path`}
      style={{
        height,
        borderRadius: height / 2,
        background: gradient,
        border: "1px solid rgba(255,255,255,0.12)",
        boxShadow: "inset 0 1px 3px rgba(0,0,0,0.35)",
      }}
    />
  );
}
