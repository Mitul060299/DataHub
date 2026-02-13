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
  Rate,
} from "antd";
import {
  HomeOutlined,
  AppstoreOutlined,
  ShoppingOutlined,
  DatabaseOutlined,
  SwapOutlined,
  ExperimentOutlined,
  BranchesOutlined,
  CheckCircleOutlined,
  RobotOutlined,
  SendOutlined,
  BulbOutlined,
  EyeOutlined,
  ThunderboltOutlined,
  SaveOutlined,
  PlayCircleOutlined,
  ClockCircleOutlined,
  PlusOutlined,
  UserOutlined,
  BellOutlined,
  SettingOutlined,
  SearchOutlined,
  FilterOutlined,
  CopyOutlined,
  StarOutlined,
  RocketOutlined,
  CloudUploadOutlined,
  UploadOutlined,
  TeamOutlined,
  BarChartOutlined,
  FileOutlined,
  MoreOutlined,
  MailOutlined,
  PhoneOutlined,
  CreditCardOutlined,
  ApiOutlined,
  LockOutlined,
  QuestionCircleOutlined,
  FileTextOutlined,
  LogoutOutlined,
  DownOutlined,
} from "@ant-design/icons";
import { useMemo, useState } from "react";
import "./styles_new.css";

const { Header, Content, Sider } = Layout;
const { TextArea } = Input;
const { Title, Text, Paragraph } = Typography;

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
};

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

const CURRENT_USER = {
  name: "John Doe",
  email: "john@example.com",
  plan: "Professional",
  planColor: "blue",
};

