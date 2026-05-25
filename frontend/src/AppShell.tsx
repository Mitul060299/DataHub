import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { TopBar } from "./components/TopBar";
import { useAuth } from "./contexts/AuthContext";
import { PipelineProvider } from "./contexts/PipelineContext";
import { WorkspaceProvider } from "./contexts/WorkspaceContext";
import { billingEnabled } from "./utils/featureFlags";

const PUBLIC_PATHS = ["/home", "/marketplace", "/pricing", "/docs"];
const BETA_BANNER_KEY = "datahub_beta_banner_dismissed";

function BetaBanner() {
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem(BETA_BANNER_KEY) === "1");
  if (dismissed) return null;
  return (
    <div style={{ background: "#fef3c7", borderBottom: "1px solid #f59e0b", padding: "6px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, fontSize: 12, color: "#92400e" }}>
      <span>
        <strong>DataHub is in public beta.</strong> Features may change and data may be lost. Use at your own risk.{" "}
        <a href="/terms" style={{ color: "#92400e", textDecorationLine: "underline" }}>Terms</a>{" · "}
        <a href="/privacy" style={{ color: "#92400e", textDecorationLine: "underline" }}>Privacy</a>
      </span>
      <button
        onClick={() => { sessionStorage.setItem(BETA_BANNER_KEY, "1"); setDismissed(true); }}
        style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "#92400e", padding: "0 4px", lineHeight: 1 }}
        title="Dismiss"
      >
        ×
      </button>
    </div>
  );
}

export function AppShell() {
  const { isAuthenticated, isAnonymous, loading, session, anonUserId } = useAuth();
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

  // Public pages render immediately — auth resolves in the background so the
  // hero / landing content paints without waiting for a server round-trip.
  // This is the primary fix for high LCP on connections far from the backend.
  if (isPublic) {
    // Real signed-in users who land on / should go straight to the workspace
    // home — they have no reason to see the marketing landing page.
    if (!loading && !isAnonymous && location.pathname === "/") {
      return <Navigate to="/workspace" replace state={{ fromRoot: true }} />;
    }
    return (
      <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
        <TopBar />
        <BetaBanner />
        <Outlet />
      </div>
    );
  }

  // For private pages we must still wait for auth to avoid a flash of
  // protected content followed by a redirect to /login.
  if (loading) {
    return <div style={{ height: "100%", display: "grid", placeItems: "center" }}>Loading...</div>;
  }

  if (!isAuthenticated) {
    // /workspace is fully open to guests — render it even while the anon JWT
    // is still bootstrapping in the background. WorkspaceContext / project
    // list components show their own skeletons until the token arrives and
    // the API call succeeds. This avoids ever showing a connection wall.
    if (location.pathname.startsWith("/workspace")) {
      return (
        <WorkspaceProvider>
          <PipelineProvider>
            <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
              <TopBar />
              <BetaBanner />
              <Outlet />
            </div>
          </PipelineProvider>
        </WorkspaceProvider>
      );
    }
    // All other private routes do require a real auth session.
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return (
    <WorkspaceProvider>
      <PipelineProvider>
        <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
          <TopBar />
          <BetaBanner />
          {upgradeMessage ? (
            <div style={{ borderBottom: "1px solid var(--bd2)", background: "var(--bg2)", padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <span style={{ color: "var(--tx1)", fontSize: 12 }}>
                {isAnonymous
                  ? "You've hit the guest limit for this action."
                  : upgradeMessage}
              </span>
              <div style={{ display: "inline-flex", gap: 8 }}>
                {isAnonymous ? (
                  <button
                    className="btn btn-primary"
                    onClick={() => { navigate("/signup"); setUpgradeMessage(null); }}
                  >
                    Sign up free →
                  </button>
                ) : (
                  <button
                    className="btn btn-primary"
                    onClick={() => navigate(billingEnabled ? "/settings/billing" : "/pricing")}
                  >
                    View Plans
                  </button>
                )}
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
