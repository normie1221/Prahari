/**
 * Navigation Service Client
 * =========================
 * The Node backend NEVER runs the Python model itself — it calls the
 * dedicated navigation-service (FastAPI) over HTTP, exactly as required:
 * React -> Node API -> Navigation Controller -> Navigation Service ->
 * existing navigation model -> results -> Node API -> React.
 */
import axios from "axios";
import { env } from "../config/env.js";
import { ApiError } from "../middleware/errorHandler.js";

const client = axios.create({
  baseURL: env.navigationServiceUrl,
  timeout: 60_000, // area builds now run in the background (202 + polling), so requests return fast
  headers: { "X-Internal-Token": env.navigationServiceToken },
});

/** Returns either { routes, area, ... } or, while the navigation service is
 * still preparing the safety map for a new area, { building: true, ... }
 * (HTTP 202 from the service) so the client can poll instead of hanging. */
export async function fetchRoutes({ origin, destination, mode = "walking", departureTime }) {
  try {
    const res = await client.post("/api/v1/route", { origin, destination, mode, departureTime });
    if (res.status === 202) return { building: true, ...res.data };
    return res.data;
  } catch (err) {
    if (err.response) {
      const status = err.response.status;
      const detail = err.response.data?.detail;
      const message = typeof detail === "string" ? detail : "Navigation service could not compute a route.";
      if (status === 404) throw new ApiError(404, message);
      if (status === 422) throw new ApiError(400, typeof detail === "string" ? detail : "Invalid start or destination.");
      throw new ApiError(502, message);
    }
    if (err.code === "ECONNABORTED") {
      throw new ApiError(504, "The navigation service took too long to respond. Please try again.");
    }
    throw new ApiError(503, "Navigation service is unavailable. Please check it's running.");
  }
}

export async function fetchHeatmap({ minLat, minLon, maxLat, maxLon }) {
  try {
    const { data } = await client.get("/api/v1/heatmap", { params: { minLat, minLon, maxLat, maxLon } });
    return data;
  } catch (err) {
    throw new ApiError(503, "Could not load safety heatmap data right now.");
  }
}

export async function warmArea({ name, lat, lon, radiusM }) {
  try {
    const { data } = await client.post("/api/v1/areas/warm", { name, lat, lon, radiusM });
    return data;
  } catch (err) {
    throw new ApiError(502, err.response?.data?.detail || "Could not warm navigation area.");
  }
}

export async function listAreas() {
  try {
    const { data } = await client.get("/api/v1/areas");
    return data;
  } catch (err) {
    throw new ApiError(503, "Navigation service is unavailable.");
  }
}

export async function checkHealth() {
  try {
    const { data } = await client.get("/health", { timeout: 5000 });
    return data;
  } catch (err) {
    return { status: "unreachable" };
  }
}
