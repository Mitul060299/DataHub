import {
  Layout,
  Typography,
  Space,
  Card,
  Button,
  Row,
  Col,
  Divider,
  Statistic,
  Tag,
  Badge,
  Avatar,
  Breadcrumb,
  Drawer,
  Dropdown,
  Input,
  List,
  Modal,
  Tabs,
  Tooltip,
} from "antd";
import {
  BellOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  PlusOutlined,
  SearchOutlined,
  SettingOutlined,
  DownOutlined,
  HomeOutlined,
  DatabaseOutlined,
  CloudUploadOutlined,
  DeploymentUnitOutlined,
  BarChartOutlined,
  TeamOutlined,
  ShareAltOutlined,
  ThunderboltOutlined,
  ApiOutlined,
  DashboardOutlined,
} from "@ant-design/icons";
import { useEffect, useState, lazy, Suspense } from "react";
import { InsightSummary, AgentSuggestion } from "./types";
import { exchangeOidcCode } from "./api";
import { clearAuthToken, getAuthToken, setAuthToken, getRoleFromToken } from "./utils/auth";
import { notify } from "./utils/notify";
import { supabase } from "./utils/supabaseClient";
import { billingEnabled } from "./utils/featureFlags";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

const { Header, Content, Sider } = Layout;
const { Text } = Typography;

const InsightsPanel = lazy(() =>
  import("./components/InsightsPanel").then((module) => ({ default: module.InsightsPanel }))
);
const DashboardPanel = lazy(() =>
  import("./components/DashboardPanel").then((module) => ({ default: module.DashboardPanel }))
);
const ChartSummaryPanel = lazy(() =>
  import("./components/ChartSummaryPanel").then((module) => ({ default: module.ChartSummaryPanel }))
);
const ProfilePanel = lazy(() =>
  import("./components/ProfilePanel").then((module) => ({ default: module.ProfilePanel }))
);
const ColumnSuggestionPanel = lazy(() =>
  import("./components/ColumnSuggestionPanel").then((module) => ({ default: module.ColumnSuggestionPanel }))
);
const ContextPanel = lazy(() =>
  import("./components/ContextPanel").then((module) => ({ default: module.ContextPanel }))
);
const PluginsPanel = lazy(() =>
  import("./components/PluginsPanel").then((module) => ({ default: module.PluginsPanel }))
);
const SyncPanel = lazy(() =>
  import("./components/SyncPanel").then((module) => ({ default: module.SyncPanel }))
);
const WidgetsPanel = lazy(() =>
  import("./components/WidgetsPanel").then((module) => ({ default: module.WidgetsPanel }))
);
const WebhooksPanel = lazy(() =>
  import("./components/WebhooksPanel").then((module) => ({ default: module.WebhooksPanel }))
);
const JobsPanel = lazy(() =>
  import("./components/JobsPanel").then((module) => ({ default: module.JobsPanel }))
);
const AuditLogPanel = lazy(() =>
  import("./components/AuditLogPanel").then((module) => ({ default: module.AuditLogPanel }))
);
const UsageAnalyticsPanel = lazy(() =>
  import("./components/UsageAnalyticsPanel").then((module) => ({ default: module.UsageAnalyticsPanel }))
);
const CacheStatsPanel = lazy(() =>
  import("./components/CacheStatsPanel").then((module) => ({ default: module.CacheStatsPanel }))
);
const ApprovalsPanel = lazy(() =>
  import("./components/ApprovalsPanel").then((module) => ({ default: module.ApprovalsPanel }))
);
const RealtimePresencePanel = lazy(() =>
  import("./components/RealtimePresencePanel").then((module) => ({ default: module.RealtimePresencePanel }))
);
const CorrelationPanel = lazy(() =>
  import("./components/CorrelationPanel").then((module) => ({ default: module.CorrelationPanel }))
);
const InsightActionsPanel = lazy(() =>
  import("./components/InsightActionsPanel").then((module) => ({ default: module.InsightActionsPanel }))
);
const TemplateGalleryPanel = lazy(() =>
  import("./components/TemplateGalleryPanel").then((module) => ({ default: module.TemplateGalleryPanel }))
);
const SharedDashboardPanel = lazy(() =>
  import("./components/SharedDashboardPanel").then((module) => ({ default: module.SharedDashboardPanel }))
);
const WorkspacePanel = lazy(() =>
  import("./components/WorkspacePanel").then((module) => ({ default: module.WorkspacePanel }))
);
const SharedWorkspacePanel = lazy(() =>
  import("./components/SharedWorkspacePanel").then((module) => ({ default: module.SharedWorkspacePanel }))
);
const ShareAdminPanel = lazy(() =>
  import("./components/ShareAdminPanel").then((module) => ({ default: module.ShareAdminPanel }))
);
const SettingsPagePanel = lazy(() =>
  import("./components/SettingsPagePanel").then((module) => ({ default: module.SettingsPagePanel }))
);
const AboutPanel = lazy(() =>
  import("./components/AboutPanel").then((module) => ({ default: module.AboutPanel }))
);
const ReviewsPanel = lazy(() =>
  import("./components/ReviewsPanel").then((module) => ({ default: module.ReviewsPanel }))
);
const LandingPanel = lazy(() =>
  import("./components/LandingPanel").then((module) => ({ default: module.LandingPanel }))
);
const DemoPanel = lazy(() =>
  import("./components/DemoPanel").then((module) => ({ default: module.DemoPanel }))
);
const PlansPanel = lazy(() =>
  import("./components/PlansPanel").then((module) => ({ default: module.PlansPanel }))
);
const BillingPanel = lazy(() =>
  import("./components/BillingPanel").then((module) => ({ default: module.BillingPanel }))
);
const DataCleaningPanel = lazy(() =>
  import("./components/DataCleaningPanel").then((module) => ({ default: module.DataCleaningPanel }))
);
const DataTransformationPanel = lazy(() =>
  import("./components/DataTransformationPanel").then((module) => ({ default: module.DataTransformationPanel }))
);
const DataModelingPanel = lazy(() =>
  import("./components/DataModelingPanel").then((module) => ({ default: module.DataModelingPanel }))
);
const DashboardBuilderPanel = lazy(() =>
  import("./components/DashboardBuilderPanel").then((module) => ({ default: module.DashboardBuilderPanel }))
);
const MlModelingPanel = lazy(() =>
  import("./components/MlModelingPanel").then((module) => ({ default: module.MlModelingPanel }))
);
const WorkspaceManagementPanel = lazy(() =>
  import("./components/WorkspaceManagementPanel").then((module) => ({ default: module.WorkspaceManagementPanel }))
);
const PaymentSubscriptionPanel = lazy(() =>
  import("./components/PaymentSubscriptionPanel").then((module) => ({ default: module.PaymentSubscriptionPanel }))
);
const DataImportPanel = lazy(() =>
  import("./components/DataImportPanel").then((module) => ({ default: module.DataImportPanel }))
);

