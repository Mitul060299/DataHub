import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./AppShell";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { MarketplacePage } from "./pages/MarketplacePage";
import { PricingPage } from "./pages/PricingPage";
import { PublicDashboardPage } from "./pages/PublicDashboardPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SignupPage } from "./pages/SignupPage";
import { SourcesPage } from "./pages/SourcesPage";
import { WorkspacePage } from "./pages/WorkspacePage";

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/public-dashboard/:token" element={<PublicDashboardPage />} />
      <Route path="/" element={<AppShell />}>
        <Route index element={<Navigate to="/home" replace />} />
        <Route path="home" element={<HomePage />} />
        <Route path="workspace" element={<WorkspacePage />} />
        <Route path="marketplace" element={<MarketplacePage />} />
        <Route path="pricing" element={<PricingPage />} />
        <Route path="settings" element={<SettingsPage section="settings" />} />
        <Route path="settings/profile" element={<SettingsPage section="profile" />} />
        <Route path="settings/billing" element={<SettingsPage section="billing" />} />
        <Route path="sources" element={<SourcesPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  );
}
