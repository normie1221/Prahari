import * as geo from "../integrations/geocoderClient.js";
import { logger } from "../config/logger.js";

/** Live suggestions while typing. Photon only (Nominatim forbids autocomplete).
 *  Failures degrade to an empty list with `unavailable: true`, never an error page. */
export async function suggest(q, near) {
  try {
    return { places: await geo.photonSearch(q, { near, limit: 6 }), unavailable: false };
  } catch (err) {
    if (err instanceof geo.BusyError) return { places: [], unavailable: true, busy: true };
    logger.warn({ err: err.message }, "[geo] suggestion lookup failed");
    return { places: [], unavailable: true };
  }
}

/** One-off lookup of typed text (when the user didn't pick a suggestion).
 *  Photon first, then Nominatim as a fallback. Returns the best place or null. */
export async function geocode(q, near) {
  try {
    const places = await geo.photonSearch(q, { near, limit: 1 });
    if (places.length) return places[0];
  } catch (err) {
    logger.warn({ err: err.message }, "[geo] Photon lookup failed, trying Nominatim");
  }
  try {
    const places = await geo.nominatimSearch(q, { near });
    return places[0] || null;
  } catch (err) {
    logger.warn({ err: err.message }, "[geo] Nominatim lookup failed");
    const e = new Error("Place search is temporarily unavailable. Please try again in a moment.");
    e.status = 503;
    throw e;
  }
}

/** Coordinates -> readable place (for "use my current location"). */
export async function reverse(lat, lon) {
  try {
    const p = await geo.photonReverse(lat, lon);
    if (p) return p;
  } catch (err) {
    logger.warn({ err: err.message }, "[geo] Photon reverse failed, trying Nominatim");
  }
  try {
    return await geo.nominatimReverse(lat, lon);
  } catch (err) {
    logger.warn({ err: err.message }, "[geo] Nominatim reverse failed");
    return null;
  }
}
