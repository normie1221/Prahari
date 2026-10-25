import { Link } from "react-router-dom";
import { useMemo } from "react";
import RouteRibbon from "../components/RouteRibbon.jsx";

// A representative safety-score curve for the hero — illustrative only,
// clearly presented as a preview rather than a specific real route.
const HERO_SCORES = [7.8, 8.1, 7.2, 5.4, 4.1, 3.6, 4.8, 6.5, 7.9, 8.4, 8.8];

const FEATURES = [
  { title: "Three ways to get there", body: "Safest, fastest, and balanced routes computed from the same street-level safety model — compare them side by side, not just as a single score." },
  { title: "See where risk actually changes", body: "The safety ribbon shows how a route's risk shifts block by block, so you know exactly where to be more alert." },
  { title: "Community, not just data", body: "Join a group for your area, campus, or shift pattern to share real experiences — clearly separated from verified reports." },
  { title: "One tap in an emergency", body: "SOS shares your location and journey status with your saved contacts immediately." },
];

export default function LandingPage({ devBypass }) {
  const homeHref = devBypass ? "/dashboard" : "/sign-in";
  const ribbon = useMemo(() => HERO_SCORES, []);

  return (
    <div style={{ background: "radial-gradient(ellipse 1200px 600px at 50% -10%, #232a52 0%, #0E1226 60%)", minHeight: "100vh" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "24px 48px" }}>
        <span style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, color: "var(--amber-streetlamp)" }}>
          PRAHARI
        </span>
        <nav style={{ display: "flex", gap: 12 }}>
          <Link to={homeHref} className="btn btn-secondary" style={{ textDecoration: "none" }}>Sign in</Link>
          <Link to={homeHref} className="btn btn-primary" style={{ textDecoration: "none" }}>Get started</Link>
        </nav>
      </header>

      <section style={{ maxWidth: 880, margin: "0 auto", padding: "64px 24px 32px", textAlign: "center" }}>
        <div className="eyebrow" style={{ marginBottom: 16 }}>Predictive safety &amp; risk-aware navigation</div>
        <h1>
          Know which streets get <span style={{ color: "var(--amber-streetlamp)" }}>brighter</span> and which get{" "}
          <span style={{ color: "var(--coral-signal)" }}>quieter</span> — before you walk them.
        </h1>
        <p style={{ marginTop: 20, fontSize: 17, maxWidth: 620, marginInline: "auto" }}>
          PRAHARI scores every street segment using lighting, road type, and proximity to police and nightlife
          data — then plans your route around it. Built first for women travelling alone, students, night-shift
          workers, and daily commuters.
        </p>

        <div style={{ marginTop: 40, maxWidth: 640, marginInline: "auto" }}>
          <RouteRibbon scores={ribbon} height={44} />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--paper-faint)" }}>
            <span>Koramangala</span>
            <span>← real segment-level safety score, not a single number</span>
            <span>Mantri Square</span>
          </div>
        </div>

        <div style={{ marginTop: 40, display: "flex", gap: 12, justifyContent: "center" }}>
          <Link to={homeHref} className="btn btn-primary" style={{ textDecoration: "none", padding: "13px 26px" }}>
            Plan a safer route
          </Link>
        </div>
      </section>

      <section style={{ maxWidth: 1080, margin: "80px auto", padding: "0 24px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 20 }}>
        {FEATURES.map((f) => (
          <div key={f.title} className="card">
            <h3>{f.title}</h3>
            <p style={{ marginTop: 10 }}>{f.body}</p>
          </div>
        ))}
      </section>

      <footer style={{ textAlign: "center", padding: "40px 24px", color: "var(--paper-faint)", fontSize: 13 }}>
        Risk scores are model predictions from map-derived data, not verified crime statistics. PRAHARI is not a
        substitute for local emergency services.
      </footer>
    </div>
  );
}
