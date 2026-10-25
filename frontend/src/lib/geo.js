import { api } from "./api.js";

// All place lookups go through the PRAHARI backend (/api/geo), which handles
// provider choice, fair-use throttling, caching and timeouts. Every call here
// also has its own timeout, so the UI can never hang on a lookup.

function nearParams(near) {
  return near && Number.isFinite(near.lat) && Number.isFinite(near.lon) ? { lat: near.lat, lon: near.lon } : {};
}

/** Suggestions while typing -> { places: [...], unavailable: bool } */
export async function suggestPlaces(q, near, signal) {
  const { data } = await api.get("/api/geo/suggest", { params: { q, ...nearParams(near) }, signal, timeout: 10000 });
  return { places: data?.places || [], unavailable: Boolean(data?.unavailable) };
}

/** Best single match for typed text, or null if nothing matches. */
export async function geocodePlace(q, near) {
  try {
    const { data } = await api.get("/api/geo/geocode", { params: { q, ...nearParams(near) }, timeout: 15000 });
    return data?.place || null;
  } catch (err) {
    if (err?.response?.status === 404) return null;
    throw err;
  }
}

/** Coordinates -> place (or null). */
export async function reversePlace(lat, lon) {
  const { data } = await api.get("/api/geo/reverse", { params: { lat, lon }, timeout: 15000 });
  return data?.place || null;
}