export function App() {
  const [activeMainTab, setActiveMainTab] = useState("home");
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(null);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [activeInsightTab, setActiveInsightTab] = useState("suggestions");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: "Hello! I'm your AI Data Analyst. Select a dataset to start.",
      timestamp: "11:15 AM",
    },
  ]);
  const [inputMessage, setInputMessage] = useState("");
  const [selectedTable, setSelectedTable] = useState("sales_data");
  const [pipelineName, setPipelineName] = useState("Untitled Pipeline");

  const handleSendMessage = () => {
    if (!inputMessage.trim()) return;
    setChatMessages((prev) => [
      ...prev,
      {
        role: "user",
        content: inputMessage,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ]);
    setInputMessage("");
  };

  const unreadCount = useMemo(() => NOTIFICATIONS.filter((item) => !item.read).length, []);

  const dataOperationsTabs = [
    {
      key: "import",
      label: (
        <span className="data-tab-label">
          <DatabaseOutlined /> Data Import
        </span>
      ),
      children: (
        <div className="data-ops-content">
          <Card bordered={false}>
            <Title level={5}>Import Your Data</Title>
            <Text type="secondary">Choose your data source and let AI guide you</Text>
            <div style={{ marginTop: 16 }}>
              <Button type="link" block style={{ textAlign: "left" }}>
                Import a CSV file
              </Button>
              <Button type="link" block style={{ textAlign: "left" }}>
                Connect to PostgreSQL
              </Button>
              <Button type="link" block style={{ textAlign: "left" }}>
                Schedule daily import
              </Button>
            </div>
          </Card>
        </div>
      ),
    },
    {
      key: "transform",
      label: (
        <span className="data-tab-label">
          <SwapOutlined /> Transform
        </span>
      ),
      children: (
        <div className="data-ops-content">
          <Card bordered={false}>
            <Title level={5}>Transform Data</Title>
          </Card>
        </div>
      ),
    },
    {
      key: "ml-cleaning",
      label: (
        <span className="data-tab-label">
          <ExperimentOutlined /> ML/Cleaning
        </span>
      ),
      children: (
        <div className="data-ops-content">
          <Card bordered={false}>
            <Title level={5}>ML & Data Cleaning</Title>
          </Card>
        </div>
      ),
    },
    {
      key: "feature-eng",
      label: (
        <span className="data-tab-label">
          <BranchesOutlined /> Feature Eng
        </span>
      ),
      children: (
        <div className="data-ops-content">
          <Card bordered={false}>
            <Title level={5}>Feature Engineering</Title>
          </Card>
        </div>
      ),
    },
    {
      key: "quality",
      label: (
        <span className="data-tab-label">
          <CheckCircleOutlined /> Data Quality
        </span>
      ),
      children: (
        <div className="data-ops-content">
          <Card bordered={false}>
            <Title level={5}>Data Quality</Title>
          </Card>
        </div>
      ),
    },
  ];

  const insightTabs = [
    {
      key: "suggestions",
      label: (
        <span>
          <BulbOutlined /> AI Suggestions
        </span>
      ),
      children: (
        <div className="insights-content">
          <div style={{ textAlign: "center", padding: 32 }}>
            <Text type="secondary">No AI suggestions yet.</Text>
          </div>
        </div>
      ),
    },
    {
      key: "preview",
      label: (
        <span>
          <EyeOutlined /> Data Preview
        </span>
      ),
      children: (
        <div className="insights-content">
          <Select value={selectedTable} onChange={setSelectedTable} style={{ width: 200, marginBottom: 16 }}>
            <Select.Option value="sales_data">sales_data</Select.Option>
          </Select>
          <Text type="secondary">Table preview will appear here</Text>
        </div>
      ),
    },
  ];

  const handleNavigate = (tab: string) => {
    setActiveMainTab(tab);
    setActiveWorkspace(null);
    setActiveProject(null);
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
            {CURRENT_USER.name[0]}
          </Avatar>
          <div className="profile-info">
            <Text strong>{CURRENT_USER.name}</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {CURRENT_USER.email}
            </Text>
            <Tag color={CURRENT_USER.planColor} style={{ marginTop: 4 }}>
              {CURRENT_USER.plan} Plan
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
            { key: "logout", icon: <LogoutOutlined />, label: "Log Out", danger: true },
          ]}
        />
      </div>
    );

    return (
      <Dropdown dropdownRender={() => profileMenu} trigger={["click"]} placement="bottomRight">
        <Button type="text" style={{ height: "auto", padding: "4px 8px" }}>
          <Space>
            <Avatar size="small" icon={<UserOutlined />}>
              {CURRENT_USER.name[0]}
            </Avatar>
            <Text>{CURRENT_USER.name}</Text>
            <DownOutlined style={{ fontSize: 12 }} />
          </Space>
        </Button>
      </Dropdown>
    );
  };

  const HomeContent = () => (
    <div className="full-width-content">
      <div className="hero-section">
        <div className="hero-content">
          <Title level={1}>AI-Powered Data Analytics Platform</Title>
          <Paragraph className="hero-subtitle">
            Transform your data with intelligent automation, ML-powered insights,
            and collaborative workflows.
          </Paragraph>
          <Space size="large">
            <Button type="primary" size="large" icon={<RocketOutlined />}>
              Get Started Free
            </Button>
            <Button size="large" icon={<PlayCircleOutlined />}>
              Watch Demo
            </Button>
          </Space>
        </div>
        <div className="hero-image" />
      </div>

      <div className="features-section">
        <Title level={2}>Platform Capabilities</Title>
        <Row gutter={[24, 24]}>
          <Col span={8}>
            <Card className="feature-card">
              <DatabaseOutlined style={{ fontSize: 40, color: "#2563eb" }} />
              <Title level={4}>Data Import & Integration</Title>
              <Paragraph>
                Connect to CSV, PostgreSQL, MySQL, MongoDB, and more.
                Schedule automated imports.
              </Paragraph>
            </Card>
          </Col>
          <Col span={8}>
            <Card className="feature-card">
              <ThunderboltOutlined style={{ fontSize: 40, color: "#2563eb" }} />
              <Title level={4}>AI-Powered Cleaning</Title>
              <Paragraph>
                Automatically detect and fix data quality issues with ML algorithms.
              </Paragraph>
            </Card>
          </Col>
          <Col span={8}>
            <Card className="feature-card">
              <RobotOutlined style={{ fontSize: 40, color: "#2563eb" }} />
              <Title level={4}>Intelligent Assistant</Title>
              <Paragraph>
                Chat with AI to build pipelines, transform data, and get insights.
              </Paragraph>
            </Card>
          </Col>
          <Col span={8}>
            <Card className="feature-card">
              <SwapOutlined style={{ fontSize: 40, color: "#2563eb" }} />
              <Title level={4}>Transformation Studio</Title>
              <Paragraph>
                Build transformations with visual steps and AI guidance.
              </Paragraph>
            </Card>
          </Col>
          <Col span={8}>
            <Card className="feature-card">
              <ExperimentOutlined style={{ fontSize: 40, color: "#2563eb" }} />
              <Title level={4}>ML Modeling</Title>
              <Paragraph>
                Train and deploy predictive models with built-in workflows.
              </Paragraph>
            </Card>
          </Col>
          <Col span={8}>
            <Card className="feature-card">
              <BranchesOutlined style={{ fontSize: 40, color: "#2563eb" }} />
              <Title level={4}>Collaboration</Title>
              <Paragraph>
                Share datasets, pipelines, and dashboards across teams.
              </Paragraph>
            </Card>
          </Col>
        </Row>
      </div>

      <div className="pricing-section">
        <Title level={2}>Choose Your Plan</Title>
        <Row gutter={[24, 24]} justify="center">
          <Col span={6}>
            <Card className="pricing-card">
              <Tag color="default">Free</Tag>
              <Title level={3}>Starter</Title>
              <Title level={2}>
                $0<Text type="secondary">/month</Text>
              </Title>
              <ul className="pricing-features">
                <li>✓ 5 datasets</li>
                <li>✓ 100 MB storage</li>
                <li>✓ Basic AI features</li>
                <li>✓ 1 workspace</li>
              </ul>
              <Button block>Current Plan</Button>
            </Card>
          </Col>
          <Col span={6}>
            <Card className="pricing-card pricing-card-featured">
              <Tag color="blue">Popular</Tag>
              <Title level={3}>Professional</Title>
              <Title level={2}>
                $29<Text type="secondary">/month</Text>
              </Title>
              <ul className="pricing-features">
                <li>✓ Unlimited datasets</li>
                <li>✓ 10 GB storage</li>
                <li>✓ Advanced AI & ML</li>
                <li>✓ 10 workspaces</li>
                <li>✓ Priority support</li>
              </ul>
              <Button type="primary" block>
                Upgrade Now
              </Button>
            </Card>
          </Col>
          <Col span={6}>
            <Card className="pricing-card">
              <Tag color="gold">Enterprise</Tag>
              <Title level={3}>Team</Title>
              <Title level={2}>
                $99<Text type="secondary">/month</Text>
              </Title>
              <ul className="pricing-features">
                <li>✓ Everything in Pro</li>
                <li>✓ Unlimited storage</li>
                <li>✓ Team collaboration</li>
                <li>✓ Custom integrations</li>
                <li>✓ 24/7 support</li>
              </ul>
              <Button block>Contact Sales</Button>
            </Card>
          </Col>
        </Row>
      </div>

      <div className="reviews-section">
        <Title level={2}>Trusted by Data Teams</Title>
        <Card className="review-card-empty">
          <Space direction="vertical" size="middle" style={{ textAlign: "center", width: "100%" }}>
            <Rate disabled defaultValue={0} />
            <Paragraph>No reviews yet. Share your feedback to help the community.</Paragraph>
            <Button type="primary">Leave a Review</Button>
          </Space>
        </Card>
      </div>

      <div className="contact-section">
        <Title level={2}>Get in Touch</Title>
        <Row gutter={[48, 24]}>
          <Col span={12}>
            <Space direction="vertical" size="large" style={{ width: "100%" }}>
              <div>
                <MailOutlined style={{ fontSize: 24, color: "#2563eb" }} />
                <Title level={4}>Email</Title>
                <Text>support@datahub.com</Text>
              </div>
              <div>
                <PhoneOutlined style={{ fontSize: 24, color: "#2563eb" }} />
                <Title level={4}>Phone</Title>
                <Text>+1 (555) 123-4567</Text>
              </div>
            </Space>
          </Col>
          <Col span={12}>
            <Form layout="vertical">
              <Form.Item label="Name">
                <Input />
              </Form.Item>
              <Form.Item label="Email">
                <Input />
              </Form.Item>
              <Form.Item label="Message">
                <TextArea rows={4} />
              </Form.Item>
              <Button type="primary" block>
                Send Message
              </Button>
            </Form>
          </Col>
        </Row>
      </div>
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

  const WorkspaceGridContent = () => (
    <div className="full-width-content">
      <div className="workspaces-header">
        <div>
          <Title level={2}>Workspaces</Title>
          <Text type="secondary">Organize your projects into workspaces</Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />}>
          Create Workspace
        </Button>
      </div>

      <Row gutter={[24, 24]}>
        {WORKSPACES.map((workspace) => (
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
            <Button type="primary" icon={<PlusOutlined />}>
              New Project
            </Button>
          </Space>
        </div>

        <Row gutter={[24, 24]}>
          {PROJECTS.map((project) => (
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

  const ProjectWorkspaceContent = () => (
    <Layout className="ai-body">
      <Sider width={280} className="data-sidebar">
        <Tabs tabPosition="left" items={dataOperationsTabs} className="data-operations-tabs" />
      </Sider>
      <Content className="center-workspace">
        <Breadcrumb className="project-breadcrumb">
          <Breadcrumb.Item onClick={() => setActiveProject(null)}>
            {activeWorkspace?.name}
          </Breadcrumb.Item>
          <Breadcrumb.Item>{activeProject?.name}</Breadcrumb.Item>
        </Breadcrumb>
        <div className="ai-chat-container">
          <div className="chat-header">
            <Space>
              <RobotOutlined style={{ fontSize: 20, color: "#2563eb" }} />
              <Title level={4} style={{ margin: 0 }}>AI Data Analyst</Title>
            </Space>
            <Select placeholder="Select a dataset to start" style={{ width: 220 }}>
              <Select.Option value="sales">Sales Data</Select.Option>
            </Select>
          </div>
          <div className="chat-messages">
            {chatMessages.map((msg, idx) => (
              <div key={idx} className={`chat-message ${msg.role}`}>
                <Avatar className="message-avatar">
                  {msg.role === "user" ? <UserOutlined /> : <RobotOutlined />}
                </Avatar>
                <div className="message-body">
                  <div className="message-content">{msg.content}</div>
                  <Text type="secondary" className="message-time">{msg.timestamp}</Text>
                </div>
              </div>
            ))}
          </div>
          <div className="chat-input-area">
            <div className="suggested-prompts">
              <Tag className="suggested-prompt-chip">Import a CSV file</Tag>
              <Tag className="suggested-prompt-chip">Connect to PostgreSQL</Tag>
              <Tag className="suggested-prompt-chip">Schedule daily import</Tag>
            </div>
            <div className="chat-input-row">
              <TextArea
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onPressEnter={(e) => {
                  if (!e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder="Ask..."
                autoSize={{ minRows: 1, maxRows: 4 }}
                style={{ flex: 1 }}
              />
              <Button type="primary" icon={<SendOutlined />} onClick={handleSendMessage} />
            </div>
          </div>
        </div>
        <div className="insights-preview-container">
          <Tabs activeKey={activeInsightTab} onChange={setActiveInsightTab} items={insightTabs} />
        </div>
      </Content>
      <Sider width={320} className="pipeline-sidebar">
        <div className="pipeline-header">
          <Input
            className="pipeline-name-input"
            value={pipelineName}
            onChange={(e) => setPipelineName(e.target.value)}
            placeholder="Pipeline name"
            bordered={false}
          />
          <div className="pipeline-status-row">
            <Tag>draft</Tag>
            <Text type="secondary" style={{ fontSize: 12 }}>Not saved</Text>
          </div>
          <div className="pipeline-select-row">
            <Text type="secondary" style={{ fontSize: 12 }}>Run existing pipeline</Text>
            <Select placeholder="Select pipeline" style={{ width: "100%" }} />
          </div>
        </div>
        <div className="pipeline-steps-container">
          <Text strong style={{ display: "block", marginBottom: 12 }}>
            Add steps to build your pipeline.
          </Text>
          <Button className="add-step-button" icon={<PlusOutlined />}>Add Step</Button>
        </div>
        <div className="pipeline-actions">
          <Button icon={<SaveOutlined />} block>Save Pipeline</Button>
          <Button icon={<ClockCircleOutlined />} block>Schedule</Button>
          <Button type="primary" icon={<PlayCircleOutlined />} block size="large">
            Execute Now
          </Button>
        </div>
      </Sider>
    </Layout>
  );

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
    </Layout>
  );
}
