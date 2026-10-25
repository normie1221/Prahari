import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, friendlyError } from "../lib/api.js";
import { Loading, ErrorBlock } from "../components/StateBlocks.jsx";
import { getSocket } from "../lib/socket.js";
import { useCurrentUserProfile } from "../hooks/useCurrentUserProfile.js";

function StatCard({ label, value }) {
  return (
    <div className="card card--tight">
      <div className="eyebrow">{label}</div>
      <div style={{ fontSize: 28, fontFamily: "var(--font-mono)", color: "var(--paper)", marginTop: 8 }}>{value}</div>
    </div>
  );
}

function AccessRequired() {
  return (
    <div className="card" style={{ maxWidth: 480, margin: "60px auto", textAlign: "center" }}>
      <div className="eyebrow" style={{ color: "var(--amber-streetlamp)" }}>Admin access required</div>
      <h3 style={{ marginTop: 10 }}>This page is for moderators and admins</h3>
      <p style={{ marginTop: 10 }}>
        Your account doesn't have admin or moderator access. If you believe this is a mistake, ask an existing
        admin to update your role.
      </p>
      <Link to="/dashboard" className="btn btn-secondary" style={{ marginTop: 16, display: "inline-flex", textDecoration: "none" }}>
        Back to Dashboard
      </Link>
    </div>
  );
}

export default function AdminPage() {
  const { profile, loading: profileLoading, isAdmin } = useCurrentUserProfile();
  const [stats, setStats] = useState(null);
  const [pending, setPending] = useState(null);
  const [flagged, setFlagged] = useState(null);
  const [error, setError] = useState(null);
  const [liveSos, setLiveSos] = useState([]);

  function load() {
    Promise.all([
      api.get("/api/admin/stats"),
      api.get("/api/admin/reports/pending"),
      api.get("/api/admin/posts/flagged"),
    ])
      .then(([s, p, f]) => { setStats(s.data); setPending(p.data.items); setFlagged(f.data.items); })
      .catch((err) => setError(friendlyError(err)));
  }

  useEffect(() => {
    // Only call the admin endpoints once we know for sure the signed-in
    // user actually has access — avoids firing (and console-logging) 403s
    // for every regular user who lands on this page.
    if (!isAdmin) return undefined;

    load();
    const socket = getSocket();
    const onSos = (payload) => setLiveSos((prev) => [payload, ...prev].slice(0, 10));
    const onIncident = () => load();
    socket.on("sos:triggered", onSos);
    socket.on("incident:created", onIncident);
    return () => {
      socket.off("sos:triggered", onSos);
      socket.off("incident:created", onIncident);
    };
  }, [isAdmin]);

  async function handleModerate(id, status) {
    await api.patch(`/api/admin/reports/${id}/status`, { status });
    load();
  }

  if (profileLoading) return <Loading label="Checking access…" />;
  if (!isAdmin) return <AccessRequired />;
  if (error) return <ErrorBlock message={error} />;
  if (!stats) return <Loading label="Loading admin dashboard…" />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 1080 }}>
      <div>
        <div className="eyebrow">Admin</div>
        <h2 style={{ marginTop: 6 }}>Safety operations dashboard</h2>
      </div>

      {liveSos.length > 0 && (
        <div className="card" style={{ borderColor: "var(--coral-signal)" }}>
          <div className="eyebrow" style={{ color: "var(--coral-signal)" }}>Live SOS alerts</div>
          {liveSos.map((s, i) => (
            <p key={i} style={{ marginTop: 8, color: "var(--paper)" }}>
              {s.userName || "A user"} triggered SOS at {s.event.latitude.toFixed(4)}, {s.event.longitude.toFixed(4)}
            </p>
          ))}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14 }}>
        <StatCard label="Total reports" value={stats.totalReports} />
        <StatCard label="Verified" value={stats.verifiedReports} />
        <StatCard label="Pending" value={stats.pendingReports} />
        <StatCard label="Active journeys" value={stats.activeJourneys} />
        <StatCard label="Total users" value={stats.totalUsers} />
        <StatCard label="Community posts" value={stats.totalCommunityPosts} />
      </div>

      <div className="card">
        <h3>Pending incident reports</h3>
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          {pending?.length === 0 ? <p style={{ fontSize: 13 }}>Nothing pending.</p> : pending?.map((inc) => (
            <div key={inc.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--ink-line)" }}>
              <div>
                <strong>{inc.type.replaceAll("_", " ")}</strong>
                <p style={{ fontSize: 13, marginTop: 4 }}>{inc.description}</p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => handleModerate(inc.id, "VERIFIED")}>Verify</button>
                <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => handleModerate(inc.id, "REJECTED")}>Reject</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h3>Flagged community posts</h3>
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          {flagged?.length === 0 ? <p style={{ fontSize: 13 }}>Nothing flagged.</p> : flagged?.map((p) => (
            <div key={p.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--ink-line)" }}>
              <div style={{ fontSize: 12, color: "var(--paper-faint)" }}>{p.group.name} · {p.user?.name}</div>
              <p style={{ fontSize: 13, marginTop: 4 }}>{p.content}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
