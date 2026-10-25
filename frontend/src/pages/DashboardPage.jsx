import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, friendlyError } from "../lib/api.js";
import RiskBadge from "../components/RiskBadge.jsx";
import { Loading, ErrorBlock, EmptyBlock } from "../components/StateBlocks.jsx";
import { useAuthUser } from "../hooks/useAuthUser.js";

export default function DashboardPage() {
  const { displayName } = useAuthUser();
  const [recentRoutes, setRecentRoutes] = useState(null);
  const [groups, setGroups] = useState(null);
  const [journeys, setJourneys] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.get("/api/navigation/my-routes?pageSize=5"),
      api.get("/api/community/groups"),
      api.get("/api/journeys"),
    ])
      .then(([r, g, j]) => {
        if (cancelled) return;
        setRecentRoutes(r.data.items);
        setGroups(g.data.groups);
        setJourneys(j.data.journeys);
      })
      .catch((err) => !cancelled && setError(friendlyError(err)));
    return () => { cancelled = true; };
  }, []);

  const activeJourney = journeys?.find((j) => j.status === "ACTIVE");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 1080 }}>
      <div>
        <div className="eyebrow">Dashboard</div>
        <h2 style={{ marginTop: 6 }}>Welcome back, {displayName}</h2>
      </div>

      {error && <ErrorBlock message={error} />}

      {activeJourney && (
        <div className="card" style={{ borderColor: "var(--amber-streetlamp)" }}>
          <div className="eyebrow" style={{ color: "var(--amber-streetlamp)" }}>Journey in progress</div>
          <p style={{ marginTop: 8, color: "var(--paper)" }}>
            You have an active journey — {activeJourney.route?.originLabel || "your route"} → {activeJourney.route?.destLabel || "destination"}
          </p>
          <Link to={`/journey/${activeJourney.id}`} className="btn btn-primary" style={{ marginTop: 12, textDecoration: "none", display: "inline-flex" }}>
            View journey
          </Link>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
        <Link to="/navigation" className="card card--tight" style={{ textDecoration: "none" }}>
          <div className="eyebrow">Quick action</div>
          <h3 style={{ marginTop: 8 }}>Plan a route →</h3>
        </Link>
        <Link to="/incidents" className="card card--tight" style={{ textDecoration: "none" }}>
          <div className="eyebrow">Quick action</div>
          <h3 style={{ marginTop: 8 }}>Report an incident →</h3>
        </Link>
        <Link to="/community" className="card card--tight" style={{ textDecoration: "none" }}>
          <div className="eyebrow">Quick action</div>
          <h3 style={{ marginTop: 8 }}>Ask the community →</h3>
        </Link>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 20 }}>
        <div className="card">
          <h3>Recent routes</h3>
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            {recentRoutes === null ? (
              <Loading />
            ) : recentRoutes.length === 0 ? (
              <EmptyBlock title="No routes yet" hint="Plan your first safety-aware route." />
            ) : (
              recentRoutes.map((r) => (
                <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--ink-line)" }}>
                  <div>
                    <div style={{ fontSize: 14, color: "var(--paper)" }}>{r.originLabel || "Start"} → {r.destLabel || "Destination"}</div>
                    <div style={{ fontSize: 12, color: "var(--paper-faint)", fontFamily: "var(--font-mono)" }}>{r.distanceKm} km · {r.routeType}</div>
                  </div>
                  <RiskBadge category={r.riskScore <= 33 ? "LOWER_RISK" : r.riskScore <= 66 ? "MODERATE_RISK" : "HIGHER_RISK"} score={r.riskScore} />
                </div>
              ))
            )}
          </div>
        </div>

        <div className="card">
          <h3>Your community groups</h3>
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            {groups === null ? (
              <Loading />
            ) : (
              groups.slice(0, 5).map((g) => (
                <Link key={g.id} to={`/community/${g.id}`} style={{ textDecoration: "none", color: "var(--paper)", fontSize: 14 }}>
                  {g.name} <span style={{ color: "var(--paper-faint)", fontSize: 12 }}>({g._count.posts} posts)</span>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