export function App() {
  const [insights, setInsights] = useState<InsightSummary | null>(null);
  const [suggestion, setSuggestion] = useState<AgentSuggestion | null>(null);
  const [datasetId, setDatasetId] = useState<string | null>(null);
  const [datasetColumns, setDatasetColumns] = useState<string[]>([]);
  const [dashboardId, setDashboardId] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [hasToken, setHasToken] = useState(!!getAuthToken());
  const [role, setRole] = useState(getRoleFromToken());
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [shareWorkspaceToken, setShareWorkspaceToken] = useState<string | null>(null);
  const isSharedView = !!(shareToken || shareWorkspaceToken);
  const [activeRoute, setActiveRoute] = useState<string>("home");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [recentSearches, setRecentSearches] = useState<string[]>(["Revenue dashboard", "Churn model"]);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showRightPanel, setShowRightPanel] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 992);
  const [showMobileNav, setShowMobileNav] = useState(false);
  const [loadingBar, setLoadingBar] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState("Pro");

  useEffect(() => {
    const pathMatch = window.location.pathname.match(/^\/shared\/(.+)$/);
    if (pathMatch?.[1]) {
      setShareToken(pathMatch[1]);
      return;
    }
    const workspaceMatch = window.location.pathname.match(/^\/shared-workspace\/(.+)$/);
    if (workspaceMatch?.[1]) {
      setShareWorkspaceToken(workspaceMatch[1]);
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const shared = params.get("shared");
    if (shared) {
      setShareToken(shared);
    }
    const sharedWorkspace = params.get("shared_workspace");
    if (sharedWorkspace) {
      setShareWorkspaceToken(sharedWorkspace);
    }
  }, []);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }: { data: { session: Session | null } }) => {
      if (!active) return;
      const accessToken = data.session?.access_token;
      if (accessToken) {
        setAuthToken(accessToken);
        setHasToken(true);
        setRole(getRoleFromToken());
      } else {
        clearAuthToken();
        setHasToken(false);
        setRole(null);
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      const accessToken = session?.access_token;
      if (accessToken) {
        setAuthToken(accessToken);
        setHasToken(true);
        setRole(getRoleFromToken());
      } else {
        clearAuthToken();
        setHasToken(false);
        setRole(null);
      }
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (!code) return;
    exchangeOidcCode(code)
      .then((data) => {
        if (data?.access_token) {
          setAuthToken(data.access_token);
          setHasToken(true);
          setRole(getRoleFromToken());
          notify.success("SSO login successful");
        } else {
          notify.error("SSO login failed");
        }
      })
      .catch((err: any) => {
        const detail = err?.response?.data?.detail || "SSO login failed.";
        notify.error(detail);
      })
      .finally(() => {
        window.history.replaceState({}, document.title, window.location.pathname);
      });
  }, []);

  const sharedTabContent = (
    <div className="section">
      {shareToken && (
        <>
          <Typography.Title level={3}>Shared Dashboard</Typography.Title>
          <SharedDashboardPanel shareToken={shareToken} />
        </>
      )}
      {shareWorkspaceToken && (
        <>
          <Typography.Title level={3}>Shared Workspace</Typography.Title>
          <SharedWorkspacePanel shareToken={shareWorkspaceToken} />
        </>
      )}
      <Typography.Text type="secondary">You are viewing a shared resource.</Typography.Text>
    </div>
  );

  const landingTabContent = <LandingPanel onSelectTab={setActiveRoute} />;

  const demoTabContent = <DemoPanel />;

  const importTabContent = (
    <div className="section">
      <DataImportPanel />
    </div>
  );

  const cleaningTabContent = (
    <div className="section">
      <DataCleaningPanel />
    </div>
  );

  const transformTabContent = (
    <div className="section">
      <DataTransformationPanel />
    </div>
  );

  const modelingTabContent = (
    <div className="section">
      <DataModelingPanel />
    </div>
  );

  const mlTabContent = (
    <div className="section">
      <MlModelingPanel />
    </div>
  );

  const workspaceTabContent = (
    <div className="section">
      <WorkspaceManagementPanel />
    </div>
  );

  const analysisTabContent = (
    <div className="section">
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card className="panel-card" title="Insights">
            <InsightsPanel insights={insights} />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card className="panel-card" title="Insight Actions">
            <InsightActionsPanel datasetId={datasetId} />
          </Card>
        </Col>
      </Row>
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={8}>
          <Card className="panel-card" title="Profiling">
            <ProfilePanel datasetId={datasetId} />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card className="panel-card" title="Column Summary">
            <ChartSummaryPanel datasetId={datasetId} columns={datasetColumns} />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card className="panel-card" title="Correlation Insights">
            <CorrelationPanel datasetId={datasetId} />
          </Card>
        </Col>
      </Row>
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={8}>
          <Card className="panel-card" title="Did you mean?">
            <ColumnSuggestionPanel datasetId={datasetId} />
          </Card>
        </Col>
      </Row>
    </div>
  );

  const dashboardsTabContent = (
    <div className="section">
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={8}>
          <Card className="panel-card" title="Dashboards">
            <DashboardPanel
              columns={datasetColumns}
              datasetId={datasetId}
              onSelectDashboard={setDashboardId}
            />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card className="panel-card" title="Dashboard Templates">
            <TemplateGalleryPanel datasetId={datasetId} columns={datasetColumns} />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card className="panel-card" title="Widgets">
            <WidgetsPanel dashboardId={dashboardId} columns={datasetColumns} />
          </Card>
        </Col>
      </Row>
      <Row gutter={[16, 16]}>
        <Col span={24}>
          <Card className="panel-card" title="Dashboard Builder">
            <DashboardBuilderPanel />
          </Card>
        </Col>
      </Row>
    </div>
  );

  const collaborationTabContent = (
    <div className="section">
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={8}>
          <Card className="panel-card" title="Realtime Presence">
            <RealtimePresencePanel />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card className="panel-card" title="Workspaces">
            <WorkspacePanel activeWorkspaceId={workspaceId} onSelectWorkspace={setWorkspaceId} />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card className="panel-card" title="Business Context">
            <ContextPanel activeWorkspaceId={workspaceId} onSelectWorkspace={setWorkspaceId} />
          </Card>
        </Col>
      </Row>
    </div>
  );

  const automationTabContent = (
    <div className="section">
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={8}>
          <Card className="panel-card" title="Plugins">
            <PluginsPanel />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card className="panel-card" title="Connector Sync">
            <SyncPanel />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card className="panel-card" title="Webhooks">
            <WebhooksPanel />
          </Card>
        </Col>
      </Row>
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card className="panel-card" title="Scheduled Jobs">
            <JobsPanel />
          </Card>
        </Col>
      </Row>
    </div>
  );

  const governanceTabContent = (
    <div className="section">
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card className="panel-card" title="Audit Logs">
            <AuditLogPanel />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card className="panel-card" title="Usage Analytics">
            <UsageAnalyticsPanel />
          </Card>
        </Col>
      </Row>
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card className="panel-card" title="Cache Stats">
            <CacheStatsPanel />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card className="panel-card" title="Approval Workflows">
            <ApprovalsPanel />
          </Card>
        </Col>
      </Row>
    </div>
  );

  const adminTabContent = (
    <div className="section">
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card className="panel-card" title="Share Admin">
            <ShareAdminPanel />
          </Card>
        </Col>
      </Row>
    </div>
  );

  const plansTabContent = (
    <div className="section">
      <PlansPanel
        onSelectPlan={(plan) => {
          setSelectedPlan(plan);
          if (billingEnabled) {
            setActiveRoute("billing");
          } else {
            notify.info("Billing is disabled for the beta");
          }
        }}
      />
    </div>
  );

  const billingTabContent = (
    <div className="section">
      <BillingPanel selectedPlan={selectedPlan} />
      <PaymentSubscriptionPanel />
    </div>
  );

  const settingsTabContent = (
    <div className="section">
      <SettingsPagePanel />
    </div>
  );

  const aboutTabContent = (
    <div className="section">
      <AboutPanel />
    </div>
  );

  const reviewsTabContent = (
    <div className="section">
      <ReviewsPanel />
    </div>
  );

  const routeMap: Record<string, { title: string; description?: string; content: JSX.Element }> = {
    home: { title: "Home", description: "Dashboard overview", content: landingTabContent },
    demo: { title: "Demo", description: "Product walkthrough", content: demoTabContent },
    import: { title: "Import", description: "Bring data into your workspace", content: importTabContent },
    clean: { title: "Data Cleaning", description: "Fix data quality issues", content: cleaningTabContent },
    transform: { title: "Transform", description: "Build transformation flows", content: transformTabContent },
    model: { title: "Data Modeling", description: "Design your schema", content: modelingTabContent },
    ml: { title: "ML Modeling", description: "Train and deploy models", content: mlTabContent },
    dashboards: { title: "Dashboards", description: "Build analytics experiences", content: dashboardsTabContent },
    collab: { title: "Collaborate", description: "Share and manage access", content: collaborationTabContent },
    workspace: { title: "Workspace", description: "Manage projects and teams", content: workspaceTabContent },
    settings: { title: "Settings", description: "Manage account and preferences", content: settingsTabContent },
    plans: { title: "Plans", description: "Pricing and plan selection", content: plansTabContent },
    about: { title: "About", description: "Product story", content: aboutTabContent },
    reviews: { title: "Reviews", description: "Customer feedback", content: reviewsTabContent },
    automation: { title: "Automation", description: "Integrations and jobs", content: automationTabContent },
    governance: { title: "Activity", description: "Audit and governance", content: governanceTabContent },
    admin: { title: "Admin", description: "Administration", content: adminTabContent },
    shared: { title: "Shared", description: "Shared resources", content: sharedTabContent },
  };

  if (billingEnabled) {
    routeMap.billing = { title: "Billing", description: "Subscription and invoices", content: billingTabContent };
  }

  const activePage = routeMap[activeRoute] || routeMap.home;

  const workspaces = [
    { id: "personal", name: "Personal Workspace" },
    { id: "growth", name: "Growth Team" },
    { id: "enterprise", name: "Enterprise Ops" },
  ];

  const notifications: Array<{ id: string; text: string; time: string; unread: boolean }> = [
    { id: "n1", text: "Dataset sales_q4.csv imported", time: "2 min ago", unread: true },
    { id: "n2", text: "Dashboard shared with Finance", time: "1 hour ago", unread: false },
    { id: "n3", text: "Model Churn RF deployed", time: "2 hours ago", unread: true },
  ];

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 992);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setShowCommandPalette(true);
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "b") {
        event.preventDefault();
        setSidebarCollapsed((prev) => !prev);
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "/") {
        event.preventDefault();
        setShowShortcuts(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    let sequence = "";
    let timeout: number | undefined;
    const handler = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey) return;
      sequence += event.key.toLowerCase();
      if (sequence.endsWith("gh")) {
        setActiveRoute("home");
        sequence = "";
      }
      if (sequence.endsWith("gd")) {
        setActiveRoute("dashboards");
        sequence = "";
      }
      if (sequence.endsWith("gs")) {
        setActiveRoute("settings");
        sequence = "";
      }
      if (timeout) window.clearTimeout(timeout);
      timeout = window.setTimeout(() => {
        sequence = "";
      }, 800);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    setLoadingBar(true);
    const timer = window.setTimeout(() => setLoadingBar(false), 600);
    return () => window.clearTimeout(timer);
  }, [activeRoute, billingEnabled]);

  useEffect(() => {
    if (!billingEnabled && activeRoute === "billing") {
      setActiveRoute("plans");
    }
  }, [activeRoute]);

  const userMenuItems = [
    { key: "user", label: "Jordan Smith · jordan@acme.com" },
    { type: "divider" as const },
    { key: "account", label: "Account Settings", onClick: () => setActiveRoute("settings") },
    ...(billingEnabled
      ? [{ key: "billing", label: "Billing", onClick: () => setActiveRoute("billing") }]
      : []),
    { key: "docs", label: "Documentation" },
    { key: "help", label: "Help & Support" },
    { type: "divider" as const },
    {
      key: "signout",
      label: "Sign Out",
      onClick: () => {
        clearAuthToken();
        setHasToken(false);
        setRole(null);
        notify.info("Signed out");
      },
    },
  ];
  return (
    <Layout className="app-shell">
      <a href="#main" className="skip-link">Skip to content</a>
      {loadingBar && <div className="top-loading-bar" />}
      <Header className="top-nav" role="banner">
        <div className="top-nav-left">
          <Button
            className="mobile-only"
            type="text"
            icon={<MenuUnfoldOutlined />}
            onClick={() => setShowMobileNav(true)}
            aria-label="Open navigation"
          />
          <Button type="text" className="logo-button" onClick={() => setActiveRoute("home")}>
            <DashboardOutlined />
            <span className="logo-text">DataHub</span>
          </Button>
          <Dropdown
            trigger={["click"]}
            menu={{
              items: [
                ...workspaces.map((workspace) => ({
                  key: workspace.id,
                  label: (
                    <Space>
                      <Avatar size="small">{workspace.name.slice(0, 1)}</Avatar>
                      <span>{workspace.name}</span>
                    </Space>
                  ),
                  onClick: () => setWorkspaceId(workspace.id),
                })),
                { type: "divider" as const },
                { key: "create", label: "+ Create Workspace" },
                { key: "manage", label: "Manage Workspaces" },
              ],
            }}
          >
            <Button type="text" className="workspace-selector">
              <Space>
                <Avatar size="small">W</Avatar>
                <span>{workspaceId || "Growth Team"}</span>
                <DownOutlined />
              </Space>
            </Button>
          </Dropdown>
        </div>
        <div className="top-nav-center">
          <Input
            prefix={<SearchOutlined />}
            placeholder="Search datasets, dashboards..."
            onFocus={() => setShowCommandPalette(true)}
            value={commandQuery}
            onChange={(event) => setCommandQuery(event.target.value)}
          />
        </div>
        <div className="top-nav-right">
          <Dropdown
            trigger={["click"]}
            menu={{
              items: [
                { key: "project", label: "New Project" },
                { key: "import", label: "Import Data" },
                { key: "dashboard", label: "Create Dashboard" },
                { key: "train", label: "Train Model" },
              ],
              onClick: ({ key }) => notify.info(`Action: ${key}`),
            }}
          >
            <Button icon={<PlusOutlined />}>New</Button>
          </Dropdown>
          <Badge count={3} offset={[2, 2]}>
            <Button type="text" icon={<BellOutlined />} onClick={() => setShowNotifications(true)} />
          </Badge>
          <Dropdown
            trigger={["click"]}
            menu={{
              items: userMenuItems,
            }}
          >
            <Button type="text">
              <Avatar size="small">JS</Avatar>
            </Button>
          </Dropdown>
        </div>
      </Header>

      <Layout>
        <Sider
          className="side-nav desktop-only"
          collapsible
          collapsed={sidebarCollapsed}
          trigger={null}
          width={240}
          collapsedWidth={60}
        >
          <nav aria-label="Primary">
            <div className="side-nav-section">
              <Button
                type="text"
                className={`nav-item ${activeRoute === "home" ? "active" : ""}`}
                icon={<HomeOutlined />}
                onClick={() => setActiveRoute("home")}
              >
                {!sidebarCollapsed && "Home"}
              </Button>
            </div>
            <div className="side-nav-section">
              {!sidebarCollapsed && <Text className="nav-section-label">Data</Text>}
              <Tooltip title={sidebarCollapsed ? "Import" : ""} placement="right">
                <Button
                  type="text"
                  className={`nav-item ${activeRoute === "import" ? "active" : ""}`}
                  icon={<CloudUploadOutlined />}
                  onClick={() => setActiveRoute("import")}
                >
                  {!sidebarCollapsed && "Import"}
                </Button>
              </Tooltip>
              <Tooltip title={sidebarCollapsed ? "Datasets" : ""} placement="right">
                <Button
                  type="text"
                  className={`nav-item ${activeRoute === "clean" ? "active" : ""}`}
                  icon={<DatabaseOutlined />}
                  onClick={() => setActiveRoute("clean")}
                >
                  {!sidebarCollapsed && "Datasets"}
                </Button>
              </Tooltip>
              <Tooltip title={sidebarCollapsed ? "Connectors" : ""} placement="right">
                <Button
                  type="text"
                  className={`nav-item ${activeRoute === "automation" ? "active" : ""}`}
                  icon={<ApiOutlined />}
                  onClick={() => setActiveRoute("automation")}
                >
                  {!sidebarCollapsed && "Connectors"}
                </Button>
              </Tooltip>
            </div>
            <div className="side-nav-section">
              {!sidebarCollapsed && <Text className="nav-section-label">Transform</Text>}
              <Tooltip title={sidebarCollapsed ? "Clean" : ""} placement="right">
                <Button
                  type="text"
                  className={`nav-item ${activeRoute === "clean" ? "active" : ""}`}
                  icon={<ThunderboltOutlined />}
                  onClick={() => setActiveRoute("clean")}
                >
                  {!sidebarCollapsed && "Clean"}
                </Button>
              </Tooltip>
              <Tooltip title={sidebarCollapsed ? "Transform" : ""} placement="right">
                <Button
                  type="text"
                  className={`nav-item ${activeRoute === "transform" ? "active" : ""}`}
                  icon={<DeploymentUnitOutlined />}
                  onClick={() => setActiveRoute("transform")}
                >
                  {!sidebarCollapsed && "Transform"}
                </Button>
              </Tooltip>
              <Tooltip title={sidebarCollapsed ? "Model" : ""} placement="right">
                <Button
                  type="text"
                  className={`nav-item ${activeRoute === "model" ? "active" : ""}`}
                  icon={<ShareAltOutlined />}
                  onClick={() => setActiveRoute("model")}
                >
                  {!sidebarCollapsed && "Model"}
                </Button>
              </Tooltip>
            </div>
            <div className="side-nav-section">
              {!sidebarCollapsed && <Text className="nav-section-label">Analyze</Text>}
              <Tooltip title={sidebarCollapsed ? "Dashboards" : ""} placement="right">
                <Button
                  type="text"
                  className={`nav-item ${activeRoute === "dashboards" ? "active" : ""}`}
                  icon={<BarChartOutlined />}
                  onClick={() => setActiveRoute("dashboards")}
                >
                  {!sidebarCollapsed && "Dashboards"}
                </Button>
              </Tooltip>
              <Tooltip title={sidebarCollapsed ? "ML & AI" : ""} placement="right">
                <Button
                  type="text"
                  className={`nav-item ${activeRoute === "ml" ? "active" : ""}`}
                  icon={<ApiOutlined />}
                  onClick={() => setActiveRoute("ml")}
                >
                  {!sidebarCollapsed && "ML & AI"}
                </Button>
              </Tooltip>
            </div>
            <div className="side-nav-section">
              {!sidebarCollapsed && <Text className="nav-section-label">Collaborate</Text>}
              <Tooltip title={sidebarCollapsed ? "Team" : ""} placement="right">
                <Button
                  type="text"
                  className={`nav-item ${activeRoute === "collab" ? "active" : ""}`}
                  icon={<TeamOutlined />}
                  onClick={() => setActiveRoute("collab")}
                >
                  {!sidebarCollapsed && "Team"}
                </Button>
              </Tooltip>
              <Tooltip title={sidebarCollapsed ? "Shared" : ""} placement="right">
                <Button
                  type="text"
                  className={`nav-item ${activeRoute === "shared" ? "active" : ""}`}
                  icon={<ShareAltOutlined />}
                  onClick={() => setActiveRoute("shared")}
                >
                  {!sidebarCollapsed && "Shared"}
                </Button>
              </Tooltip>
              <Tooltip title={sidebarCollapsed ? "Activity" : ""} placement="right">
                <Button
                  type="text"
                  className={`nav-item ${activeRoute === "governance" ? "active" : ""}`}
                  icon={<BellOutlined />}
                  onClick={() => setActiveRoute("governance")}
                >
                  {!sidebarCollapsed && "Activity"}
                </Button>
              </Tooltip>
            </div>
            <div className="side-nav-bottom">
              <Button
                type="text"
                className={`nav-item ${activeRoute === "settings" ? "active" : ""}`}
                icon={<SettingOutlined />}
                onClick={() => setActiveRoute("settings")}
              >
                {!sidebarCollapsed && "Settings"}
              </Button>
              <Button
                type="text"
                className="nav-item"
                icon={sidebarCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                onClick={() => setSidebarCollapsed((prev) => !prev)}
              >
                {!sidebarCollapsed && "Collapse"}
              </Button>
            </div>
          </nav>
        </Sider>

        <Content className="main-content" id="main" role="main">
          <div className="content-container">
            <Breadcrumb
              items={[
                { title: "Home", onClick: () => setActiveRoute("home") },
                { title: activePage.title },
              ]}
            />
            <div className="page-header">
              <div>
                <Typography.Title level={2} style={{ marginBottom: 0 }}>
                  {activePage.title}
                </Typography.Title>
                {activePage.description && <Text type="secondary">{activePage.description}</Text>}
              </div>
              <Space>
                <Button onClick={() => setShowRightPanel((prev) => !prev)}>Toggle Context</Button>
                <Button type="primary">Primary Action</Button>
              </Space>
            </div>
            <Suspense
              fallback={(
                <div className="section">
                  <Card className="panel-card">
                    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                      <Typography.Title level={4} style={{ margin: 0 }}>
                        Loading workspace...
                      </Typography.Title>
                      <Typography.Text type="secondary">
                        Fetching modules and preparing the experience.
                      </Typography.Text>
                    </Space>
                  </Card>
                </div>
              )}
            >
              {isSharedView ? sharedTabContent : activePage.content}
            </Suspense>
          </div>
        </Content>

        {showRightPanel && !isMobile && (
          <aside className="right-panel" aria-label="Context panel">
            <Card className="panel-card" title="Context">
              <Typography.Text type="secondary">
                Contextual guidance and AI assistant content appears here.
              </Typography.Text>
            </Card>
          </aside>
        )}
      </Layout>

      <Drawer
        open={showNotifications}
        onClose={() => setShowNotifications(false)}
        title="Notifications"
        placement="right"
      >
        <Space direction="vertical" style={{ width: "100%" }}>
          <Button type="link" onClick={() => notify.success("All marked as read")}>Mark all as read</Button>
          <Tabs
            items={[
              { key: "all", label: "All", children: null },
              { key: "unread", label: "Unread", children: null },
              { key: "mentions", label: "Mentions", children: null },
            ]}
          />
          <List
            dataSource={notifications}
            locale={{ emptyText: "No new notifications" }}
            renderItem={(item) => (
              <List.Item>
                <List.Item.Meta
                  avatar={<Avatar>{item.text.slice(0, 1)}</Avatar>}
                  title={item.text}
                  description={item.time}
                />
                {item.unread && <Badge color="blue" />}
              </List.Item>
            )}
          />
          <Button type="link">View all</Button>
        </Space>
      </Drawer>

      <Modal
        open={showCommandPalette}
        onCancel={() => setShowCommandPalette(false)}
        footer={null}
        title="Command Palette"
      >
        <Space direction="vertical" style={{ width: "100%" }}>
          <Input
            autoFocus
            prefix={<SearchOutlined />}
            placeholder="Type a command or search..."
            value={commandQuery}
            onChange={(event) => setCommandQuery(event.target.value)}
            onPressEnter={() => {
              if (commandQuery.trim()) {
                setRecentSearches((prev) => [commandQuery, ...prev.slice(0, 4)]);
                setShowCommandPalette(false);
              }
            }}
          />
          <Text type="secondary">Recent searches</Text>
          <Space wrap>
            {recentSearches.map((item) => (
              <Tag key={item}>{item}</Tag>
            ))}
          </Space>
          <Divider />
          <Text type="secondary">Quick actions</Text>
          <List
            dataSource={["Import data", "Create dashboard", "Train model", "Invite member"]}
            renderItem={(item) => <List.Item>{item}</List.Item>}
          />
        </Space>
      </Modal>

      <Modal
        open={showShortcuts}
        onCancel={() => setShowShortcuts(false)}
        footer={null}
        title="Keyboard Shortcuts"
      >
        <List
          dataSource={[
            "Cmd/Ctrl + K: Command palette",
            "Cmd/Ctrl + B: Toggle sidebar",
            "Cmd/Ctrl + /: Shortcuts",
            "G then H: Home",
            "G then D: Dashboards",
            "G then S: Settings",
          ]}
          renderItem={(item) => <List.Item>{item}</List.Item>}
        />
      </Modal>

      <Drawer
        open={showMobileNav}
        onClose={() => setShowMobileNav(false)}
        placement="left"
        title="Navigation"
      >
        <List
          dataSource={[
            { key: "home", label: "Home" },
            { key: "import", label: "Import" },
            { key: "dashboards", label: "Dashboards" },
            { key: "settings", label: "Settings" },
          ]}
          renderItem={(item) => (
            <List.Item
              onClick={() => {
                setActiveRoute(item.key);
                setShowMobileNav(false);
              }}
            >
              {item.label}
            </List.Item>
          )}
        />
      </Drawer>

      {isMobile && (
        <div className="mobile-tab-bar">
          <Button type="text" icon={<HomeOutlined />} onClick={() => setActiveRoute("home")}>
            Home
          </Button>
          <Button type="text" icon={<DatabaseOutlined />} onClick={() => setActiveRoute("import")}>
            Data
          </Button>
          <Button type="text" icon={<BarChartOutlined />} onClick={() => setActiveRoute("dashboards")}>
            Dashboards
          </Button>
          <Button type="text" icon={<MenuUnfoldOutlined />} onClick={() => setShowMobileNav(true)}>
            More
          </Button>
        </div>
      )}
    </Layout>
  );
}
