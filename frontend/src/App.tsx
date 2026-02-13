import {
  Layout, Typography, Space, Card, Button, Tabs,
  Input, Badge, Avatar, Tag, Steps, Select, Table,
} from "antd";
import {
  HomeOutlined, AppstoreOutlined, ShoppingOutlined,
  DatabaseOutlined, SwapOutlined, ExperimentOutlined,
  BranchesOutlined, CheckCircleOutlined, RobotOutlined,
  SendOutlined, BulbOutlined, EyeOutlined, ThunderboltOutlined,
  SaveOutlined, PlayCircleOutlined, ClockCircleOutlined,
  PlusOutlined, EditOutlined, DeleteOutlined, UserOutlined,
  BellOutlined, SettingOutlined, MenuOutlined,
} from "@ant-design/icons";
import { useState } from "react";
import "./styles_new.css";

const { Header, Content, Sider } = Layout;
const { TextArea } = Input;
const { Title, Text } = Typography;

export function App() {
  const [activeMainTab, setActiveMainTab] = useState("home");
  const [activeDataTab, setActiveDataTab] = useState("import");
  const [chatMessages, setChatMessages] = useState([
    {
      role: "assistant",
      content: "Hello! I'm your AI Data Analyst. Select a dataset to start.",
      timestamp: "11:15 AM",
    },
  ]);
  const [inputMessage, setInputMessage] = useState("");
  const [activeInsightTab, setActiveInsightTab] = useState("suggestions");
  const [selectedTable, setSelectedTable] = useState("sales_data");
  const [pipelineName, setPipelineName] = useState("Untitled Pipeline");
  const [selectedPipeline, setSelectedPipeline] = useState(null);

  const handleSendMessage = () => {
    if (!inputMessage.trim()) return;
    setChatMessages([
      ...chatMessages,
      {
        role: "user",
        content: inputMessage,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ]);
    setInputMessage("");
  };

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
              <Button type="link" block style={{ textAlign: "left" }}>Import a CSV file</Button>
              <Button type="link" block style={{ textAlign: "left" }}>Connect to PostgreSQL</Button>
              <Button type="link" block style={{ textAlign: "left" }}>Schedule daily import</Button>
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
              onClick={() => setActiveMainTab("home")}
            >
              Home
            </Button>
            <Button type="text" icon={<AppstoreOutlined />} className="topbar-item">Workspaces</Button>
            <Button type="text" icon={<ShoppingOutlined />} className="topbar-item">Marketplace</Button>
            <Button type="text" className="topbar-item">Data Ops</Button>
            <Button type="text" className="topbar-item">Pipeline</Button>
          </nav>
        </div>
        <div className="topbar-actions">
          <Button type="text" icon={<BellOutlined />} />
          <Button type="text" icon={<SettingOutlined />} />
          <Avatar size="small" icon={<UserOutlined />} />
        </div>
      </Header>

      <Layout className="ai-body">
        <Sider width={280} className="data-sidebar">
          <Tabs
            tabPosition="left"
            activeKey={activeDataTab}
            onChange={setActiveDataTab}
            items={dataOperationsTabs}
            className="data-operations-tabs"
          />
        </Sider>

        <Content className="center-workspace">
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
    </Layout>
  );
}
