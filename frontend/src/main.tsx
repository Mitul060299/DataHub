import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, useLocation } from "react-router-dom";
import { App } from "./App";
import { AuthProvider } from "./contexts/AuthContext";
import { UserProvider } from "./contexts/UserContext";
import "./styles/global.css";
// Analytics deferred to keep it off the critical-path bundle.
const AnalyticsWidget = React.lazy(() => import("@vercel/analytics/react").then(m => ({ default: m.Analytics })));

// Buffer errors that arrive before Sentry is loaded — drained once it initialises.
const _pendingErrors: Array<{ error: Error; info: Record<string, unknown> }> = [];

// Capture unhandled JS errors with full stack trace for production debugging
window.addEventListener("error", (e) => {
  const info = { message: e.message, filename: e.filename, lineno: e.lineno, colno: e.colno, stack: e.error?.stack ?? "" };
  try { sessionStorage.setItem("datahub_last_error", JSON.stringify(info)); } catch { /* ignore */ }
  console.error("[datahub global error]", info);
  _pendingErrors.push({ error: e.error ?? new Error(e.message), info });
});
window.addEventListener("unhandledrejection", (e) => {
  const msg = (e.reason instanceof Error ? e.reason.stack : String(e.reason)) ?? "unhandledrejection";
  // Auto-reload on stale-chunk 404 — happens when a new deploy ships while the
  // user still has an old index.html cached.  Guard with sessionStorage to avoid
  // an infinite reload loop if the asset is genuinely missing.
  const isChunkError = e.reason instanceof Error && (
    /failed to fetch dynamically imported module/i.test(e.reason.message) ||
    /importing a module script failed/i.test(e.reason.message) ||
    /error loading dynamically imported module/i.test(e.reason.message)
  );
  if (isChunkError) {
    if (!sessionStorage.getItem("datahub_chunk_reload")) {
      sessionStorage.setItem("datahub_chunk_reload", "1");
      window.location.reload();
    }
    return; // swallow — don't log/buffer this as an app error
  }
  try { sessionStorage.setItem("datahub_last_rejection", msg); } catch { /* ignore */ }
  console.error("[datahub unhandled rejection]", msg);
  _pendingErrors.push({ error: e.reason ?? new Error("unhandledrejection"), info: { stack: msg } });
});

// Defer analytics initialisation to after the first browser idle period so it
// does not block FCP / INP.  PostHog autocapture and Sentry are expensive — they
// intercept DOM events and add observer hooks that inflate interaction latency.
const _loadAnalytics = () => {
  import("./lib/sentry").then(({ captureError }) => {
    _pendingErrors.splice(0).forEach(({ error, info }) => captureError(error, info));
  });
  import("./lib/posthog");
};
if ("requestIdleCallback" in window) {
  window.requestIdleCallback(_loadAnalytics, { timeout: 3000 });
} else {
  setTimeout(_loadAnalytics, 0);
}

function PageviewTracker() {
  const location = useLocation();
  React.useEffect(() => {
    import("./lib/posthog").then(({ capturePageview }) => capturePageview(location.pathname + location.search));
  }, [location.pathname, location.search]);
  return null;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <UserProvider>
          <PageviewTracker />
          <App />
          <React.Suspense fallback={null}><AnalyticsWidget /></React.Suspense>
        </UserProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
