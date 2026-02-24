import {
  Layout,
  Typography,
  Space,
  Card,
  Button,
  Tabs,
  Input,
  Badge,
  Avatar,
  Tag,
  Select,
  Row,
  Col,
  Form,
  Divider,
  Breadcrumb,
  Statistic,
  Dropdown,
  Menu,
  Switch,
  Modal,
  Spin,
} from "antd";
import {
  HomeOutlined,
  AppstoreOutlined,
  ShoppingOutlined,
  DatabaseOutlined,
  SwapOutlined,
  ExperimentOutlined,
  BulbOutlined,
  EyeOutlined,
  ClockCircleOutlined,
  PlusOutlined,
  UserOutlined,
  BellOutlined,
  SettingOutlined,
  SearchOutlined,
  FilterOutlined,
  CopyOutlined,
  StarOutlined,
  CloudUploadOutlined,
  UploadOutlined,
  TeamOutlined,
  BarChartOutlined,
  FileOutlined,
  MoreOutlined,
  CreditCardOutlined,
  ApiOutlined,
  LockOutlined,
  QuestionCircleOutlined,
  FileTextOutlined,
  LogoutOutlined,
  DownOutlined,
} from "@ant-design/icons";
import { Suspense, lazy, useEffect, useMemo, useState, useCallback } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import "./styles.css";
import "./styles/CommandRibbon.css";
import { CommandRibbon } from "./components/CommandRibbon";
import { useUser } from "./contexts/UserContext";
import { useAuth } from "./contexts/AuthContext";
import { createWorkspace, listWorkspaces } from "./api";
import { notify } from "./utils/notify";

const HomePage = lazy(() =>
  import("./components/HomePage").then((module) => ({ default: module.HomePage }))
);
const ChatWorkspaceContent = lazy(() => import("./components/ChatWorkspaceContent"));
const LoginPage = lazy(() =>
  import("./pages/LoginPage").then((module) => ({ default: module.LoginPage }))
);
const SignupPage = lazy(() =>
  import("./pages/SignupPage").then((module) => ({ default: module.SignupPage }))
);

const { Header } = Layout;
const { Title, Text } = Typography;

type Workspace = {
  id: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  projectCount: number;
  memberCount: number;
  pipelineCount: number;
  members: Array<{ id: string; name: string; avatar?: string | null }>;
};

type Project = {
  id: string;
  name: string;
  description: string;
  type: "analytics" | "ml" | "etl";
  status: "active" | "draft";
  lastUpdated: string;
  datasetCount: number;
};

type MarketplacePipeline = {
  id: string;
  name: string;
  description: string;
  category: string;
  author: { name: string; avatar?: string | null };
  views: number;
  copies: number;
  rating: number;
  tags: string[];
};

type ActiveDataset = {
  datasetId: string;
  tableName: string;
};

const MARKETPLACE_PIPELINES: MarketplacePipeline[] = [
  {
    id: "1",
    name: "Sales Data Cleaning Pipeline",
    description: "Automated pipeline for cleaning and standardizing sales data from multiple sources",
    category: "data-cleaning",
    author: { name: "John Smith", avatar: null },
    views: 1234,
    copies: 89,
    rating: 4.8,
    tags: ["sales", "cleaning", "automation"],
  },
  {
    id: "2",
    name: "Marketing Attribution ETL",
    description: "Combine ad spend, CRM, and web analytics into a single dataset",
    category: "etl",
    author: { name: "Ava Johnson", avatar: null },
    views: 942,
    copies: 54,
    rating: 4.6,
    tags: ["marketing", "etl", "joins"],
  },
  {
    id: "3",
    name: "Churn Prediction Features",
    description: "Feature engineering steps for churn models with lagged metrics",
    category: "ml",
    author: { name: "Liam Patel", avatar: null },
    views: 712,
    copies: 33,
    rating: 4.7,
    tags: ["ml", "features", "churn"],
  },
];

