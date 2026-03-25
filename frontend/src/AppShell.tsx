import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { TopBar } from "./components/TopBar";
import { useAuth } from "./contexts/AuthContext";
import { PipelineProvider } from "./contexts/PipelineContext";
import { WorkspaceProvider } from "./contexts/WorkspaceContext";
import { billingEnabled } from "./utils/featureFlags";

const PUBLIC_PATHS = ["/home", "/marketplace", "/pricing", "/docs"];

export function AppShell() {
  const { session, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [upgradeMessage, setUpgradeMessage] = useState<string | null>(null);

  useEffect(() => {
    const listener = (event: Event) => {
      const custom = event as CustomEvent<{ message?: string }>;
      setUpgradeMessage(custom.detail?.message ?? "Your current plan does not include this feature.");
    };
    window.addEventListener("datahub:plan-upgrade-required", listener as EventListener);
    return () => {
      window.removeEventListener("datahub:plan-upgrade-required", listener as EventListener);
    };
  }, []);

  const isPublic = location.pathname === "/" || PUBLIC_PATHS.some((p) => location.pathname.startsWith(p));

  if (loading) {
    return <div style={{ height: "100%", display: "grid", placeItems: "center" }}>Loading...</div>;
  }

  if (isPublic && !session) {
    return (
      <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
        <TopBar />
        <Outlet />
      </div>
    );
  }

  if (!isPublic && !session) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return (
    <WorkspaceProvider>
      <PipelineProvider>
        <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
          <TopBar />
          {upgradeMessage ? (
            <div style={{ borderBottom: "1px solid var(--bd2)", background: "var(--bg2)", padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <span style={{ color: "var(--tx1)", fontSize: 12 }}>{upgradeMessage}</span>
              <div style={{ display: "inline-flex", gap: 8 }}>
                <button
                  className="btn btn-primary"
                  onClick={() => navigate(billingEnabled ? "/settings/billing" : "/pricing")}
                >
                  View Plans
                </button>
                <button className="btn" onClick={() => setUpgradeMessage(null)}>Dismiss</button>
              </div>
            </div>
          ) : null}
          <Outlet />
        </div>
      </PipelineProvider>
    </WorkspaceProvider>
  );
}
