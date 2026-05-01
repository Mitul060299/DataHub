import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
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
  const [scrolled, setScrolled] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const isHomePath = location.pathname === "/" || location.pathname.startsWith("/home");

  useEffect(() => {
    if (!isHomePath) { setScrolled(false); return; }
    const mainEl = document.querySelector<HTMLElement>(".app-page");
    if (!mainEl) return;
    const onScroll = () => setScrolled(mainEl.scrollTop > 44);
    mainEl.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => mainEl.removeEventListener("scroll", onScroll);
  }, [isHomePath]);

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
    <header
      className="topbar"
      style={{
        height: "var(--th)",
        borderBottom: `1px solid ${isHomePath && !scrolled ? "transparent" : "#22222a"}`,
        background: isHomePath && !scrolled
          ? "transparent"
          : isHomePath
          ? "rgba(13,13,17,0.9)"
          : "#111115",
        backdropFilter: isHomePath && scrolled ? "blur(18px) saturate(180%)" : "none",
        WebkitBackdropFilter: isHomePath && scrolled ? "blur(18px) saturate(180%)" : "none",
        display: "grid",
        gridTemplateColumns: "280px 1fr 280px",
        alignItems: "center",
        padding: "0 14px",
        gap: 12,
        flexShrink: 0,
        transition: "background 0.35s ease, border-color 0.35s ease, backdrop-filter 0.35s ease",
      }}
    >
      <Link
        to="/"
        style={{ display: "inline-flex", alignItems: "center", gap: 10, width: "fit-content", textDecoration: "none" }}
        aria-label="DataHub home"
      >
        <img
          src="/logo.png"
          alt=""
          width={30}
          height={30}
          style={{ display: "block", borderRadius: 8 }}
        />
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
      </Link>

      <div className="topbar__nav" style={{ display: "flex", justifyContent: "center" }}>
        <nav style={{ display: "inline-flex", alignItems: "center", gap: 22 }}>
          {tabs.map((tab) => (
            <Link
              key={tab.key}
              to={tab.path}
              style={{
                height: 32,
                borderRadius: 8,
                background: activeTab === tab.key ? "rgba(91,106,240,0.12)" : "transparent",
                border: activeTab === tab.key ? "1px solid rgba(91,106,240,0.2)" : "1px solid transparent",
                color: activeTab === tab.key ? "#c7d2fe" : "#8888a0",
                fontSize: 13,
                fontWeight: activeTab === tab.key ? 600 : 400,
                padding: "0 14px",
                display: "inline-flex",
                alignItems: "center",
                textDecoration: "none",
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => {
                if (activeTab !== tab.key) {
                  e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                  e.currentTarget.style.color = "#b0b0c0";
                }
              }}
              onMouseLeave={(e) => {
                if (activeTab !== tab.key) {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "#8888a0";
                }
              }}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8 }}>
        {session ? (
          <>
            <button className="btn" style={{ width: 32, height: 32, padding: 0, borderRadius: 8, display: "grid", placeItems: "center" }} type="button" aria-label="Notifications" onClick={() => navigate("/settings?section=notifications")} title="Notification preferences">
              <IconBell size={14} />
            </button>
            <div ref={menuRef} style={{ position: "relative" }}>
              <button
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                style={{
                  height: 34,
                  borderRadius: 10,
                  border: "1px solid #2a2a36",
                  background: "#16161c",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  padding: "0 10px 0 5px",
                  transition: "all 0.15s ease",
                }}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
              >
                <span
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    background: "linear-gradient(135deg, #252532 0%, #1e1e2a 100%)",
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
                    background: "#16161c",
                    border: "1px solid #2a2a36",
                    borderRadius: 12,
                    padding: 6,
                    minWidth: 190,
                    boxShadow: "0 12px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(91,106,240,0.06)",
                    zIndex: 50,
                    backdropFilter: "blur(16px)",
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