const WORKSPACES: Workspace[] = [
  {
    id: "growth",
    name: "Growth Team",
    description: "Acquisition, activation, and retention analytics",
    color: "#2563eb",
    icon: "G",
    projectCount: 6,
    memberCount: 8,
    pipelineCount: 12,
    members: [
      { id: "m1", name: "Jordan" },
      { id: "m2", name: "Lee" },
      { id: "m3", name: "Morgan" },
      { id: "m4", name: "Avery" },
      { id: "m5", name: "Taylor" },
    ],
  },
  {
    id: "finance",
    name: "Finance Ops",
    description: "Revenue, billing, and forecasting",
    color: "#14b8a6",
    icon: "F",
    projectCount: 4,
    memberCount: 5,
    pipelineCount: 7,
    members: [
      { id: "m6", name: "Riley" },
      { id: "m7", name: "Casey" },
      { id: "m8", name: "Jamie" },
    ],
  },
  {
    id: "product",
    name: "Product Analytics",
    description: "Feature adoption and engagement metrics",
    color: "#f97316",
    icon: "P",
    projectCount: 5,
    memberCount: 6,
    pipelineCount: 10,
    members: [
      { id: "m9", name: "Sam" },
      { id: "m10", name: "Alex" },
      { id: "m11", name: "Chris" },
    ],
  },
];

const PROJECTS: Project[] = [
  {
    id: "p1",
    name: "Revenue Forecasting",
    description: "Predict monthly recurring revenue",
    type: "ml",
    status: "active",
    lastUpdated: "2 days ago",
    datasetCount: 6,
  },
  {
    id: "p2",
    name: "Customer Health",
    description: "Churn risk monitoring",
    type: "analytics",
    status: "active",
    lastUpdated: "5 days ago",
    datasetCount: 4,
  },
  {
    id: "p3",
    name: "ETL Refresh",
    description: "Daily import pipeline",
    type: "etl",
    status: "draft",
    lastUpdated: "1 week ago",
    datasetCount: 3,
  },
  {
    id: "p4",
    name: "Sales Performance",
    description: "Territory analysis dashboards",
    type: "analytics",
    status: "active",
    lastUpdated: "3 days ago",
    datasetCount: 5,
  },
];

const NOTIFICATIONS = [
  {
    id: 1,
    type: "success",
    title: "Pipeline completed",
    message: "Sales Analysis Pipeline finished successfully",
    time: "2 minutes ago",
    read: false,
  },
  {
    id: 2,
    type: "warning",
    title: "Data quality issue",
    message: "Found 15 duplicate rows in customer_data",
    time: "1 hour ago",
    read: false,
  },
  {
    id: 3,
    type: "info",
    title: "New pipeline shared",
    message: "Sarah shared \"ML Feature Pipeline\" with you",
    time: "3 hours ago",
    read: true,
  },
];

const planColors: Record<string, string> = {
  Free: "default",
  Professional: "blue",
  Team: "purple",
  Business: "geekblue",
  Enterprise: "gold",
};

const MAIN_TABS = new Set(["home", "workspaces", "marketplace", "settings"]);

const LazyFallback = () => (
  <div style={{ display: "grid", placeItems: "center", minHeight: "220px" }}>
    <Spin size="large" />
  </div>
);

const resolveMainTab = (search: string) => {
  const tab = new URLSearchParams(search).get("tab");
  return tab && MAIN_TABS.has(tab) ? tab : "home";
};

