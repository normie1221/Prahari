import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import MapView from "../components/MapView.jsx";
import RouteRibbon from "../components/RouteRibbon.jsx";
import RiskBadge from "../components/RiskBadge.jsx";
import { Loading, ErrorBlock, EmptyBlock } from "../components/StateBlocks.jsx";
import { api, friendlyError } from "../lib/api.js";
import { geocodePlace, reversePlace } from "../lib/geo.js";
import PlaceInput from "../components/PlaceInput.jsx";

const POLL_LIMIT_MS = 10 * 60 * 1000; // stop waiting on an area build after 10 minutes (big areas can take ~6)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default function NavigationPage() {
  const navigate = useNavigate();
  const [originText, setOriginText] = useState("");
  const [destText, setDestText] = useState("");
  const [mode, setMode] = useState("walking");
  const [origin, setOrigin] = useState(null);
  const [destination, setDestination] = useState(null);
  const [routes, setRoutes] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [status, setStatus] = useState("idle"); // idle | geocoding | computing | done | error
  const [error, setError] = useState(null);
  const [areaInfo, setAreaInfo] = useState(null);

  // Precise GPS coords captured via "Use my current location" for the Start
  // field. Kept separate from originText so planning uses the exact
  // coordinates directly instead of re-geocoding a (possibly imprecise)
  // reverse-geocoded address string. Cleared whenever the user edits the
  // Start field by hand, so a stale location can never be silently reused.
  const [originCoords, setOriginCoords] = useState(null);
  const [destPlace, setDestPlace] = useState(null); // set when a destination suggestion is picked
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState(null);

  // While the navigation service prepares a new area's safety map (HTTP 202),
  // poll instead of holding one long request open.
  const [buildInfo, setBuildInfo] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const unmountedRef = useRef(false);
  const buildStartRef = useRef(0);
  // Reset on every mount: React.StrictMode (development) mounts, unmounts and
  // re-mounts each page once, so the flag must go back to false on re-mount.
  useEffect(() => {
    unmountedRef.current = false;
    return () => { unmountedRef.current = true; };
  }, []);
  useEffect(() => {
    if (status !== "building") return undefined;
    const t = setInterval(() => setElapsed(Math.round((Date.now() - buildStartRef.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, [status]);

  const selectedRoute = routes.find((r) => r.id === selectedId);

  function handleOriginTextChange(value) {
    setOriginText(value);
    setOriginCoords(null); // manual edit invalidates a previous GPS fix or picked suggestion
  }
  function handleDestTextChange(value) {
    setDestText(value);
    setDestPlace(null);
  }
  function handleOriginSelect(p) {
    setOriginText(p.label);
    setOriginCoords({ lat: p.lat, lon: p.lon, label: p.label, source: "suggestion" });
    setLocationError(null);
  }
  function handleDestSelect(p) {
    setDestText(p.label);
    setDestPlace({ lat: p.lat, lon: p.lon, label: p.label });
  }

  function useMyLocationForStart() {
    if (!navigator.geolocation) {
      setLocationError("Your browser doesn't support location access. Please type your start address instead.");
      return;
    }
    setLocating(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        let label = `My location (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`;
        try {
          const place = await reversePlace(latitude, longitude);
          if (place?.label) label = place.label;
        } catch {
          // keep the coordinate label; the GPS fix itself is what matters
        }
        if (unmountedRef.current) return;
        setOriginText(label);
        setOriginCoords({ lat: latitude, lon: longitude, label, source: "gps" });
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        setLocationError(
          err.code === err.PERMISSION_DENIED
            ? "Location access was denied. Please enable it in your browser's site settings, or type your start address."
            : "Could not get your current location right now. Please type your start address instead.",
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }

  async function handlePlan(e) {
    e.preventDefault();
    setError(null);
    setRoutes([]);
    setSelectedId(null);
    setBuildInfo(null);
    try {
      setStatus("geocoding");
      // Use the GPS fix / picked suggestion directly; otherwise look the typed
      // text up once via the backend. The destination is searched near the start.
      const o = originCoords || (await geocodePlace(originText, destPlace));
      if (!o) throw new Error(`Couldn't find "${originText}". Pick a place from the suggestions list.`);
      const d = destPlace || (await geocodePlace(destText, o));
      if (!d) throw new Error(`Couldn't find "${destText}". Pick a place from the suggestions list.`);
      if (unmountedRef.current) return;
      setOrigin(o);
      setDestination(d);

      setStatus("computing");
      const payload = {
        origin: { lat: o.lat, lon: o.lon },
        destination: { lat: d.lat, lon: d.lon },
        mode,
        originLabel: o.label,
        destLabel: d.label,
      };
      buildStartRef.current = Date.now();
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const res = await api.post("/api/navigation/route", payload, { timeout: 90000 });
        if (unmountedRef.current) return;
        if (res.status === 202 || res.data?.building) {
          setBuildInfo(res.data);
          setStatus("building");
          if (Date.now() - buildStartRef.current > POLL_LIMIT_MS) {
            throw new Error("Preparing the safety map for this area is taking longer than expected. Please try again in a few minutes.");
          }
          await sleep(Math.max(3, res.data?.retryAfterSeconds ?? 8) * 1000);
          if (unmountedRef.current) return;
          continue;
        }
        const { data } = res;
        setRoutes(data.routes);
        setAreaInfo(data.area);
        setSelectedId(data.routes[0]?.id);
        setBuildInfo(null);
        setStatus("done");
        break;
      }
    } catch (err) {
      if (unmountedRef.current) return;
      setBuildInfo(null);
      setError(friendlyError(err));
      setStatus("error");
    }
  }

  async function handleStartJourney() {
    if (!selectedRoute?.savedRouteId) return;
    try {
      const { data } = await api.post("/api/journeys", { routeId: selectedRoute.savedRouteId });
      navigate(`/journey/${data.journey.id}`);
    } catch (err) {
      setError(friendlyError(err));
    }
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "380px 1fr", gap: 24, height: "calc(100vh - var(--topbar-height) - 48px)" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 20, overflowY: "auto", paddingRight: 4 }}>
        <div>
          <div className="eyebrow">Plan a route</div>
          <h2 style={{ marginTop: 6 }}>Where to?</h2>
        </div>

        <form onSubmit={handlePlan} className="card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <PlaceInput
              id="origin"
              label="Start"
              placeholder="Start typing, e.g. Acharya Institute"
              value={originText}
              onTextChange={handleOriginTextChange}
              onSelect={handleOriginSelect}
              near={destPlace || undefined}
              required
            />
            <button
              type="button"
              className="btn btn-secondary"
              onClick={useMyLocationForStart}
              disabled={locating}
              style={{ marginTop: 8, fontSize: 12, padding: "6px 12px" }}
            >
              {locating ? "Locating…" : "📍 Use my current location"}
            </button>
            {originCoords?.source === "gps" && !locating && (
              <p style={{ fontSize: 11, color: "var(--green-banyan)", marginTop: 6 }}>
                Using your exact GPS location as the start point.
              </p>
            )}
            {locationError && <p style={{ fontSize: 11, color: "var(--coral-signal)", marginTop: 6 }}>{locationError}</p>}
          </div>
          <div>
            <PlaceInput
              id="dest"
              label="Destination"
              placeholder="Start typing, e.g. Sapthagiri Hospital"
              value={destText}
              onTextChange={handleDestTextChange}
              onSelect={handleDestSelect}
              near={originCoords || undefined}
              required
            />
          </div>
          <div>
            <label htmlFor="mode">Travel mode</label>
            <select id="mode" value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="walking">Walking</option>
              <option value="driving">Driving</option>
            </select>
          </div>
          <button className="btn btn-primary" type="submit" disabled={status === "geocoding" || status === "computing" || status === "building"}>
            {status === "geocoding" ? "Locating…" : status === "computing" ? "Scoring routes…" : status === "building" ? "Preparing this area…" : "Find safe routes"}
          </button>
          {status === "computing" && (
            <p style={{ fontSize: 12 }}>
              First request for a new area can take a little longer — PRAHARI is building the street-safety model
              for it. Later requests in the same area are fast.
            </p>
          )}
        </form>

        {status === "error" && <ErrorBlock message={error} onRetry={() => setStatus("idle")} />}

        {routes.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {areaInfo && (
              <p style={{ fontSize: 12 }}>
                Coverage area: <strong style={{ color: "var(--paper)" }}>{areaInfo.name}</strong> ({areaInfo.edgeCount.toLocaleString()} street segments modeled)
              </p>
            )}
            {routes.map((r) => (
              <button
                key={r.id}
                onClick={() => setSelectedId(r.id)}
                className="card card--tight"
                style={{
                  textAlign: "left",
                  cursor: "pointer",
                  borderColor: r.id === selectedId ? "var(--amber-streetlamp)" : "var(--ink-line)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <strong>{r.label}</strong>
                  <RiskBadge category={r.riskCategory} score={r.riskScore} />
                </div>
                <div style={{ marginTop: 10 }}>
                  <RouteRibbon scores={r.segmentSafetyScores} height={20} />
                </div>
                <div style={{ display: "flex", gap: 16, marginTop: 10, fontSize: 13, color: "var(--paper-muted)" }}>
                  <span>{r.distanceKm} km</span>
                  <span>{r.durationMin} min</span>
                  <span>{r.segmentCount} segments</span>
                </div>
              </button>
            ))}

            {selectedRoute && (
              <div className="card card--tight">
                <div className="eyebrow" style={{ marginBottom: 8 }}>Why this score</div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "var(--paper-muted)", display: "flex", flexDirection: "column", gap: 6 }}>
                  {selectedRoute.riskFactors.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
                <button className="btn btn-primary" style={{ marginTop: 14, width: "100%" }} onClick={handleStartJourney}>
                  Start journey with this route
                </button>
              </div>
            )}
          </div>
        )}

        {status === "idle" && routes.length === 0 && (
          <EmptyBlock title="No route planned yet" hint="Enter a start and destination to compare safest, fastest, and balanced routes." />
        )}
      </div>

      <div style={{ borderRadius: "var(--radius-md)", overflow: "hidden" }}>
        {status === "building" ? (
          <div className="card" style={{ height: "100%" }}>
            <Loading label={`Preparing the safety map for this area (${buildInfo?.areaRadiusKm ?? "?"} km radius) — first time only, usually 1–3 minutes. ${elapsed}s elapsed…`} />
            <p style={{ textAlign: "center", fontSize: 12, padding: "0 24px" }}>
              {buildInfo?.queuedBehind > 0 ? "Another area is being prepared first; yours is next. " : ""}
              You can keep this page open — routes appear automatically when it's ready. Later routes in this area are instant.
            </p>
          </div>
        ) : status === "computing" ? (
          <div className="card" style={{ height: "100%" }}>
            <Loading label="Scoring routes…" />
          </div>
        ) : (
          <MapView origin={origin} destination={destination} routes={routes} selectedRouteId={selectedId} />
        )}
      </div>
    </div>
  );
}
