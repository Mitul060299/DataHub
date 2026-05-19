import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { TopBar } from "./components/TopBar";
import { useAuth } from "./contexts/AuthContext";
import { PipelineProvider } from "./contexts/PipelineContext";
import { WorkspaceProvider } from "./contexts/WorkspaceContext";
import { billingEnabled } from "./utils/featureFlags";

const PUBLIC_PATHS = ["/home", "/marketplace", "/pricing", "/docs"];

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

  // Signed-in (real, non-anonymous) users landing on the marketing root
  // shouldn't see the demo / landing preview — that confused them into
  // thinking the demo workspace had replaced their real project. Send them
  // straight to their workspace instead.
  if (!loading && session && !isAnonymous && location.pathname === "/") {
    return <Navigate to="/workspace" replace />;
  }

  // Public pages render immediately — auth resolves in the background so the
  // hero / landing content paints without waiting for a server round-trip.
  // This is the primary fix for high LCP on connections far from the backend.
  if (isPublic) {
    return (
      <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
        <TopBar />
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
    // /workspace supports anonymous sessions — never hard-redirect to /login.
    // If the anon-session bootstrap failed (e.g. backend cold start), show a
    // friendly retry that polls in the background instead of an auth wall.
    if (location.pathname.startsWith("/workspace")) {
      return <WorkspaceConnectionRetry />;
    }
    // All other private routes do require a real auth session.
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return (
    <WorkspaceProvider>
      <PipelineProvider>
        <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
          <TopBar />
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

/**
 * Shown when an anonymous workspace visitor's /auth/anonymous bootstrap has
 * failed (cold-start, rate limit, transient network). Polls in the background
 * with exponential backoff so the user gets in as soon as the backend recovers,
 * without having to click Try again.
 */
function WorkspaceConnectionRetry() {
  const { ensureAnonymousSession } = useAuth();
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (cancelled) return;
      try {
        await ensureAnonymousSession();
      } catch {
        /* AuthContext logs failures; we just keep polling */
      }
      if (cancelled) return;
      setAttempts((n) => {
        const next = n + 1;
        // Exponential backoff: 3s, 5s, 8s, 13s, 21s, then cap at 30s
        const delay = Math.min(3000 + n * 2000 + Math.pow(1.5, n) * 500, 30_000);
        timer = setTimeout(tick, delay);
        return next;
      });
    };

    // Kick off first retry quickly (1s after mount)
    timer = setTimeout(tick, 1000);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [ensureAnonymousSession]);

  return (
    <div style={{ height: "100%", display: "grid", placeItems: "center", textAlign: "center", padding: 24 }}>
      <div>
        <p style={{ color: "var(--tx2, #94a3b8)", marginBottom: 8 }}>
          Connecting to your workspace…
        </p>
        <p style={{ color: "var(--tx3, #64748b)", fontSize: 12, marginBottom: 16 }}>
          {attempts === 0
            ? "This usually takes a moment."
            : `Still trying… (attempt ${attempts + 1}). The server may be waking up.`}
        </p>
        <button
          type="button"
          className="btn-primary-lg"
          onClick={() => window.location.reload()}
        >
          Reload now
        </button>
      </div>
    </div>
  );
}
