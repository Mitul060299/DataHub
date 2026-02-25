import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useWorkspaceContext } from "../contexts/WorkspaceContext";
import { IconBell, IconSearch } from "./Icons";

const tabs = [
  { key: "home", label: "Home", path: "/home" },
  { key: "workspace", label: "Workspace", path: "/workspace" },
  { key: "marketplace", label: "Marketplace", path: "/marketplace" },
  { key: "settings", label: "Settings", path: "/settings" },
];

export function TopBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { activeProject, activeDataset } = useWorkspaceContext();

  const activeTab = useMemo(() => {
    const match = tabs.find((tab) => location.pathname.startsWith(tab.path));
    return match?.key ?? "workspace";
  }, [location.pathname]);

  return (
    <header style={{ height: "var(--th)", borderBottom: "1px solid var(--bd)", background: "var(--bg1)", display: "grid", gridTemplateColumns: "220px 1fr 220px", alignItems: "center", padding: "0 10px", gap: 12 }}>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12h16M12 4l8 8-8 8-8-8z" /></svg>
        <strong>DataHub</strong>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", alignItems: "center", gap: 20 }}>
        <nav style={{ display: "inline-flex", gap: 14 }}>
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => navigate(tab.path)}
              style={{ height: "var(--th)", borderBottom: activeTab === tab.key ? "2px solid var(--ac)" : "2px solid transparent", color: activeTab === tab.key ? "var(--tx0)" : "var(--tx1)", padding: "0 2px" }}
            >
              {tab.label}
            </button>
          ))}
        </nav>
        {activeTab === "workspace" && activeProject ? (
          <p style={{ color: "var(--tx1)" }}>
            {activeProject.name} / {activeDataset?.name ?? "No dataset selected"}
          </p>
        ) : null}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10 }}>
        <button className="btn" style={{ width: 30, padding: 0 }}><IconSearch size={14} /></button>
        <button className="btn" style={{ width: 30, padding: 0 }}><IconBell size={14} /></button>
        <div style={{ width: 28, height: 28, borderRadius: 999, background: "var(--bg3)", border: "1px solid var(--bd2)", display: "grid", placeItems: "center", position: "relative" }}>
          U
          <span style={{ position: "absolute", right: 0, bottom: 0, width: 8, height: 8, borderRadius: 999, background: "var(--gr)", border: "1px solid var(--bg1)" }} />
        </div>
      </div>
    </header>
  );
}
