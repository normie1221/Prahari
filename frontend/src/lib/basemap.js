/**
 * Map background (basemap) selection.
 *
 * CARTO now requires a free API key for its basemap tiles; without one every
 * tile is stamped with an "API KEY REQUIRED" watermark. So:
 *   - If VITE_CARTO_API_KEY is set in frontend/.env -> CARTO Dark Matter
 *     (the original PRAHARI look). Free key, no account needed:
 *     https://carto.com/basemaps/apikey/
 *   - Otherwise -> standard OpenStreetMap tiles (no key needed), darkened with
 *     a CSS filter applied ONLY to the tile layer, so routes, heatmap dots and
 *     markers keep their true colours.
 */
export function getBaseLayerConfig(cartoKey) {
  const key = (cartoKey || "").trim();
  if (key) {
    return {
      provider: "carto",
      url: `https://basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png?key=${encodeURIComponent(key)}`,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      className: "",
      maxZoom: 20,
    };
  }
  return {
    provider: "osm",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    className: "prahari-dark-tiles",
    maxZoom: 19,
  };
}

const STYLE_ID = "prahari-dark-tiles-style";
export function ensureDarkTileStyle() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const s = document.createElement("style");
  s.id = STYLE_ID;
  s.textContent =
    ".prahari-dark-tiles { filter: invert(100%) hue-rotate(180deg) brightness(95%) contrast(90%) saturate(60%); }";
  document.head.appendChild(s);
}
