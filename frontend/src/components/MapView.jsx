import { MapContainer, TileLayer, Polyline, Marker, Popup, CircleMarker, useMap } from "react-leaflet";
import { useEffect } from "react";
import L from "leaflet";
import { getBaseLayerConfig, ensureDarkTileStyle } from "../lib/basemap.js";

const BASE_LAYER = getBaseLayerConfig(import.meta.env.VITE_CARTO_API_KEY);
ensureDarkTileStyle();

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const ROUTE_COLORS = { SAFEST: "#45B892", FASTEST: "#EF6156", BALANCED: "#F2B747" };

function safetyScoreToColor(score) {
  if (typeof score !== "number" || !Number.isFinite(score)) return "#F2B747";
  const t = Math.max(0, Math.min(1, (score - 1) / 9));
  const stops = [
    { at: 0, c: [239, 97, 86] },
    { at: 0.5, c: [242, 183, 71] },
    { at: 1, c: [69, 184, 146] },
  ];
  let a = stops[0], b = stops[1];
  if (t > 0.5) { a = stops[1]; b = stops[2]; }
  const localT = a.at === b.at ? 0 : (t - a.at) / (b.at - a.at);
  const c = a.c.map((v, i) => Math.round(v + (b.c[i] - v) * localT));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

function FitBounds({ bounds }) {
  const map = useMap();
  useEffect(() => {
    if (bounds && bounds.length) map.fitBounds(bounds, { padding: [40, 40] });
  }, [bounds, map]);
  return null;
}

function MapLegend({ showHeatmap, showIncidents, showRouteSegments }) {
  return (
    <div
      style={{
        position: "absolute", bottom: 12, left: 12, zIndex: 1000,
        background: "rgba(14,18,38,0.92)", border: "1px solid var(--ink-line)",
        borderRadius: "var(--radius-sm)", padding: "10px 14px",
        fontSize: 12, color: "var(--paper-muted)", lineHeight: 1.7,
        pointerEvents: "none",
      }}
    >
      {showRouteSegments && (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span>Route segment safety:</span>
          <span style={{ display: "inline-block", width: 40, height: 8, borderRadius: 4, background: "linear-gradient(90deg, #EF6156, #F2B747, #45B892)" }} />
          <span>risky → safe</span>
        </div>
      )}
      {showHeatmap && (
        <div><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: "#F2B747", marginRight: 8 }} />Model-predicted risk (map proxies, not verified data)</div>
      )}
      {showIncidents && (
        <>
          <div><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: "#EF6156", marginRight: 8, border: "2px solid #EF6156" }} />Moderator-verified community report</div>
          <div><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: "transparent", marginRight: 8, border: "2px dashed #EF6156" }} />Unverified community report</div>
        </>
      )}
    </div>
  );
}

export default function MapView({
  origin,
  destination,
  routes = [],
  selectedRouteId,
  incidents = [],
  heatmapPoints = [],
  height = "100%",
  showLegend = true,
}) {
  const center = origin ? [origin.lat, origin.lon] : [12.9716, 77.5946];
  const bounds = [];
  if (origin) bounds.push([origin.lat, origin.lon]);
  if (destination) bounds.push([destination.lat, destination.lon]);
  routes.forEach((r) => r.geometry?.forEach((p) => bounds.push(p)));

  return (
    <div style={{ position: "relative", height, width: "100%" }}>
      <MapContainer center={center} zoom={14} style={{ height: "100%", width: "100%", borderRadius: "var(--radius-md)" }}>
        <TileLayer
          key={BASE_LAYER.provider}
          attribution={BASE_LAYER.attribution}
          url={BASE_LAYER.url}
          className={BASE_LAYER.className}
          maxZoom={BASE_LAYER.maxZoom}
        />

        {heatmapPoints.map((p, i) => (
          <CircleMarker
            key={`hm-${i}`}
            center={[p.lat, p.lon]}
            radius={5}
            pathOptions={{
              color: p.safetyScore >= 6.5 ? "#45B892" : p.safetyScore >= 4 ? "#F2B747" : "#EF6156",
              fillOpacity: 0.5,
              weight: 0,
            }}
          >
            <Popup>Model-predicted safety score: {p.safetyScore.toFixed(1)}/10 (not verified crime data)</Popup>
          </CircleMarker>
        ))}

        {routes
          .filter((r) => r.id !== selectedRouteId)
          .map((r) => (
            <Polyline
              key={r.id}
              positions={r.geometry}
              pathOptions={{ color: ROUTE_COLORS[r.type] || "#F2B747", weight: 3, opacity: 0.35 }}
            />
          ))}

        {routes
          .filter((r) => r.id === selectedRouteId)
          .map((r) =>
            (r.segments && r.segments.length > 0 ? r.segments : [{ geometry: r.geometry, safetyScore: r.avgSafetyScore }]).map(
              (seg, i) => (
                <Polyline
                  key={`${r.id}-seg-${i}`}
                  positions={seg.geometry}
                  pathOptions={{ color: safetyScoreToColor(seg.safetyScore), weight: 6, opacity: 0.95 }}
                >
                  <Popup>
                    Segment safety score: {typeof seg.safetyScore === "number" ? `${seg.safetyScore.toFixed(1)}/10` : "not available"}
                  </Popup>
                </Polyline>
              ),
            ),
          )}

        {incidents.map((inc) => {
          const verified = inc.status === "VERIFIED";
          return (
            <CircleMarker
              key={inc.id}
              center={[inc.latitude, inc.longitude]}
              radius={verified ? 8 : 6}
              pathOptions={{
                color: "#EF6156",
                fillOpacity: verified ? 0.75 : 0.15,
                weight: verified ? 1 : 2,
                dashArray: verified ? undefined : "4 3",
              }}
            >
              <Popup>
                <strong>{inc.type.replaceAll("_", " ")}</strong>{" "}
                <span style={{ fontSize: 11, color: verified ? "#45B892" : "#F2B747" }}>
                  ({verified ? "Verified" : "Unverified"})
                </span>
                <br />
                {inc.description}
              </Popup>
            </CircleMarker>
          );
        })}

        {origin && (
          <Marker position={[origin.lat, origin.lon]}>
            <Popup>Start</Popup>
          </Marker>
        )}
        {destination && (
          <Marker position={[destination.lat, destination.lon]}>
            <Popup>Destination</Popup>
          </Marker>
        )}

        <FitBounds bounds={bounds} />
      </MapContainer>
      {showLegend && (heatmapPoints.length > 0 || incidents.length > 0 || (selectedRouteId && routes.length > 0)) && (
        <MapLegend
          showHeatmap={heatmapPoints.length > 0}
          showIncidents={incidents.length > 0}
          showRouteSegments={Boolean(selectedRouteId) && routes.length > 0}
        />
      )}
    </div>
  );
}
