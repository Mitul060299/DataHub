import {
  Typography,
  Button,
  Card,
  Row,
  Col,
  Space,
  Divider,
  Tag,
  List,
  Avatar,
  Rate,
  Form,
  Input,
  Statistic,
} from "antd";
import {
  RocketOutlined,
  PlayCircleOutlined,
  CheckOutlined,
  DatabaseOutlined,
  ThunderboltOutlined,
  RobotOutlined,
  BranchesOutlined,
  ShareAltOutlined,
  TeamOutlined,
  LineChartOutlined,
  MailOutlined,
  PhoneOutlined,
  StarFilled,
} from "@ant-design/icons";
import "./HomePage.css";
import { useUser } from "../contexts/UserContext";

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

export const HomePage = () => {
  const { plan } = useUser();
  const isCurrentPlan = (target: string) => plan === target;
  const handleGetStarted = () => {
    console.log("Get Started clicked");
  };

  const handleUpgrade = (plan: string) => {
    console.log(`Upgrade to ${plan} clicked`);
  };

  return (
    <div className="home-page">
      <section className="hero-section">
        <div className="hero-content">
          <Tag color="blue" className="hero-tag">
            <ThunderboltOutlined /> AI-Powered Data Analytics
          </Tag>
          <Title level={1} className="hero-title">
            Transform Your Data with
            <br />
            <span className="gradient-text">Intelligent Automation</span>
          </Title>
          <Paragraph className="hero-subtitle">
            The AI data platform that does the work of Alteryx ($433/mo) + Tableau ($75/mo)
            + ChatGPT ($20/mo) for just <strong>$79/month</strong>
          </Paragraph>
          <Space size="large" className="hero-actions">
            <Button type="primary" size="large" icon={<RocketOutlined />} onClick={handleGetStarted}>
              Get Started Free
            </Button>
            <Button size="large" icon={<PlayCircleOutlined />}>
              Watch Demo
            </Button>
          </Space>
          <Text type="secondary" className="hero-note">
            No credit card required | 100 AI messages free | 2 pipelines included
          </Text>
        </div>
        <div className="hero-image">
          <div className="hero-visual">
            <div className="floating-card card-1">
              <DatabaseOutlined style={{ fontSize: 32, color: "#2563eb" }} />
              <Text>Import Data</Text>
            </div>
            <div className="floating-card card-2">
              <RobotOutlined style={{ fontSize: 32, color: "#7c3aed" }} />
              <Text>AI Assistant</Text>
            </div>
            <div className="floating-card card-3">
              <LineChartOutlined style={{ fontSize: 32, color: "#059669" }} />
              <Text>Insights</Text>
            </div>
          </div>
        </div>
      </section>

      <section className="features-section">
        <div className="section-header">
          <Title level={2}>Platform Capabilities</Title>
          <Paragraph type="secondary">
            Everything you need for modern data analytics in one platform
          </Paragraph>
        </div>

        <Row gutter={[24, 24]}>
          <Col xs={24} sm={12} lg={8}>
            <Card className="feature-card" hoverable>
              <DatabaseOutlined className="feature-icon" />
              <Title level={4}>Universal Data Import</Title>
              <Paragraph>
                Connect to CSV, Excel, PostgreSQL, MySQL, MongoDB, Snowflake, BigQuery,
                S3, and more. Schedule automated imports.
              </Paragraph>
              <List
                size="small"
                dataSource={[
                  "All file formats (CSV, Excel, JSON, Parquet)",
                  "SQL & NoSQL databases",
                  "Cloud data lakes (S3, GCS, Azure)",
                  "Automated scheduling",
                ]}
                renderItem={(item) => (
                  <List.Item>
                    <CheckOutlined style={{ color: "#52c41a", marginRight: 8 }} />
                    {item}
                  </List.Item>
                )}
              />
            </Card>
          </Col>

          <Col xs={24} sm={12} lg={8}>
            <Card className="feature-card" hoverable>
              <ThunderboltOutlined className="feature-icon" />
              <Title level={4}>AI-Powered Cleaning</Title>
              <Paragraph>
                Automatically detect and fix data quality issues. Remove duplicates,
                handle missing values, standardize formats with AI.
              </Paragraph>
              <List
                size="small"
                dataSource={[
                  "Smart duplicate detection",
                  "Intelligent null handling",
                  "Automated format standardization",
                  "Data quality scoring",
                ]}
                renderItem={(item) => (
                  <List.Item>
                    <CheckOutlined style={{ color: "#52c41a", marginRight: 8 }} />
                    {item}
                  </List.Item>
                )}
              />
            </Card>
          </Col>

          <Col xs={24} sm={12} lg={8}>
            <Card className="feature-card" hoverable>
              <RobotOutlined className="feature-icon" />
              <Title level={4}>Intelligent AI Assistant</Title>
              <Paragraph>
                Chat with your data in plain English. Ask questions, build pipelines,
                and get insights without writing code.
              </Paragraph>
              <List
                size="small"
                dataSource={[
                  "Natural language queries",
                  "Automated pipeline building",
                  "Instant insights & recommendations",
                  "Step-by-step guidance",
                ]}
                renderItem={(item) => (
                  <List.Item>
                    <CheckOutlined style={{ color: "#52c41a", marginRight: 8 }} />
                    {item}
                  </List.Item>
                )}
              />
            </Card>
          </Col>

          <Col xs={24} sm={12} lg={8}>
            <Card className="feature-card" hoverable>
              <BranchesOutlined className="feature-icon" />
              <Title level={4}>Visual Transformations</Title>
              <Paragraph>
                Drag-and-drop interface for complex data transformations. Filter, join,
                aggregate, and reshape data visually.
              </Paragraph>
              <List
                size="small"
                dataSource={[
                  "No-code transformation builder",
                  "Advanced data operations",
                  "Real-time preview",
                  "Reusable transformation templates",
                ]}
                renderItem={(item) => (
                  <List.Item>
                    <CheckOutlined style={{ color: "#52c41a", marginRight: 8 }} />
                    {item}
                  </List.Item>
                )}
              />
            </Card>
          </Col>

          <Col xs={24} sm={12} lg={8}>
            <Card className="feature-card" hoverable>
              <LineChartOutlined className="feature-icon" />
              <Title level={4}>AutoML & Analytics</Title>
              <Paragraph>
                Build machine learning models without code. Automated feature engineering,
                model selection, and deployment.
              </Paragraph>
              <List
                size="small"
                dataSource={[
                  "One-click ML model training",
                  "Automated feature engineering",
                  "Model performance insights",
                  "Easy model deployment",
                ]}
                renderItem={(item) => (
                  <List.Item>
                    <CheckOutlined style={{ color: "#52c41a", marginRight: 8 }} />
                    {item}
                  </List.Item>
                )}
              />
            </Card>
          </Col>

          <Col xs={24} sm={12} lg={8}>
            <Card className="feature-card" hoverable>
              <ShareAltOutlined className="feature-icon" />
              <Title level={4}>Pipeline Automation</Title>
              <Paragraph>
                Build, schedule, and share automated data pipelines. Version control,
                monitoring, and marketplace integration.
              </Paragraph>
              <List
                size="small"
                dataSource={[
                  "Visual pipeline builder",
                  "Scheduled execution",
                  "Pipeline marketplace",
                  "Real-time monitoring",
                ]}
                renderItem={(item) => (
                  <List.Item>
                    <CheckOutlined style={{ color: "#52c41a", marginRight: 8 }} />
                    {item}
                  </List.Item>
                )}
              />
            </Card>
          </Col>
        </Row>
      </section>

      <section className="pricing-section">
        <div className="section-header">
          <Title level={2}>Choose Your Plan</Title>
          <Paragraph type="secondary">
            Enterprise features at SMB prices. Start free, upgrade anytime.
          </Paragraph>
        </div>

        <Row gutter={[24, 24]} justify="center">
          <Col xs={24} sm={12} lg={6}>
            <Card className="pricing-card">
              <div className="plan-header">
                <Tag color="default">FREE</Tag>
                <Title level={3}>Free</Title>
                <div className="plan-price">
                  <span className="price-amount">$0</span>
                  <span className="price-period">/month</span>
                </div>
                <Text type="secondary">Perfect for learning</Text>
              </div>

              <Divider />

              <ul className="plan-features">
                <li><CheckOutlined /> Storage: 100 MB</li>
                <li><CheckOutlined /> AI messages: 50/month</li>
                <li><CheckOutlined /> Workspaces: 1</li>
                <li><CheckOutlined /> Projects: 2</li>
                <li><CheckOutlined /> Datasets/project: 3</li>
                <li><CheckOutlined /> File size: 50 MB</li>
              </ul>

              <Button
                block
                size="large"
                style={{ marginTop: 16 }}
                disabled={isCurrentPlan("Free")}
              >
                {isCurrentPlan("Free") ? "Current Plan" : "Start Free"}
              </Button>
            </Card>
          </Col>

          <Col xs={24} sm={12} lg={6}>
            <Card className="pricing-card pricing-card-featured">
              <div className="featured-badge">
                <StarFilled /> MOST POPULAR
              </div>
              <div className="plan-header">
                <Tag color="blue">PROFESSIONAL</Tag>
                <Title level={3}>Professional</Title>
                <div className="plan-price">
                  <span className="price-amount">$79</span>
                  <span className="price-period">/user/month</span>
                </div>
                <Text type="secondary">For solo practitioners</Text>
              </div>

              <Divider />

              <ul className="plan-features">
                <li><CheckOutlined /> Storage: 10 GB per user</li>
                <li><CheckOutlined /> AI messages: 500/month</li>
                <li><CheckOutlined /> Workspaces: 3</li>
                <li><CheckOutlined /> Database connections</li>
                <li><CheckOutlined /> File size: 1 GB</li>
                <li><CheckOutlined /> Email support</li>
              </ul>

              <Button
                type="primary"
                block
                size="large"
                style={{ marginTop: 16 }}
                onClick={() => handleUpgrade("Professional")}
                disabled={isCurrentPlan("Professional")}
              >
                {isCurrentPlan("Professional") ? "Current Plan" : "Start Professional"}
              </Button>

              <Text
                type="secondary"
                style={{ display: "block", textAlign: "center", marginTop: 8, fontSize: 12 }}
              >
                For consultants & independent analysts
              </Text>
            </Card>
          </Col>

          <Col xs={24} sm={12} lg={6}>
            <Card className="pricing-card">
              <div className="plan-header">
                <Tag color="purple">TEAM</Tag>
                <Title level={3}>Team</Title>
                <div className="plan-price">
                  <span className="price-amount">$149</span>
                  <span className="price-period">/user/month</span>
                </div>
                <Text type="secondary">Min 3 users • Save with annual</Text>
              </div>

              <Divider />

              <ul className="plan-features">
                <li><CheckOutlined /> Storage: 100 GB shared</li>
                <li><CheckOutlined /> AI messages: Unlimited</li>
                <li><CheckOutlined /> Unlimited workspaces</li>
                <li><CheckOutlined /> Snowflake, BigQuery</li>
                <li><CheckOutlined /> File size: 5 GB</li>
                <li><CheckOutlined /> Priority support (4h)</li>
              </ul>

              <Button
                block
                size="large"
                style={{ marginTop: 16 }}
                disabled={isCurrentPlan("Team")}
              >
                {isCurrentPlan("Team") ? "Current Plan" : "Contact Sales"}
              </Button>
            </Card>
          </Col>

          <Col xs={24} sm={12} lg={6}>
            <Card className="pricing-card">
              <div className="plan-header">
                <Tag color="geekblue">BUSINESS</Tag>
                <Title level={3}>Business</Title>
                <div className="plan-price">
                  <span className="price-amount">$249</span>
                  <span className="price-period">/user/month</span>
                </div>
                <Text type="secondary">Enterprise-grade governance</Text>
              </div>

              <Divider />

              <ul className="plan-features">
                <li><CheckOutlined /> Storage: 1 TB shared</li>
                <li><CheckOutlined /> AI messages: Unlimited</li>
                <li><CheckOutlined /> SSO + Advanced RBAC</li>
                <li><CheckOutlined /> Full audit trail</li>
                <li><CheckOutlined /> File size: 10 GB</li>
                <li><CheckOutlined /> Success manager + 4h SLA</li>
              </ul>

              <Button
                block
                size="large"
                style={{ marginTop: 16 }}
                onClick={() => handleUpgrade("Business")}
                disabled={isCurrentPlan("Business")}
              >
                {isCurrentPlan("Business") ? "Current Plan" : "Upgrade to Business"}
              </Button>
            </Card>
          </Col>

          <Col xs={24} sm={12} lg={6}>
            <Card className="pricing-card">
              <div className="plan-header">
                <Tag color="gold">ENTERPRISE</Tag>
                <Title level={3}>Enterprise</Title>
                <div className="plan-price">
                  <span className="price-amount">Custom</span>
                </div>
                <Text type="secondary">For Big 4 & regulated</Text>
              </div>

              <Divider />

              <ul className="plan-features">
                <li><CheckOutlined /> Storage: Unlimited</li>
                <li><CheckOutlined /> AI messages: Custom limits</li>
                <li><CheckOutlined /> On-premise option</li>
                <li><CheckOutlined /> White-label</li>
                <li><CheckOutlined /> Custom integrations</li>
                <li><CheckOutlined /> 24/7 dedicated support</li>
              </ul>

              <Button
                block
                size="large"
                style={{ marginTop: 16 }}
                disabled={isCurrentPlan("Enterprise")}
              >
                {isCurrentPlan("Enterprise") ? "Current Plan" : "Contact Sales"}
              </Button>
            </Card>
          </Col>
        </Row>

        <div className="pricing-comparison">
          <Title level={4}>How We Compare</Title>
          <Row gutter={[16, 16]} justify="center">
            <Col>
              <Card size="small" className="comparison-card">
                <Statistic title="Alteryx Designer" value="$433" suffix="/mo" valueStyle={{ color: "#ff4d4f" }} />
                <Text type="secondary">Desktop-only ETL</Text>
              </Card>
            </Col>
            <Col>
              <Card size="small" className="comparison-card">
                <Statistic title="Tableau Creator" value="$75" suffix="/mo" valueStyle={{ color: "#ff4d4f" }} />
                <Text type="secondary">Viz only, no AI</Text>
              </Card>
            </Col>
            <Col>
              <Card size="small" className="comparison-card">
                <Statistic title="Thoughtspot Team" value="$95" suffix="/mo" valueStyle={{ color: "#ff4d4f" }} />
                <Text type="secondary">5 user minimum</Text>
              </Card>
            </Col>
            <Col>
              <Card size="small" className="comparison-card comparison-card-highlight">
                <Statistic
                  title="DataHub Professional"
                  value="$79"
                  suffix="/mo"
                  valueStyle={{ color: "#52c41a", fontWeight: "bold" }}
                />
                <Text strong style={{ color: "#52c41a" }}>AI + ETL + ML + Viz</Text>
              </Card>
            </Col>
          </Row>
        </div>
      </section>

      <section className="reviews-section">
        <div className="section-header">
          <Title level={2}>Trusted by Data Teams</Title>
          <Paragraph type="secondary">
            See what our customers are saying
          </Paragraph>
        </div>

        <Row gutter={[24, 24]}>
          <Col xs={24} md={8}>
            <Card className="review-card">
              <Rate disabled defaultValue={5} style={{ color: "#faad14" }} />
              <Paragraph className="review-text">
                "DataHub reduced our data cleaning time by 80%. The AI assistant is
                incredibly helpful for complex transformations. We cancelled our Alteryx
                subscription and saved $5,000/year."
              </Paragraph>
              <Space>
                <Avatar style={{ backgroundColor: "#2563eb" }}>JD</Avatar>
                <div>
                  <Text strong>Jane Doe</Text>
                  <br />
                  <Text type="secondary">Data Engineer, TechCorp</Text>
                </div>
              </Space>
            </Card>
          </Col>

          <Col xs={24} md={8}>
            <Card className="review-card">
              <Rate disabled defaultValue={5} style={{ color: "#faad14" }} />
              <Paragraph className="review-text">
                "As a small business, we could not afford Tableau. DataHub gives us
                enterprise-level analytics at a price we can actually afford. The $79/month
                plan has everything we need."
              </Paragraph>
              <Space>
                <Avatar style={{ backgroundColor: "#7c3aed" }}>MS</Avatar>
                <div>
                  <Text strong>Michael Smith</Text>
                  <br />
                  <Text type="secondary">Founder, StartupCo</Text>
                </div>
              </Space>
            </Card>
          </Col>

          <Col xs={24} md={8}>
            <Card className="review-card">
              <Rate disabled defaultValue={5} style={{ color: "#faad14" }} />
              <Paragraph className="review-text">
                "The pipeline marketplace is a game-changer. We found pre-built pipelines
                for our use case and were up and running in minutes instead of weeks.
                Amazing value."
              </Paragraph>
              <Space>
                <Avatar style={{ backgroundColor: "#059669" }}>SK</Avatar>
                <div>
                  <Text strong>Sarah Kim</Text>
                  <br />
                  <Text type="secondary">Data Analyst, RetailCo</Text>
                </div>
              </Space>
            </Card>
          </Col>
        </Row>
      </section>

      <section className="contact-section">
        <div className="section-header">
          <Title level={2}>Get in Touch</Title>
          <Paragraph type="secondary">
            Have questions? We are here to help.
          </Paragraph>
        </div>

        <Row gutter={[48, 24]}>
          <Col xs={24} md={12}>
            <Space direction="vertical" size="large" style={{ width: "100%" }}>
              <Card className="contact-info-card">
                <Space>
                  <MailOutlined style={{ fontSize: 32, color: "#2563eb" }} />
                  <div>
                    <Title level={5} style={{ margin: 0 }}>Email</Title>
                    <Text>support@datahub.com</Text>
                  </div>
                </Space>
              </Card>

              <Card className="contact-info-card">
                <Space>
                  <PhoneOutlined style={{ fontSize: 32, color: "#2563eb" }} />
                  <div>
                    <Title level={5} style={{ margin: 0 }}>Phone</Title>
                    <Text>+1 (555) 123-4567</Text>
                  </div>
                </Space>
              </Card>

              <Card className="contact-info-card">
                <Space>
                  <TeamOutlined style={{ fontSize: 32, color: "#2563eb" }} />
                  <div>
                    <Title level={5} style={{ margin: 0 }}>Sales</Title>
                    <Text>Schedule a demo with our team</Text>
                  </div>
                </Space>
              </Card>
            </Space>
          </Col>

          <Col xs={24} md={12}>
            <Card className="contact-form-card">
              <Form layout="vertical">
                <Form.Item label="Name" required>
                  <Input placeholder="Your name" size="large" />
                </Form.Item>
                <Form.Item label="Email" required>
                  <Input type="email" placeholder="your@email.com" size="large" />
                </Form.Item>
                <Form.Item label="Company">
                  <Input placeholder="Your company" size="large" />
                </Form.Item>
                <Form.Item label="Message" required>
                  <TextArea rows={4} placeholder="How can we help?" />
                </Form.Item>
                <Button type="primary" block size="large">
                  Send Message
                </Button>
              </Form>
            </Card>
          </Col>
        </Row>
      </section>
    </div>
  );
};
