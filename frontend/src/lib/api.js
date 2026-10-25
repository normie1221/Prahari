import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

export const api = axios.create({ baseURL: API_BASE_URL });

/** Call once near the app root: wires Clerk's getToken() into every
 * outgoing request so the backend can verify the session. */
export function attachAuthInterceptor(getToken) {
  api.interceptors.request.use(async (config) => {
    try {
      const token = await getToken?.();
      if (token) config.headers.Authorization = `Bearer ${token}`;
    } catch {
      // no session yet — request proceeds unauthenticated where allowed
    }
    return config;
  });
}

export function friendlyError(err) {
  return err?.response?.data?.message || err?.message || "Something went wrong. Please try again.";
}
