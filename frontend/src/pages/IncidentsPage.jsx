import { useEffect, useState } from "react";
import MapView from "../components/MapView.jsx";
import { Loading, ErrorBlock, EmptyBlock } from "../components/StateBlocks.jsx";
import { api, friendlyError } from "../lib/api.js";

const TYPES = ["HARASSMENT", "THEFT", "ASSAULT", "SUSPICIOUS_ACTIVITY", "ACCIDENT", "POOR_LIGHTING", "UNSAFE_AREA", "OTHER"];

// Default view when no incidents are loaded yet — Bengaluru core, matching
// the navigation service's default warm area (see navigation-service/.env.example).
const DEFAULT_BBOX = { minLat: 12.90, minLon: 77.53, maxLat: 13.03, maxLon: 77.68 };

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState(null);
  const [heatmapPoints, setHeatmapPoints] = useState([]);
  const [error, setError] = useState(null);
  const [filterType, setFilterType] = useState("");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ type: "SUSPICIOUS_ACTIVITY", description: "", severity: "MEDIUM", isAnonymous: false, latitude: "", longitude: "" });
  const [submitting, setSubmitting] = useState(false);

  function load() {
    setIncidents(null);
    api.get("/api/incidents", { params: { ...(filterType ? { type: filterType } : {}), ...(verifiedOnly ? { status: "VERIFIED" } : {}) } })
      .then(({ data }) => setIncidents(data.items))
      .catch((err) => setError(friendlyError(err)));
  }

  useEffect(load, [filterType, verifiedOnly]);

  // Model-predicted risk layer — combined with (but visually distinguished
  // from) community reports, per PRAHARI's "clearly distinguish sources"
  // requirement. Silently skipped if the navigation service has no warm
  // area covering this view yet, rather than fabricating data.
  useEffect(() => {
    if (!showHeatmap) { setHeatmapPoints([]); return; }
    api.get("/api/navigation/heatmap", { params: DEFAULT_BBOX })
      .then(({ data }) => setHeatmapPoints(data.points || []))
      .catch(() => setHeatmapPoints([])); // best-effort overlay, not critical path
  }, [showHeatmap]);

  function useMyLocation() {
    navigator.geolocation?.getCurrentPosition((pos) => {
      setForm((f) => ({ ...f, latitude: pos.coords.latitude, longitude: pos.coords.longitude }));
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.post("/api/incidents", {
        ...form,
        latitude: Number(form.latitude),
        longitude: Number(form.longitude),
      });
      setShowForm(false);
      setForm({ type: "SUSPICIOUS_ACTIVITY", description: "", severity: "MEDIUM", isAnonymous: false, latitude: "", longitude: "" });
      load();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "380px 1fr", gap: 24, height: "calc(100vh - var(--topbar-height) - 48px)" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, overflowY: "auto", paddingRight: 4 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div className="eyebrow">Community reports</div>
            <h2 style={{ marginTop: 6 }}>Incidents</h2>
          </div>
          <button className="btn btn-primary" onClick={() => setShowForm((s) => !s)}>{showForm ? "Cancel" : "Report"}</button>
        </div>

        {showForm && (
          <form onSubmit={handleSubmit} className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label>Type</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {TYPES.map((t) => <option key={t} value={t}>{t.replaceAll("_", " ")}</option>)}
              </select>
            </div>
            <div>
              <label>Severity</label>
              <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </div>
            <div>
              <label>Description</label>
              <textarea rows={3} required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <button type="button" className="btn btn-secondary" onClick={useMyLocation}>Use my current location</button>
            {form.latitude && <p style={{ fontSize: 12 }}>Location set: {Number(form.latitude).toFixed(4)}, {Number(form.longitude).toFixed(4)}</p>}
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" style={{ width: "auto" }} checked={form.isAnonymous} onChange={(e) => setForm({ ...form, isAnonymous: e.target.checked })} />
              Report anonymously
            </label>
            <p style={{ fontSize: 12 }}>
              New reports start as <strong style={{ color: "var(--paper)" }}>unverified</strong> and carry limited
              weight until a moderator reviews them — see Admin.
            </p>
            <button className="btn btn-primary" type="submit" disabled={submitting || !form.latitude}>
              {submitting ? "Submitting…" : "Submit report"}
            </button>
          </form>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label>Filter by type</label>
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
              <option value="">All</option>
              {TYPES.map((t) => <option key={t} value={t}>{t.replaceAll("_", " ")}</option>)}
            </select>
          </div>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <input type="checkbox" style={{ width: "auto" }} checked={verifiedOnly} onChange={(e) => setVerifiedOnly(e.target.checked)} />
          Verified reports only
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <input type="checkbox" style={{ width: "auto" }} checked={showHeatmap} onChange={(e) => setShowHeatmap(e.target.checked)} />
          Show model-predicted risk overlay
        </label>

        {error && <ErrorBlock message={error} />}
        {incidents === null ? (
          <Loading />
        ) : incidents.length === 0 ? (
          <EmptyBlock title="No incidents reported" hint="Reports from your community will appear here." />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {incidents.map((inc) => (
              <div key={inc.id} className="card card--tight">
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <strong>{inc.type.replaceAll("_", " ")}</strong>
                  <span className="pill" style={{ color: inc.status === "VERIFIED" ? "var(--green-banyan)" : "var(--amber-streetlamp)" }}>
                    {inc.status === "VERIFIED" ? "Verified" : inc.status}
                  </span>
                </div>
                <p style={{ marginTop: 6, fontSize: 13 }}>{inc.description}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ borderRadius: "var(--radius-md)", overflow: "hidden" }}>
        <MapView incidents={incidents || []} heatmapPoints={heatmapPoints} />
      </div>
    </div>
  );
}