const AppShell = () => {
  const { plan, user, setWorkspaceId } = useUser();
  const { user: authUser, signOut, session } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const displayName =
    (authUser?.user_metadata?.full_name as string | undefined) || user?.username || "User";
  const displayEmail = authUser?.email ?? user?.username ?? "Unknown";
  const planColor = planColors[plan] ?? "blue";
  const [activeMainTab, setActiveMainTab] = useState(() => resolveMainTab(location.search));
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(() => {
    try {
      const saved = localStorage.getItem("activeWorkspace");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [activeProject, setActiveProject] = useState<Project | null>(() => {
    try {
      const saved = localStorage.getItem("activeProject");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [themeMode, setThemeMode] = useState<"light" | "dark">("light");
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [projects, setProjects] = useState<Project[]>(() => {
    try {
      const saved = localStorage.getItem("projects");
      return saved ? JSON.parse(saved) : PROJECTS;
    } catch {
      return PROJECTS;
    }
  });
  const [activeDataset, setActiveDataset] = useState<ActiveDataset | null>(null);

  useEffect(() => {
    document.body.setAttribute("data-theme", themeMode);
  }, [themeMode]);

  useEffect(() => {
    setActiveMainTab(resolveMainTab(location.search));
  }, [location.search]);

  useEffect(() => {
    setWorkspaceId(activeWorkspace?.id ?? "default");
  }, [activeWorkspace?.id, setWorkspaceId]);

  // Persist activeWorkspace to localStorage
  useEffect(() => {
    if (activeWorkspace) {
      localStorage.setItem("activeWorkspace", JSON.stringify(activeWorkspace));
    } else {
      localStorage.removeItem("activeWorkspace");
    }
  }, [activeWorkspace]);

  // Persist activeProject to localStorage
  useEffect(() => {
    if (activeProject) {
      localStorage.setItem("activeProject", JSON.stringify(activeProject));
    } else {
      localStorage.removeItem("activeProject");
    }
  }, [activeProject]);

  // Persist projects to localStorage
  useEffect(() => {
    localStorage.setItem("projects", JSON.stringify(projects));
  }, [projects]);

  useEffect(() => {
    setActiveDataset(null);
  }, [activeWorkspace?.id, activeProject?.id]);

  const loadWorkspaces = useCallback(async () => {
    try {
      const data = await listWorkspaces();
      setWorkspaces(data);
    } catch (err: any) {
      console.error("Failed to load workspaces:", err);
    }
  }, []);

  useEffect(() => {
    if (activeMainTab === "workspaces" && session) {
      loadWorkspaces();
    }
  }, [activeMainTab, session, loadWorkspaces]);

  const handleCreateWorkspace = async () => {
    if (!newWorkspaceName.trim()) {
      notify.error("Workspace name is required");
      return;
    }
    
    console.log('Creating workspace:', newWorkspaceName.trim());
    setIsCreatingWorkspace(true);
    
    try {
      const result = await createWorkspace(newWorkspaceName.trim());
      console.log('Workspace created:', result);
      notify.success("Workspace created successfully");
      setCreateWorkspaceOpen(false);
      setNewWorkspaceName("");
      await loadWorkspaces();
    } catch (err: any) {
      console.error('Error creating workspace:', err);
      const detail = err?.response?.data?.detail || err?.message || "Failed to create workspace";
      notify.error(detail);
    } finally {
      setIsCreatingWorkspace(false);
    }
  };

  const handleCreateProject = () => {
    if (!newProjectName.trim()) {
      notify.error("Project name is required");
      return;
    }
    if (!activeWorkspace) {
      notify.error("No workspace selected");
      return;
    }
    const newProject: Project = {
      id: `proj-${Date.now()}`,
      name: newProjectName.trim(),
      description: "New project",
      type: "analytics",
      status: "active",
      lastUpdated: "Just now",
      datasetCount: 0,
    };
    setProjects(prev => [...prev, { ...newProject, workspaceId: activeWorkspace.id } as any]);
    notify.success(`Project "${newProjectName}" created successfully`);
    setCreateProjectOpen(false);
    setNewProjectName("");
  };

  const unreadCount = useMemo(() => NOTIFICATIONS.filter((item) => !item.read).length, []);

  const handleNavigate = (tab: string) => {
    if (tab === "workspaces" && !session) {
      navigate("/login?from=workspaces", { replace: false, state: { from: { pathname: "/app" } } });
      return;
    }
    const nextTab = MAIN_TABS.has(tab) ? tab : "home";
    setActiveMainTab(tab);
    // Only clear workspace/project when navigating away from workspaces tab
    if (nextTab !== "workspaces") {
      setActiveWorkspace(null);
      setActiveProject(null);
    }
    navigate(`/app?tab=${encodeURIComponent(nextTab)}`);
  };

  const NotificationDropdown = () => {
    const notificationMenu = (
      <div className="notification-dropdown">
        <div className="notification-header">
          <Text strong>Notifications</Text>
          <Button type="link" size="small">
            Mark all as read
          </Button>
        </div>
        <div className="notification-list">
          {NOTIFICATIONS.map((notif) => (
            <div key={notif.id} className={`notification-item ${!notif.read ? "unread" : ""}`}>
              <Badge
                dot={!notif.read}
                status={
                  notif.type === "success"
                    ? "success"
                    : notif.type === "warning"
                    ? "warning"
                    : "processing"
                }
              />
              <div className="notification-content">
                <Text strong>{notif.title}</Text>
                <Text type="secondary">{notif.message}</Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {notif.time}
                </Text>
              </div>
            </div>
          ))}
        </div>
        <div className="notification-footer">
          <Button type="link" block>
            View All Notifications
          </Button>
        </div>
      </div>
    );

    return (
      <Dropdown dropdownRender={() => notificationMenu} trigger={["click"]} placement="bottomRight">
        <Badge count={unreadCount} offset={[-5, 5]}>
          <Button type="text" icon={<BellOutlined style={{ fontSize: 18 }} />} />
        </Badge>
      </Dropdown>
    );
  };

  const ProfileDropdown = () => {
    const profileMenu = (
      <div className="profile-dropdown">
        <div className="profile-dropdown-header">
          <Avatar size={48} icon={<UserOutlined />}>
            {displayName[0]}
          </Avatar>
          <div className="profile-info">
            <Text strong>{displayName}</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {displayEmail}
            </Text>
            <Tag color={planColor} style={{ marginTop: 4 }}>
              {plan} Plan
            </Tag>
          </div>
        </div>
        <Divider style={{ margin: "8px 0" }} />
        <Menu
          items={[
            {
              key: "switch-account",
              icon: <SwapOutlined />,
              label: "Switch Account",
              children: [
                { key: "account-1", label: "john@example.com (current)" },
                { key: "account-2", label: "john.work@company.com" },
                { key: "add-account", label: "+ Add Another Account", icon: <PlusOutlined /> },
              ],
            },
            { type: "divider" },
            {
              key: "profile",
              icon: <UserOutlined />,
              label: "Profile Settings",
              onClick: () => handleNavigate("settings"),
            },
            {
              key: "billing",
              icon: <CreditCardOutlined />,
              label: "Billing & Plans",
              onClick: () => handleNavigate("settings"),
            },
            {
              key: "workspaces",
              icon: <AppstoreOutlined />,
              label: "My Workspaces",
              onClick: () => handleNavigate("workspaces"),
            },
            { type: "divider" },
            { key: "help", icon: <QuestionCircleOutlined />, label: "Help & Support" },
            { key: "docs", icon: <FileTextOutlined />, label: "Documentation" },
            { type: "divider" },
            {
              key: "logout",
              icon: <LogoutOutlined />,
              label: "Log Out",
              danger: true,
              onClick: async () => {
                await signOut();
                navigate("/app?tab=home", { replace: true });
              },
            },
          ]}
        />
      </div>
    );

    return (
      <Dropdown dropdownRender={() => profileMenu} trigger={["click"]} placement="bottomRight">
        <Button type="text" style={{ height: "auto", padding: "4px 8px" }}>
          <Space>
            <Avatar size="small" icon={<UserOutlined />}>
              {displayName[0]}
            </Avatar>
            <Text>{displayName}</Text>
            <DownOutlined style={{ fontSize: 12 }} />
          </Space>
        </Button>
      </Dropdown>
    );
  };

  const HomeContent = () => (
    <div className="full-width-content home-page-wrapper">
      <Suspense fallback={<LazyFallback />}>
        <HomePage />
      </Suspense>
    </div>
  );

  const MarketplaceContent = () => (
    <div className="full-width-content">
      <div className="marketplace-header">
        <Title level={2}>Pipeline Marketplace</Title>
        <Text type="secondary">Discover and use pipelines created by the community</Text>
        <div className="marketplace-search">
          <Input.Search
            size="large"
            placeholder="Search pipelines by name, category, or tags..."
            prefix={<SearchOutlined />}
            style={{ maxWidth: 600 }}
          />
        </div>
        <Space className="marketplace-filters">
          <Select defaultValue="all" style={{ width: 150 }}>
            <Select.Option value="all">All Categories</Select.Option>
            <Select.Option value="data-cleaning">Data Cleaning</Select.Option>
            <Select.Option value="etl">ETL</Select.Option>
            <Select.Option value="ml">Machine Learning</Select.Option>
            <Select.Option value="analytics">Analytics</Select.Option>
          </Select>
          <Select defaultValue="popular" style={{ width: 150 }}>
            <Select.Option value="popular">Most Popular</Select.Option>
            <Select.Option value="recent">Most Recent</Select.Option>
            <Select.Option value="rating">Highest Rated</Select.Option>
          </Select>
          <Button icon={<FilterOutlined />}>More Filters</Button>
        </Space>
      </div>

      <div className="marketplace-grid">
        <Row gutter={[24, 24]}>
          {MARKETPLACE_PIPELINES.map((pipeline) => (
            <Col span={8} key={pipeline.id}>
              <Card
                className="marketplace-pipeline-card"
                hoverable
                cover={
                  <div className="pipeline-preview">
                    <Tag color="blue">{pipeline.category}</Tag>
                  </div>
                }
                actions={[
                  <Button type="link" icon={<EyeOutlined />} key="views">
                    {pipeline.views} views
                  </Button>,
                  <Button type="link" icon={<CopyOutlined />} key="copies">
                    {pipeline.copies} copies
                  </Button>,
                  <Button type="link" icon={<StarOutlined />} key="rating">
                    {pipeline.rating}
                  </Button>,
                ]}
              >
                <Card.Meta title={pipeline.name} description={pipeline.description} />
                <Space className="pipeline-meta" style={{ marginTop: 12 }}>
                  <Avatar size="small">
                    {pipeline.author.name[0]}
                  </Avatar>
                  <Text type="secondary">{pipeline.author.name}</Text>
                </Space>
                <div style={{ marginTop: 16 }}>
                  {pipeline.tags.map((tag) => (
                    <Tag key={tag}>{tag}</Tag>
                  ))}
                </div>
                <Space style={{ marginTop: 16, width: "100%" }} direction="vertical">
                  <Button type="primary" block icon={<CopyOutlined />}>
                    Copy to My Workspace
                  </Button>
                  <Button block icon={<EyeOutlined />}>
                    View Details
                  </Button>
                </Space>
              </Card>
            </Col>
          ))}
        </Row>
      </div>

      <Card className="upload-pipeline-card">
        <Space direction="vertical" size="large" style={{ width: "100%", textAlign: "center" }}>
          <CloudUploadOutlined style={{ fontSize: 48, color: "#2563eb" }} />
          <div>
            <Title level={4}>Share Your Pipeline</Title>
            <Text type="secondary">Help the community by sharing your pipelines</Text>
          </div>
          <Button type="primary" size="large" icon={<UploadOutlined />}>
            Upload Pipeline
          </Button>
        </Space>
      </Card>
    </div>
  );

  const WorkspaceGridContent = () => {
    const displayWorkspaces = workspaces.length > 0 ? workspaces.map(ws => ({
      id: ws.id,
      name: ws.name,
      description: ws.description || "No description",
      color: "#2563eb",
      icon: ws.name.charAt(0).toUpperCase(),
      projectCount: 0,
      memberCount: 0,
      pipelineCount: 0,
      members: [],
    })) : WORKSPACES;

    return (
      <div className="full-width-content">
        <div className="workspaces-header">
          <div>
            <Title level={2}>Workspaces</Title>
            <Text type="secondary">Organize your projects into workspaces</Text>
          </div>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateWorkspaceOpen(true)}>
            Create Workspace
          </Button>
        </div>

        <Row gutter={[24, 24]}>
          {displayWorkspaces.map((workspace) => (
          <Col span={8} key={workspace.id}>
            <Card
              className="workspace-card"
              hoverable
              onClick={() => setActiveWorkspace(workspace)}
            >
              <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                <div className="workspace-header">
                  <Avatar size={48} style={{ backgroundColor: workspace.color }}>
                    {workspace.icon}
                  </Avatar>
                  <Dropdown
                    menu={{
                      items: [
                        { key: "rename", label: "Rename" },
                        { key: "archive", label: "Archive" },
                      ],
                    }}
                  >
                    <Button type="text" icon={<MoreOutlined />} />
                  </Dropdown>
                </div>
                <div>
                  <Title level={4}>{workspace.name}</Title>
                  <Text type="secondary">{workspace.description}</Text>
                </div>
                <div className="workspace-stats">
                  <Space split={<Divider type="vertical" />}>
                    <Statistic title="Projects" value={workspace.projectCount} valueStyle={{ fontSize: 16 }} />
                    <Statistic title="Members" value={workspace.memberCount} valueStyle={{ fontSize: 16 }} />
                    <Statistic title="Pipelines" value={workspace.pipelineCount} valueStyle={{ fontSize: 16 }} />
                  </Space>
                </div>
                <div className="workspace-members">
                  <Avatar.Group maxCount={4}>
                    {workspace.members.map((member) => (
                      <Avatar key={member.id}>{member.name[0]}</Avatar>
                    ))}
                  </Avatar.Group>
                </div>
              </Space>
            </Card>
          </Col>
        ))}
      </Row>
    </div>
    );
  };

  const ProjectGridContent = () => {
    if (!activeWorkspace) return null;

    return (
      <div className="full-width-content">
        <Breadcrumb>
          <Breadcrumb.Item onClick={() => setActiveWorkspace(null)}>
            Workspaces
          </Breadcrumb.Item>
          <Breadcrumb.Item>{activeWorkspace.name}</Breadcrumb.Item>
        </Breadcrumb>

        <div className="projects-header">
          <div>
            <Title level={2}>{activeWorkspace.name}</Title>
            <Text type="secondary">{activeWorkspace.description}</Text>
          </div>
          <Space>
            <Button icon={<TeamOutlined />}>Manage Members</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateProjectOpen(true)}>
              New Project
            </Button>
          </Space>
        </div>

        <Row gutter={[24, 24]}>
          {projects.filter((p: any) => !p.workspaceId || p.workspaceId === activeWorkspace.id).map((project) => (
            <Col span={6} key={project.id}>
              <Card
                className="project-card"
                hoverable
                onClick={() => setActiveProject(project)}
                cover={
                  <div className="project-preview">
                    {project.type === "analytics" && <BarChartOutlined />}
                    {project.type === "ml" && <ExperimentOutlined />}
                    {project.type === "etl" && <SwapOutlined />}
                  </div>
                }
              >
                <Card.Meta
                  title={project.name}
                  description={
                    <>
                      <Text type="secondary">{project.description}</Text>
                      <div style={{ marginTop: 8 }}>
                        <Tag color={project.status === "active" ? "green" : "default"}>
                          {project.status}
                        </Tag>
                      </div>
                    </>
                  }
                />
                <Divider />
                <Space direction="vertical" size="small" style={{ width: "100%" }}>
                  <Text type="secondary">
                    <ClockCircleOutlined /> Updated {project.lastUpdated}
                  </Text>
                  <Text type="secondary">
                    <FileOutlined /> {project.datasetCount} datasets
                  </Text>
                </Space>
              </Card>
            </Col>
          ))}
        </Row>
      </div>
    );
  };

  const SettingsContent = () => (
    <div className="full-width-content settings-container">
      <Title level={2}>Settings</Title>
      <Tabs
        tabPosition="left"
        className="settings-tabs"
        items={[
          {
            key: "profile",
            label: (
              <span>
                <UserOutlined /> Profile
              </span>
            ),
            children: (
              <Card>
                <Space direction="vertical" size="large" style={{ width: "100%" }}>
                  <div className="avatar-section">
                    <Avatar size={80} icon={<UserOutlined />} />
                    <Button>Change Avatar</Button>
                  </div>
                  <Form layout="vertical">
                    <Form.Item label="Full Name">
                      <Input defaultValue="John Doe" />
                    </Form.Item>
                    <Form.Item label="Email">
                      <Input defaultValue="john@example.com" disabled />
                    </Form.Item>
                    <Form.Item label="Company">
                      <Input placeholder="Your company name" />
                    </Form.Item>
                    <Form.Item label="Role">
                      <Select defaultValue="data-engineer">
                        <Select.Option value="data-engineer">Data Engineer</Select.Option>
                        <Select.Option value="data-scientist">Data Scientist</Select.Option>
                        <Select.Option value="analyst">Data Analyst</Select.Option>
                      </Select>
                    </Form.Item>
                  </Form>
                  <Button type="primary">Save Changes</Button>
                </Space>
              </Card>
            ),
          },
          {
            key: "account",
            label: (
              <span>
                <SettingOutlined /> Account
              </span>
            ),
            children: <Card>Account settings content.</Card>,
          },
          {
            key: "appearance",
            label: (
              <span>
                <BulbOutlined /> Appearance
              </span>
            ),
            children: (
              <Card>
                <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                  <div>
                    <Title level={5}>Theme</Title>
                    <Text type="secondary">Switch between light and dark mode.</Text>
                  </div>
                  <Space align="center">
                    <Text>Light</Text>
                    <Switch
                      checked={themeMode === "dark"}
                      onChange={(checked) => setThemeMode(checked ? "dark" : "light")}
                    />
                    <Text>Dark</Text>
                  </Space>
                </Space>
              </Card>
            ),
          },
          {
            key: "billing",
            label: (
              <span>
                <CreditCardOutlined /> Billing
              </span>
            ),
            children: <Card>Billing settings content.</Card>,
          },
          {
            key: "notifications",
            label: (
              <span>
                <BellOutlined /> Notifications
              </span>
            ),
            children: <Card>Notification settings content.</Card>,
          },
          {
            key: "integrations",
            label: (
              <span>
                <ApiOutlined /> Integrations
              </span>
            ),
            children: <Card>Integrations settings content.</Card>,
          },
          {
            key: "security",
            label: (
              <span>
                <LockOutlined /> Security
              </span>
            ),
            children: <Card>Security settings content.</Card>,
          },
        ]}
      />
    </div>
  );

  const hasDataLoaded = !!activeDataset?.datasetId;

  const handleImportComplete = (selection: { datasetId: string; tableName: string }) => {
    setActiveDataset(selection);
  };

  const ProjectWorkspaceContent = () => {
    if (!hasDataLoaded) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <CommandRibbon
            projectId={activeProject?.id}
            workspaceId={activeWorkspace?.id}
            hasData={false}
            onImportComplete={handleImportComplete}
          />
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '40px',
            textAlign: 'center',
            color: '#8c8c8c',
          }}>
            <div style={{
              fontSize: '48px',
              marginBottom: '20px',
              opacity: 0.3,
            }}>
              📊
            </div>
            <h2 style={{ fontSize: '24px', marginBottom: '12px', color: '#262626' }}>
              No Data Loaded
            </h2>
            <p style={{ fontSize: '16px', marginBottom: '32px', maxWidth: '400px' }}>
              Stage 1 starts with data import. Use the Import button above or load a sample dataset to explore the workspace flow.
            </p>
            <Space>
              <Button onClick={() => notify.info('Use Import, then click Use in workspace for the dataset you want to work with.') }>
                What can I do here?
              </Button>
            </Space>
          </div>
        </div>
      );
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <CommandRibbon
          projectId={activeProject?.id}
          workspaceId={activeWorkspace?.id}
          hasData={hasDataLoaded}
          onImportComplete={handleImportComplete}
        />
        <Suspense fallback={<LazyFallback />}>
          <ChatWorkspaceContent
            workspace={activeWorkspace}
            project={activeProject}
            dataset={{ id: activeDataset?.datasetId, name: activeDataset?.tableName || "Untitled" }}
            userPlan={plan as any}
            onDatasetSelected={handleImportComplete}
            onSessionCreated={(sessionId) => console.log("Chat session created:", sessionId)}
          />
        </Suspense>
      </div>
    );
  };

  const renderContent = () => {
    if (activeMainTab === "home") return <HomeContent />;
    if (activeMainTab === "marketplace") return <MarketplaceContent />;
    if (activeMainTab === "settings") return <SettingsContent />;

    if (activeMainTab === "workspaces") {
      if (!activeWorkspace) return <WorkspaceGridContent />;
      if (!activeProject) return <ProjectGridContent />;
      return <ProjectWorkspaceContent />;
    }

    return <HomeContent />;
  };

  return (
    <Layout className="ai-analytics-layout">
      <Header className="ai-topbar">
        <div className="topbar-left">
          <div className="topbar-brand">
            <DatabaseOutlined className="brand-icon" />
            <span>DataHub</span>
          </div>
          <nav className="topbar-nav">
            <Button
              type="text"
              icon={<HomeOutlined />}
              className={`topbar-item ${activeMainTab === "home" ? "active" : ""}`}
              onClick={() => handleNavigate("home")}
            >
              Home
            </Button>
            <Button
              type="text"
              icon={<AppstoreOutlined />}
              className={`topbar-item ${activeMainTab === "workspaces" ? "active" : ""}`}
              onClick={() => handleNavigate("workspaces")}
            >
              Workspaces
            </Button>
            <Button
              type="text"
              icon={<ShoppingOutlined />}
              className={`topbar-item ${activeMainTab === "marketplace" ? "active" : ""}`}
              onClick={() => handleNavigate("marketplace")}
            >
              Marketplace
            </Button>
          </nav>
        </div>
        <div className="topbar-actions">
          <NotificationDropdown />
          <Button
            type="text"
            icon={<SettingOutlined />}
            onClick={() => handleNavigate("settings")}
          />
          <ProfileDropdown />
        </div>
      </Header>
      {renderContent()}

      <Modal
        title="Create Workspace"
        open={createWorkspaceOpen}
        onCancel={() => {
          setCreateWorkspaceOpen(false);
          setNewWorkspaceName("");
        }}
        onOk={handleCreateWorkspace}
        okText="Create"
        confirmLoading={isCreatingWorkspace}
        destroyOnClose
      >
        <Input
          placeholder="Workspace name"
          value={newWorkspaceName}
          onChange={(e) => setNewWorkspaceName(e.target.value)}
          onPressEnter={handleCreateWorkspace}
        />
      </Modal>

      <Modal
        title="Create Project"
        open={createProjectOpen}
        onCancel={() => {
          setCreateProjectOpen(false);
          setNewProjectName("");
        }}
        onOk={handleCreateProject}
        okText="Create"
        destroyOnClose
      >
        <Input
          placeholder="Project name"
          value={newProjectName}
          onChange={(e) => setNewProjectName(e.target.value)}
          onPressEnter={handleCreateProject}
        />
      </Modal>
    </Layout>
  );
};

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/app" replace />} />
      <Route
        path="/login"
        element={
          <Suspense fallback={<LazyFallback />}>
            <LoginPage />
          </Suspense>
        }
      />
      <Route
        path="/signup"
        element={
          <Suspense fallback={<LazyFallback />}>
            <SignupPage />
          </Suspense>
        }
      />
      <Route path="/app" element={<AppShell />} />
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  );
}
