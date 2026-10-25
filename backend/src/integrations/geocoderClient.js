/**
 * Geocoder client (place search, suggestions, reverse lookup)
 * ============================================================
 * Providers, both free and OpenStreetMap-based:
 *   - Photon (photon.komoot.io): built for search-as-you-type. Used for live
 *     suggestions, one-off lookups and reverse lookups.
 *   - Nominatim (nominatim.openstreetmap.org): FALLBACK ONLY for one-off
 *     lookups and reverse lookups. Its usage policy forbids autocomplete, so
 *     it is never used for suggestions.
 *
 * Fair use: both public services ask for about one request per second, an
 * identifying User-Agent and caching. This module enforces all three for the
 * whole backend (not per user): a per-provider throttle, a shared cache, and
 * a descriptive User-Agent. Every upstream call has a hard timeout, so a slow
 * provider can never leave the app hanging.
 */
import axios from "axios";
import { env } from "../config/env.js";

const TIMEOUT_MS = 6000;
const http = axios.create({
  timeout: TIMEOUT_MS,
  headers: { "User-Agent": env.geocoderUserAgent, Accept: "application/json" },
});

// --- shared cache (simple TTL + size cap) ----------------------------------
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX = 1000;
const cache = new Map();
function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > CACHE_TTL_MS) { cache.delete(key); return undefined; }
  return hit.value;
}
function cacheSet(key, value) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value); // drop oldest
  cache.set(key, { at: Date.now(), value });
}

// --- per-provider throttle: at most one upstream call per interval ---------
export class BusyError extends Error {}
function makeThrottle(intervalMs, maxQueue) {
  let next = 0;
  let queued = 0;
  return async function schedule(fn) {
    if (queued >= maxQueue) throw new BusyError("Place search is busy, please try again.");
    queued += 1;
    try {
      const now = Date.now();
      const wait = Math.max(0, next - now);
      next = Math.max(now, next) + intervalMs;
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      return await fn();
    } finally {
      queued -= 1;
    }
  };
}
const photonThrottle = makeThrottle(env.geocoderMinIntervalMs, 4);
const nominatimThrottle = makeThrottle(env.geocoderMinIntervalMs, 2);

// --- normalisation into one place shape --------------------------------------
function uniqParts(parts, exclude) {
  const seen = new Set([String(exclude || "").toLowerCase()]);
  const out = [];
  for (const p of parts) {
    const k = String(p || "").trim();
    if (!k || seen.has(k.toLowerCase())) continue;
    seen.add(k.toLowerCase());
    out.push(k);
  }
  return out;
}

export function photonFeatureToPlace(f) {
  const p = f?.properties || {};
  const coords = f?.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const [lon, lat] = coords.map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const street = [p.housenumber, p.street].filter(Boolean).join(" ");
  const name = p.name || street || p.locality || p.district || p.city || p.county || p.state;
  if (!name) return null;
  const secondary = uniqParts([p.name ? street : null, p.locality, p.district, p.city || p.county, p.state], name);
  return {
    id: `${p.osm_type || "x"}${p.osm_id || `${lat},${lon}`}`,
    name,
    secondary: secondary.join(", "),
    label: [name, ...secondary].join(", "),
    lat,
    lon,
    kind: p.osm_value || p.type || null,
  };
}

export function nominatimItemToPlace(it) {
  const lat = Number(it?.lat);
  const lon = Number(it?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !it?.display_name) return null;
  const parts = String(it.display_name).split(",").map((s) => s.trim()).filter(Boolean);
  const name = it.name || parts[0];
  const secondary = uniqParts(parts.slice(1, 4), name);
  return {
    id: `${it.osm_type || "x"}${it.osm_id || `${lat},${lon}`}`,
    name,
    secondary: secondary.join(", "),
    label: [name, ...secondary].join(", "),
    lat,
    lon,
    kind: it.type || null,
  };
}

function dedupe(places) {
  const seen = new Set();
  return places.filter((p) => {
    if (!p) return false;
    const k = p.label.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// India bounding box (minLon, minLat, maxLon, maxLat) - PRAHARI is India-focused.
export const INDIA_BBOX = "68.1,6.5,97.5,35.7";

// --- Photon -------------------------------------------------------------------
export async function photonSearch(q, { near, limit = 6 } = {}) {
  const key = `ps|${q.toLowerCase()}|${near ? `${near.lat.toFixed(2)},${near.lon.toFixed(2)}` : "-"}|${limit}`;
  const cached = cacheGet(key);
  if (cached) return cached;
  const params = { q, limit, lang: "en", bbox: INDIA_BBOX };
  if (near) { params.lat = near.lat; params.lon = near.lon; }
  const { data } = await photonThrottle(() => http.get(`${env.photonUrl}/api`, { params }));
  const places = dedupe((data?.features || []).map(photonFeatureToPlace));
  cacheSet(key, places);
  return places;
}

export async function photonReverse(lat, lon) {
  const key = `pr|${lat.toFixed(4)},${lon.toFixed(4)}`;
  const cached = cacheGet(key);
  if (cached !== undefined) return cached;
  const { data } = await photonThrottle(() => http.get(`${env.photonUrl}/reverse`, { params: { lat, lon, lang: "en", limit: 1 } }));
  const place = photonFeatureToPlace(data?.features?.[0]) || null;
  cacheSet(key, place);
  return place;
}

// --- Nominatim (fallback only; never for suggestions) ------------------------
export async function nominatimSearch(q, { near } = {}) {
  const key = `ns|${q.toLowerCase()}|${near ? `${near.lat.toFixed(2)},${near.lon.toFixed(2)}` : "-"}`;
  const cached = cacheGet(key);
  if (cached) return cached;
  const params = { q, format: "jsonv2", limit: 1, countrycodes: "in" };
  if (near) {
    const d = 0.5;
    params.viewbox = `${near.lon - d},${near.lat + d},${near.lon + d},${near.lat - d}`;
  }
  const { data } = await nominatimThrottle(() => http.get(`${env.nominatimUrl}/search`, { params }));
  const places = dedupe((Array.isArray(data) ? data : []).map(nominatimItemToPlace));
  cacheSet(key, places);
  return places;
}

export async function nominatimReverse(lat, lon) {
  const key = `nr|${lat.toFixed(4)},${lon.toFixed(4)}`;
  const cached = cacheGet(key);
  if (cached !== undefined) return cached;
  const { data } = await nominatimThrottle(() => http.get(`${env.nominatimUrl}/reverse`, { params: { lat, lon, format: "jsonv2" } }));
  const place = nominatimItemToPlace(data) || null;
  cacheSet(key, place);
  return place;
}

export function _resetForTests() { cache.clear(); }
