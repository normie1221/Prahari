export default function RiskBadge({ category, score }) {
  const variant = { LOWER_RISK: "lower", MODERATE_RISK: "moderate", HIGHER_RISK: "higher" }[category] || "moderate";
  const label = { LOWER_RISK: "Lower risk", MODERATE_RISK: "Moderate risk", HIGHER_RISK: "Higher risk" }[category] || category;
  return (
    <span className={`risk-badge risk-badge--${variant}`}>
      <span>{label}</span>
      {typeof score === "number" && <span>· {score}/100</span>}
    </span>
  );
}
