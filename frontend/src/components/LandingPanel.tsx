import { Button, Card, Col, Divider, Row, Space, Tag, Typography } from "antd";
import { useNavigate } from "react-router-dom";

type Props = {
  onSelectTab: (key: string) => void;
};

const features = [
  {
    title: "Connect Anything",
    description: "Import CSV, databases, and SaaS data in minutes.",
  },
  {
    title: "AI Clean Auto",
    description: "Auto-detect issues and apply trusted recipes.",
  },
  {
    title: "Insights Instant",
    description: "Get correlation, trends, and summaries fast.",
  },
];

const pricing = [
  {
    name: "Free",
    price: "$0",
    period: "/mo",
    highlights: ["100 MB storage", "50 AI messages/mo", "1 workspace", "CSV/Excel only", "Community support"],
    cta: "Start Free",
  },
  {
    name: "Professional",
    price: "$79",
    period: "/user",
    highlights: ["10 GB storage", "500 AI messages/mo", "Database access", "3 workspaces", "Email support"],
    cta: "Start Professional",
    accent: true,
  },
  {
    name: "Team",
    price: "$149",
    period: "/user",
    highlights: ["100 GB shared storage", "Unlimited AI", "Snowflake & BigQuery", "Team collaboration", "Priority support"],
    cta: "Start Team",
  },
  {
    name: "Business",
    price: "$249",
    period: "/user",
    highlights: ["1 TB shared storage", "SSO & advanced RBAC", "Full audit trail", "SLA-backed uptime", "Success manager"],
    cta: "Contact Sales",
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    highlights: ["Unlimited storage", "On-premise option", "White-label", "Custom integrations", "24/7 support"],
    cta: "Contact",
  },
];

const testimonials = [
  {
    quote: "We shipped our analytics workflows 3x faster with DataHub.",
    name: "Priya N.",
    company: "Nimbus Retail",
  },
  {
    quote: "The AI copilot surfaces insights our teams missed before.",
    name: "Carlos M.",
    company: "FinSight",
  },
  {
    quote: "Audit-ready governance without slowing down the team.",
    name: "Morgan S.",
    company: "OpsHub",
  },
];

export function LandingPanel({ onSelectTab }: Props) {
  const navigate = useNavigate();

  const handleSignUp = () => {
    navigate("/signup");
  };

  const handleSignIn = () => {
    navigate("/login");
  };
  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <div className="hero">
        <Row gutter={[24, 24]} align="middle">
          <Col xs={24} lg={12}>
            <Tag color="blue">AI Analytics Studio</Tag>
            <Typography.Title level={1} style={{ marginTop: 12 }}>
              Clean, Analyze, and Share Your Data with AI-Powered Insights
            </Typography.Title>
            <Typography.Paragraph type="secondary">
              Move from raw data to trusted decisions faster. Build governed pipelines, collaborate in real time, and
              publish dashboards your team trusts.
            </Typography.Paragraph>
            <Space size="middle" wrap>
              <Button type="primary" size="large" onClick={handleSignUp}>
                Get Started Free
              </Button>
              <Button size="large" onClick={handleSignIn}>
                Sign In
              </Button>
              <Button size="large" onClick={() => onSelectTab("demo")}>
                Watch Demo
              </Button>
              <Button size="large" type="link" onClick={() => onSelectTab("plans")}
              >
                View Plans
              </Button>
            </Space>
          </Col>
          <Col xs={24} lg={12}>
            <Card className="hero-card" title="Live Workspace Preview">
              <Typography.Paragraph>
                A modern dashboard experience with AI suggestions, collaboration, and real-time metrics.
              </Typography.Paragraph>
              <div className="hero-preview" />
            </Card>
          </Col>
        </Row>
      </div>

      <div className="section">
        <Typography.Title level={3}>Why Teams Choose DataHub</Typography.Title>
        <Row gutter={[16, 16]}>
          {features.map((feature) => (
            <Col key={feature.title} xs={24} md={8}>
              <Card className="feature-card" hoverable>
                <Typography.Title level={4}>{feature.title}</Typography.Title>
                <Typography.Paragraph type="secondary">{feature.description}</Typography.Paragraph>
              </Card>
            </Col>
          ))}
        </Row>
      </div>

      <div className="section">
        <Typography.Title level={3}>Choose Your Plan</Typography.Title>
        <Row gutter={[16, 16]}>
          {pricing.map((plan) => (
            <Col key={plan.name} xs={24} md={12} lg={6}>
              <Card className={plan.accent ? "pricing-card pricing-card--accent" : "pricing-card"}>
                <Space direction="vertical" size="small" style={{ width: "100%" }}>
                  <Space align="center">
                    <Typography.Title level={4} style={{ marginBottom: 0 }}>
                      {plan.name}
                    </Typography.Title>
                    {plan.accent && <Tag color="blue">Most Popular</Tag>}
                  </Space>
                  <Typography.Title level={2} style={{ margin: 0 }}>
                    {plan.price}
                  </Typography.Title>
                  <Typography.Text type="secondary">{plan.period}</Typography.Text>
                  <Divider />
                  <Space direction="vertical">
                    {plan.highlights.map((item) => (
                      <Typography.Text key={item}>✓ {item}</Typography.Text>
                    ))}
                  </Space>
                  <Button type={plan.accent ? "primary" : "default"} onClick={() => onSelectTab("plans")}
                  >
                    {plan.cta}
                  </Button>
                </Space>
              </Card>
            </Col>
          ))}
        </Row>
      </div>

      <div className="section">
        <Typography.Title level={3}>Trusted by Modern Teams</Typography.Title>
        <Row gutter={[16, 16]}>
          {testimonials.map((item) => (
            <Col key={item.name} xs={24} md={8}>
              <Card className="panel-card">
                <Typography.Paragraph>“{item.quote}”</Typography.Paragraph>
                <Typography.Text strong>{item.name}</Typography.Text>
                <br />
                <Typography.Text type="secondary">{item.company}</Typography.Text>
              </Card>
            </Col>
          ))}
        </Row>
      </div>

      <Divider />
      <div className="footer">
        <Row gutter={[16, 16]}>
          <Col xs={24} md={6}>
            <Typography.Text strong>Product</Typography.Text>
            <Space direction="vertical">
              <Button type="link" onClick={() => onSelectTab("import")}>Features</Button>
              <Button type="link" onClick={() => onSelectTab("plans")}>Pricing</Button>
              <Button type="link" onClick={() => onSelectTab("demo")}>Demo</Button>
            </Space>
          </Col>
          <Col xs={24} md={6}>
            <Typography.Text strong>Company</Typography.Text>
            <Space direction="vertical">
              <Button type="link" onClick={() => onSelectTab("about")}>About</Button>
              <Button type="link">Careers</Button>
              <Button type="link">Blog</Button>
            </Space>
          </Col>
          <Col xs={24} md={6}>
            <Typography.Text strong>Resources</Typography.Text>
            <Space direction="vertical">
              <Button type="link">Docs</Button>
              <Button type="link">API</Button>
              <Button type="link">Support</Button>
            </Space>
          </Col>
          <Col xs={24} md={6}>
            <Typography.Text strong>Legal</Typography.Text>
            <Space direction="vertical">
              <Button type="link">Privacy</Button>
              <Button type="link">Terms</Button>
              <Button type="link">Security</Button>
            </Space>
          </Col>
        </Row>
        <Divider />
        <Typography.Text type="secondary">© 2026 DataHub. All rights reserved.</Typography.Text>
      </div>

    </Space>
  );
}
