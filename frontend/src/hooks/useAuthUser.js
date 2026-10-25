import { useAuth, useUser } from "@clerk/clerk-react";
import { useEffect, useMemo } from "react";
import { attachAuthInterceptor } from "../lib/api.js";

export const DEV_BYPASS = import.meta.env.VITE_AUTH_DEV_BYPASS === "true";

function useAuthUserClerk() {
  const { isSignedIn, getToken, signOut } = useAuth();
  const { user } = useUser();

  useEffect(() => {
    attachAuthInterceptor(getToken);
  }, [getToken]);

  return useMemo(
    () => ({
      isSignedIn,
      displayName: user?.fullName || user?.firstName || "there",
      imageUrl: user?.imageUrl,
      signOut,
    }),
    [isSignedIn, user, signOut],
  );
}

function useAuthUserDevBypass() {
  useEffect(() => {
    attachAuthInterceptor(async () => "dev-bypass");
  }, []);
  return { isSignedIn: true, displayName: "Dev User", imageUrl: null, signOut: async () => {} };
}

// DEV_BYPASS is fixed at build time (import.meta.env), so this picks one
// implementation once at module load — the hook used never changes across
// renders, so this does not violate the Rules of Hooks.
export const useAuthUser = DEV_BYPASS ? useAuthUserDevBypass : useAuthUserClerk;
