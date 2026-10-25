import { useEffect, useState } from "react";
import { api } from "../lib/api.js";

/**
 * Fetches the signed-in user's own app-level profile (role, etc.) from the
 * backend once per session. Used to decide what to SHOW (e.g. the Admin nav
 * link) rather than letting the user click into a page that will just 403.
 */
export function useCurrentUserProfile() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api.get("/api/me")
      .then(({ data }) => { if (!cancelled) setProfile(data.user); })
      .catch(() => { if (!cancelled) setProfile(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return {
    profile,
    loading,
    isAdmin: profile?.role === "ADMIN" || profile?.role === "MODERATOR",
  };
}
