import { NavLink } from "react-router-dom";
import { UserButton } from "@clerk/clerk-react";
import { useAuthUser, DEV_BYPASS } from "../../hooks/useAuthUser.js";
import { useCurrentUserProfile } from "../../hooks/useCurrentUserProfile.js";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: "◧" },
  { to: "/navigation", label: "Navigate", icon: "◈" },
  { to: "/incidents", label: "Incidents", icon: "▲" },
  { to: "/community", label: "Community", icon: "◎" },
  { to: "/emergency", label: "Emergency", icon: "◉" },
  { to: "/profile", label: "Profile", icon: "◐" },
];

const ADMIN_NAV_ITEM = { to: "/admin", label: "Admin", icon: "◫" };

export default function AppShell({ children }) {
  const { isSignedIn, displayName } = useAuthUser();
  const { isAdmin } = useCurrentUserProfile();
  const navItems = isAdmin ? [...NAV_ITEMS, ADMIN_NAV_ITEM] : NAV_ITEMS;

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <aside
        style={{
          width: "var(--sidebar-width)",
          flexShrink: 0,
          background: "var(--ink-surface)",
          borderRight: "1px solid var(--ink-line)",
          display: "flex",
          flexDirection: "column",
          padding: "var(--space-5) var(--space-3)",
        }}
      >
        <div style={{ padding: "0 var(--space-3)", marginBottom: "var(--space-6)" }}>
          <span style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, color: "var(--amber-streetlamp)" }}>
            PRAHARI
          </span>
        </div>
        <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              style={({ isActive }) => ({
                display: "flex",
                alignItems: "center",
                gap: "var(--space-3)",
                padding: "10px 12px",
                borderRadius: "var(--radius-sm)",
                fontSize: 14,
                fontWeight: 500,
                color: isActive ? "var(--ink-night)" : "var(--paper-muted)",
                background: isActive ? "var(--amber-streetlamp)" : "transparent",
                textDecoration: "none",
              })}
            >
              <span aria-hidden style={{ width: 18, textAlign: "center" }}>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div style={{ marginTop: "auto", padding: "var(--space-3)" }}>
          <div className="eyebrow">Signed in as</div>
          <div style={{ fontSize: 13, color: "var(--paper)", marginTop: 4 }}>{displayName}</div>
        </div>
      </aside>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <header
          style={{
            height: "var(--topbar-height)",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: "var(--space-4)",
            padding: "0 var(--space-6)",
            borderBottom: "1px solid var(--ink-line)",
          }}
        >
          <NavLink to="/emergency" className="btn btn-danger" style={{ textDecoration: "none", fontSize: 13 }}>
            SOS
          </NavLink>
          {isSignedIn && !DEV_BYPASS && <UserButton afterSignOutUrl="/" />}
        </header>
        <main style={{ flex: 1, padding: "var(--space-6)", overflowY: "auto" }}>{children}</main>
      </div>
    </div>
  );
}
