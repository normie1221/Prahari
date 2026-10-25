import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import MapView from "../components/MapView.jsx";
import RiskBadge from "../components/RiskBadge.jsx";
import { Loading, ErrorBlock } from "../components/StateBlocks.jsx";
import { api, friendlyError } from "../lib/api.js";
import { getSocket } from "../lib/socket.js";

export default function JourneyPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [journey, setJourney] = useState(null);
  const [error, setError] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const watchIdRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    api.get(`/api/journeys/${id}`)
      .then(({ data }) => {
        if (cancelled) return;
        setJourney(data.journey);
        setAlerts(data.journey.alerts || []);
      })
      .catch((err) => !cancelled && setError(friendlyError(err)));

    const socket = getSocket();
    const onUpdate = ({ journey: j, newAlert }) => {
      if (j.id !== id) return;
      setJourney(j);
      if (newAlert) setAlerts((prev) => [newAlert, ...prev]);
    };
    socket.on("journey:updated", onUpdate);
    return () => {
      cancelled = true;
      socket.off("journey:updated", onUpdate);
    };
  }, [id]);

  useEffect(() => {
    if (!journey || journey.status !== "ACTIVE" || !navigator.geolocation) return undefined;
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        api.patch(`/api/journeys/${id}`, {
          currentLatitude: pos.coords.latitude,
          currentLongitude: pos.coords.longitude,
        }).catch(() => {});
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 },
    );
    return () => navigator.geolocation.clearWatch(watchIdRef.current);
  }, [journey?.status, id]);

  async function handleComplete() {
    try {
      const { data } = await api.patch(`/api/journeys/${id}`, { status: "COMPLETED" });
      setJourney(data.journey);
    } catch (err) {
      setError(friendlyError(err));
    }
  }

  if (error) return <ErrorBlock message={error} onRetry={() => navigate("/navigation")} />;
  if (!journey) return <Loading label="Loading journey…" />;

  const route = journey.route;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: 24, height: "calc(100vh - var(--topbar-height) - 48px)" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, overflowY: "auto" }}>
        <div>
          <div className="eyebrow">Active journey</div>
          <h2 style={{ marginTop: 6 }}>{route?.originLabel || "Start"} → {route?.destLabel || "Destination"}</h2>
        </div>

        <div className="card card--tight" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span className="pill">{journey.status}</span>
          {route && <RiskBadge category={route.riskScore <= 33 ? "LOWER_RISK" : route.riskScore <= 66 ? "MODERATE_RISK" : "HIGHER_RISK"} score={route.riskScore} />}
        </div>

        <div className="card">
          <h3>Alerts</h3>
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            {alerts.length === 0 ? (
              <p style={{ fontSize: 13 }}>No alerts yet — you're on track.</p>
            ) : (
              alerts.map((a) => (
                <div key={a.id} style={{ fontSize: 13, padding: "8px 0", borderBottom: "1px solid var(--ink-line)" }}>
                  <strong style={{ color: a.severity === "CRITICAL" ? "var(--coral-signal)" : "var(--amber-streetlamp)" }}>{a.severity}</strong>
                  <p style={{ marginTop: 4 }}>{a.message}</p>
                </div>
              ))
            )}
          </div>
        </div>

        {journey.status === "ACTIVE" && (
          <button className="btn btn-primary" onClick={handleComplete}>Mark journey complete</button>
        )}
      </div>

      <div style={{ borderRadius: "var(--radius-md)", overflow: "hidden" }}>
        <MapView
          origin={route ? { lat: route.originLat, lon: route.originLon } : null}
          destination={route ? { lat: route.destLat, lon: route.destLon } : null}
          routes={route ? [{
            id: route.id,
            type: route.routeType,
            geometry: route.geometry,
            segments: route.segmentData || undefined,
            avgSafetyScore: route.avgSafetyScore ?? undefined,
          }] : []}
          selectedRouteId={route?.id}
        />
      </div>
    </div>
  );
}
