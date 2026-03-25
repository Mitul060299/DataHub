import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./AppShell";
import { DashboardPage } from "./pages/DashboardPage";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { MarketplacePage } from "./pages/MarketplacePage";
import { PricingPage } from "./pages/PricingPage";
import { ProjectHomePage } from "./pages/ProjectHomePage";
import { PublicDashboardPage } from "./pages/PublicDashboardPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SignupPage } from "./pages/SignupPage";
import { SourcesPage } from "./pages/SourcesPage";
import { WorkspaceHomePage } from "./pages/WorkspaceHomePage";
import { WorkspacePage } from "./pages/WorkspacePage";
import { DocsPage } from "./pages/DocsPage";

export function App() {
  const [rateLimitMsg, setRateLimitMsg] = useState<string | null>(null);

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
      <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/public-dashboard/:token" element={<PublicDashboardPage />} />
      <Route path="/dashboard/share/:token" element={<PublicDashboardPage />} />
      <Route path="/docs" element={<DocsPage />} />
      <Route path="/" element={<AppShell />}>
        <Route index element={<Navigate to="/home" replace />} />
        <Route path="home" element={<HomePage />} />
        <Route path="workspace" element={<WorkspaceHomePage />} />
        <Route path="workspace/project/:projectId" element={<ProjectHomePage />} />
        <Route path="workspace/project/:projectId/pipeline/:pipelineId" element={<WorkspacePage />} />
        <Route path="marketplace" element={<MarketplacePage />} />
        <Route path="pricing" element={<PricingPage />} />
        <Route path="settings" element={<SettingsPage section="settings" />} />
        <Route path="settings/profile" element={<SettingsPage section="profile" />} />
        <Route path="settings/billing" element={<SettingsPage section="billing" />} />
        <Route path="settings/usage" element={<SettingsPage section="usage" />} />
        <Route path="settings/audit" element={<SettingsPage section="audit" />} />
        <Route path="sources" element={<SourcesPage />} />
        <Route path="dashboard/:id" element={<DashboardPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
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
