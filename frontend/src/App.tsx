import { lazy, Suspense, useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AppShell } from "./AppShell";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { SupportChatWidget } from "./components/SupportChatWidget";
import { useBranding } from "./hooks/useBranding";

// Static imports — smallest pages on the critical auth/landing path
import { LoginPage } from "./pages/LoginPage";
import { SignupPage } from "./pages/SignupPage";
import { NotFoundPage } from "./pages/NotFoundPage";

// Lazy-loaded pages — each creates a separate async chunk loaded only when navigated to
// HomePage is also lazy — removes framer-motion from the critical path for users who
// navigate directly to /workspace or /login.
const HomePage = lazy(() => import("./pages/HomePage").then(m => ({ default: m.HomePage })));
const DashboardPage = lazy(() => import("./pages/DashboardPage").then(m => ({ default: m.DashboardPage })));
const MarketplacePage = lazy(() => import("./pages/MarketplacePage").then(m => ({ default: m.MarketplacePage })));
const PricingPage = lazy(() => import("./pages/PricingPage").then(m => ({ default: m.PricingPage })));
const PublicDashboardPage = lazy(() => import("./pages/PublicDashboardPage").then(m => ({ default: m.PublicDashboardPage })));
const SettingsPage = lazy(() => import("./pages/SettingsPage").then(m => ({ default: m.SettingsPage })));
const SourcesPage = lazy(() => import("./pages/SourcesPage").then(m => ({ default: m.SourcesPage })));
const WorkspaceHomePage = lazy(() => import("./pages/WorkspaceHomePage").then(m => ({ default: m.WorkspaceHomePage })));
const WorkspacePage = lazy(() => import("./pages/WorkspacePage").then(m => ({ default: m.WorkspacePage })));
const ProjectHomePage = lazy(() => import("./pages/ProjectHomePage").then(m => ({ default: m.ProjectHomePage })));
const DocsPage = lazy(() => import("./pages/DocsPage").then(m => ({ default: m.DocsPage })));
const TermsPage = lazy(() => import("./pages/TermsPage").then(m => ({ default: m.TermsPage })));
const PrivacyPage = lazy(() => import("./pages/PrivacyPage").then(m => ({ default: m.PrivacyPage })));
const InviteAcceptPage = lazy(() => import("./pages/InviteAcceptPage").then(m => ({ default: m.InviteAcceptPage })));
const BlogIndexPage = lazy(() => import("./pages/BlogIndexPage").then(m => ({ default: m.BlogIndexPage })));
const BlogPostPage = lazy(() => import("./pages/BlogPostPage").then(m => ({ default: m.BlogPostPage })));
const FAQPage = lazy(() => import("./pages/FAQPage").then(m => ({ default: m.FAQPage })));
const ChangelogPage = lazy(() => import("./pages/ChangelogPage").then(m => ({ default: m.ChangelogPage })));

// Minimal fallback — full-viewport fill prevents layout shifts while a page chunk loads
const PageFallback = () => (
  <div style={{ height: "100vh", display: "grid", placeItems: "center", background: "#0d0d0d" }}>
    <span style={{ opacity: 0.35, fontSize: 13, color: "#fff" }}>Loading…</span>
  </div>
);

export function App() {
  const [rateLimitMsg, setRateLimitMsg] = useState<string | null>(null);
  const location = useLocation();
  useBranding();

  // Hide the support chat bubble on workspace and project pages — the AI
  // panel there serves a different purpose and the widget clutters the UI.
  const hideSupportChat =
    location.pathname.startsWith("/workspace") ||
    location.pathname.startsWith("/projects");

  useEffect(() => {
    const handler = (e: Event) => {
      const secs = (e as CustomEvent<{ retryAfter: number }>).detail?.retryAfter ?? 60;
      setRateLimitMsg(`Too many requests — please wait ${secs}s before trying again.`);
      setTimeout(() => setRateLimitMsg(null), secs * 1000);
    };
    window.addEventListener("datahub:rate-limited", handler);
    return () => window.removeEventListener("datahub:rate-limited", handler);
  }, []);

  return (
    <>
      <ErrorBoundary>
        <Suspense fallback={<PageFallback />}>
        <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/try" element={<Navigate to="/workspace" replace />} />
      <Route path="/demo" element={<Navigate to="/workspace" replace />} />
      <Route path="/invite/:token" element={<InviteAcceptPage />} />
      <Route path="/public-dashboard/:token" element={<PublicDashboardPage />} />
      <Route path="/dashboard/share/:token" element={<PublicDashboardPage />} />
      <Route path="/docs" element={<DocsPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/blog" element={<BlogIndexPage />} />
      <Route path="/blog/:slug" element={<BlogPostPage />} />
      <Route path="/faq" element={<FAQPage />} />
      <Route path="/changelog" element={<ChangelogPage />} />
      <Route path="/" element={<AppShell />}>
        <Route index element={<HomePage />} />
        <Route path="home" element={<HomePage />} />
        <Route path="workspace" element={<WorkspaceHomePage />} />
        <Route path="workspace/project/:projectId" element={<Navigate to="pipeline/new" replace />} />
        <Route path="workspace/project/:projectId/pipeline/:pipelineId" element={<WorkspacePage />} />
        <Route path="projects/:projectId" element={<ProjectHomePage />} />
        <Route path="marketplace" element={<MarketplacePage />} />
        <Route path="pricing" element={<PricingPage />} />
        <Route path="settings" element={<SettingsPage section="settings" />} />
        <Route path="settings/profile" element={<SettingsPage section="profile" />} />
        <Route path="settings/billing" element={<SettingsPage section="billing" />} />
        <Route path="settings/usage" element={<SettingsPage section="usage" />} />
        <Route path="settings/audit" element={<SettingsPage section="audit" />} />
        <Route path="settings/team" element={<SettingsPage section="team" />} />
        <Route path="settings/webhooks" element={<SettingsPage section="webhooks" />} />
        <Route path="settings/approvals" element={<SettingsPage section="approvals" />} />
        <Route path="settings/branding" element={<SettingsPage section="branding" />} />
        <Route path="settings/saml" element={<SettingsPage section="saml" />} />
        <Route path="sources" element={<SourcesPage />} />
        <Route path="dashboard/:id" element={<DashboardPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
      </Routes>
      </Suspense>
      </ErrorBoundary>
      {!hideSupportChat && <SupportChatWidget />}
      {rateLimitMsg && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            background: "#1e2030",
            border: "1px solid #5B6AF0",
            color: "#fff",
            padding: "10px 20px",
            borderRadius: 8,
            fontSize: 14,
            zIndex: 9999,
            boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
            whiteSpace: "nowrap",
          }}
        >
          {rateLimitMsg}
        </div>
      )}
    </>
  );
}
