import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AppShell } from "./AppShell";
import { DashboardPage } from "./pages/DashboardPage";
import { DemoPage } from "./pages/DemoPage";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { MarketplacePage } from "./pages/MarketplacePage";
import { PricingPage } from "./pages/PricingPage";

import { PublicDashboardPage } from "./pages/PublicDashboardPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SignupPage } from "./pages/SignupPage";
import { SourcesPage } from "./pages/SourcesPage";
import { WorkspaceHomePage } from "./pages/WorkspaceHomePage";
import { WorkspacePage } from "./pages/WorkspacePage";
import { ProjectHomePage } from "./pages/ProjectHomePage";
import { DocsPage } from "./pages/DocsPage";
import { TermsPage } from "./pages/TermsPage";
import { PrivacyPage } from "./pages/PrivacyPage";
import { InviteAcceptPage } from "./pages/InviteAcceptPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { SupportChatWidget } from "./components/SupportChatWidget";

export function App() {
  const [rateLimitMsg, setRateLimitMsg] = useState<string | null>(null);
  const location = useLocation();

  // Hide the support chat bubble on workspace and project pages — the AI
  // panel there serves a different purpose and the widget clutters the UI.
  const hideSupportChat =
    location.pathname.startsWith("/workspace") ||
    location.pathname.startsWith("/projects");

  useEffect(() => {
    const handler = (e: Event) => {
      const secs = (e as CustomEvent<{ retryAfter: number }>).detail?.retryAfter ?? 60;
      setRateLimitMsg(`Too many requests — please wait ${secs}s before trying again.`);
      setTimeout(() => setRateLimitMsg(null), 5000);
    };
    window.addEventListener("datahub:rate-limited", handler);
    return () => window.removeEventListener("datahub:rate-limited", handler);
  }, []);

  return (
    <>
      <ErrorBoundary>
        <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/try" element={<DemoPage />} />
      <Route path="/demo" element={<Navigate to="/try" replace />} />
      <Route path="/invite/:token" element={<InviteAcceptPage />} />
      <Route path="/public-dashboard/:token" element={<PublicDashboardPage />} />
      <Route path="/dashboard/share/:token" element={<PublicDashboardPage />} />
      <Route path="/docs" element={<DocsPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
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
        <Route path="sources" element={<SourcesPage />} />
        <Route path="dashboard/:id" element={<DashboardPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
      </Routes>
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
