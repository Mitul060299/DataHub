import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { IconBell, IconChevronDown, IconCreditCard, IconLogOut, IconSettings, IconUser } from "./Icons";

const tabs = [
  { key: "home", label: "Home", path: "/home" },
  { key: "workspace", label: "Workspace", path: "/workspace" },
  { key: "marketplace", label: "Marketplace", path: "/marketplace" },
];

export function TopBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { session, user, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const activeTab = useMemo(() => {
    const match = tabs.find((tab) => location.pathname.startsWith(tab.path));
    return match?.key ?? "";
  }, [location.pathname]);

  const displayInitial = useMemo(() => {
    const name = user?.user_metadata?.full_name as string | undefined;
    if (name?.trim()) {
      return name.trim().charAt(0).toUpperCase();
    }
    return user?.email?.charAt(0).toUpperCase() ?? "U";
  }, [user?.email, user?.user_metadata]);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const handleOutsideClick = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [menuOpen]);

  const navigateAndClose = (path: string) => {
    navigate(path);
    setMenuOpen(false);
  };

  const handleSignOut = async () => {
    setMenuOpen(false);
    await signOut();
    navigate("/login", { replace: true });
  };

  return (
    <header style={{ height: "var(--th)", borderBottom: "1px solid #22222a", background: "#111115", display: "grid", gridTemplateColumns: "280px 1fr 280px", alignItems: "center", padding: "0 14px", gap: 12, flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => navigate("/home")}
        style={{ display: "inline-flex", alignItems: "center", gap: 10, width: "fit-content" }}
      >
        <svg width="30" height="30" viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <rect width="32" height="32" rx="8" fill="#5B6AF0" />
          <ellipse cx="16" cy="22" rx="10" ry="3.5" fill="white" opacity="0.35" />
          <ellipse cx="16" cy="16" rx="10" ry="3.5" fill="white" opacity="0.6" />
          <ellipse cx="16" cy="10" rx="10" ry="3.5" fill="white" opacity="0.95" />
        </svg>
        <span
          style={{
            fontFamily: "'Syne', sans-serif",
            fontSize: "17px",
            fontWeight: 800,
            color: "#e8e8f0",
            letterSpacing: "-0.02em",
          }}
        >
          Data<span style={{ color: "#818cf8" }}>Hub</span>
        </span>
      </button>

      <div style={{ display: "flex", justifyContent: "center" }}>
        <nav style={{ display: "inline-flex", alignItems: "center", gap: 22 }}>
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => navigate(tab.path)}
              style={{
                height: "var(--th)",
                borderBottom: activeTab === tab.key ? "2px solid #5B6AF0" : "2px solid transparent",
                color: activeTab === tab.key ? "#e8e8f0" : "#8888a0",
                fontSize: 13,
                padding: "0 2px",
              }}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10 }}>
        {session ? (
          <>
            <button className="btn" style={{ width: 30, padding: 0 }} type="button" aria-label="Notifications">
              <IconBell size={14} />
            </button>
            <div ref={menuRef} style={{ position: "relative" }}>
              <button
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                style={{
                  height: 32,
                  borderRadius: 999,
                  border: "1px solid #2e2e3a",
                  background: "#18181e",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  padding: "0 8px 0 4px",
                }}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
              >
                <span
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    background: "#252532",
                    border: "1px solid #2e2e3a",
                    display: "grid",
                    placeItems: "center",
                    fontSize: 12,
                    color: "#e8e8f0",
                    fontWeight: 600,
                  }}
                >
                  {displayInitial}
                </span>
                <IconChevronDown size={14} color="#8888a0" />
              </button>

              {menuOpen ? (
                <div
                  role="menu"
                  style={{
                    position: "absolute",
                    top: "calc(100% + 8px)",
                    right: 0,
                    background: "#18181e",
                    border: "1px solid #2e2e3a",
                    borderRadius: 10,
                    padding: 6,
                    minWidth: 180,
                    boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
                    zIndex: 50,
                  }}
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => navigateAndClose("/settings/profile")}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: 6, fontSize: 13, display: "flex", alignItems: "center", gap: 8, color: "#e8e8f0", textAlign: "left" }}
                    onMouseEnter={(event) => {
                      event.currentTarget.style.background = "#22222a";
                    }}
                    onMouseLeave={(event) => {
                      event.currentTarget.style.background = "transparent";
                    }}
                  >
                    <IconUser size={14} color="#a0a0b8" />
                    Profile
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => navigateAndClose("/settings")}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: 6, fontSize: 13, display: "flex", alignItems: "center", gap: 8, color: "#e8e8f0", textAlign: "left" }}
                    onMouseEnter={(event) => {
                      event.currentTarget.style.background = "#22222a";
                    }}
                    onMouseLeave={(event) => {
                      event.currentTarget.style.background = "transparent";
                    }}
                  >
                    <IconSettings size={14} color="#a0a0b8" />
                    Settings
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => navigateAndClose("/settings/billing")}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: 6, fontSize: 13, display: "flex", alignItems: "center", gap: 8, color: "#e8e8f0", textAlign: "left" }}
                    onMouseEnter={(event) => {
                      event.currentTarget.style.background = "#22222a";
                    }}
                    onMouseLeave={(event) => {
                      event.currentTarget.style.background = "transparent";
                    }}
                  >
                    <IconCreditCard size={14} color="#a0a0b8" />
                    Billing
                  </button>
                  <div style={{ height: 1, background: "#2e2e3a", margin: "6px 0" }} />
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => void handleSignOut()}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: 6, fontSize: 13, display: "flex", alignItems: "center", gap: 8, color: "#f87171", textAlign: "left" }}
                    onMouseEnter={(event) => {
                      event.currentTarget.style.background = "rgba(239,68,68,0.1)";
                    }}
                    onMouseLeave={(event) => {
                      event.currentTarget.style.background = "transparent";
                    }}
                  >
                    <IconLogOut size={14} color="#f87171" />
                    Sign out
                  </button>
                </div>
              ) : null}
            </div>
          </>
        ) : (
          <button className="btn btn-primary" type="button" onClick={() => navigate("/login")}>Sign in</button>
        )}
      </div>
    </header>
  );
}
