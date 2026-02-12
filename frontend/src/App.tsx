import {
  Layout,
  Typography,
  Space,
  Card,
  Button,
  Tabs,
  Input,
  Tag,
  Avatar,
  Select,
  Modal,
  Steps,
  Divider,
} from "antd";
import {
  HomeOutlined,
  AppstoreOutlined,
  ShoppingOutlined,
  SettingOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  DatabaseOutlined,
  SwapOutlined,
  ExperimentOutlined,
  BranchesOutlined,
  CheckCircleOutlined,
  BulbOutlined,
  EyeOutlined,
  ThunderboltOutlined,
  PlusOutlined,
  SendOutlined,
  EditOutlined,
  DeleteOutlined,
  SaveOutlined,
  ClockCircleOutlined,
  PlayCircleOutlined,
  UserOutlined,
  RobotOutlined,
} from "@ant-design/icons";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AgentSuggestion, DatasetMeta, InsightSummary, PipelineSchedule, TransformationStep } from "./types";
import {
  applyRecipe,
  chatWithAgent,
  createPipeline,
  fetchAgentSuggestions,
  fetchInsights,
  fetchRecipe,
  listDatasets,
  listPipelines,
  runPipeline,
  saveRecipe,
  exchangeOidcCode,
} from "./api";
import { clearAuthToken, setAuthToken } from "./utils/auth";
import { notify } from "./utils/notify";
import { supabase } from "./utils/supabaseClient";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { DataImportPanel } from "./components/DataImportPanel";
import { DataTransformationPanel } from "./components/DataTransformationPanel";
import { DataCleaningPanel } from "./components/DataCleaningPanel";
import { TransformationsPanel } from "./components/TransformationsPanel";
import { ProfilePanel } from "./components/ProfilePanel";
import { DatasetPreviewPanel } from "./components/DatasetPreviewPanel";
import { InsightsPanel } from "./components/InsightsPanel";
import { CorrelationPanel } from "./components/CorrelationPanel";
import { SharedDashboardPanel } from "./components/SharedDashboardPanel";
import { SharedWorkspacePanel } from "./components/SharedWorkspacePanel";

const { Sider, Content } = Layout;
const { Title, Text } = Typography;

type ChatEntry = {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
};

const PIPELINE_STEP_OPTIONS = [
  "drop_missing",
  "fill_missing",
  "rename_columns",
  "cast_type",
  "filter_rows",
  "pivot",
  "join",
  "add_column_formula",
  "drop_duplicates",
];

const PROMPT_SUGGESTIONS: Record<string, string[]> = {
  import: [
    "Import a CSV file",
    "Connect to PostgreSQL",
    "Schedule daily import",
    "Check schema after upload",
  ],
  transform: [
    "Join sales and customer data",
    "Filter rows where revenue > 1000",
    "Create a calculated column",
    "Pivot by category and month",
  ],
  ml: [
    "Detect anomalies in my data",
    "Find customer segments",
    "Recommend a model",
    "Generate features",
  ],
  feature: [
    "Create a churn score",
    "Normalize key metrics",
    "Aggregate by cohort",
    "Encode categorical fields",
  ],
  quality: [
    "Check missing values",
    "Highlight outliers",
    "Generate data quality report",
    "Detect duplicate rows",
  ],
};

export function App() {
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [shareWorkspaceToken, setShareWorkspaceToken] = useState<string | null>(null);
  const isSharedView = !!(shareToken || shareWorkspaceToken);
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false);
  const [activeMainTab, setActiveMainTab] = useState("home");
  const [activeDataTab, setActiveDataTab] = useState("import");
  const [activeInsightTab, setActiveInsightTab] = useState("suggestions");
  const [datasets, setDatasets] = useState<DatasetMeta[]>([]);
  const [datasetId, setDatasetId] = useState<string | null>(null);
  const [datasetColumns, setDatasetColumns] = useState<string[]>([]);
  const [insights, setInsights] = useState<InsightSummary | null>(null);
  const [suggestion, setSuggestion] = useState<AgentSuggestion | null>(null);
  const [pipelines, setPipelines] = useState<PipelineSchedule[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null);
  const [selectedPipelineMeta, setSelectedPipelineMeta] = useState<PipelineSchedule | null>(null);
  const [selectedPipelineSteps, setSelectedPipelineSteps] = useState<TransformationStep[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatEntry[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [aiTyping, setAiTyping] = useState(false);
  const [pipelineName, setPipelineName] = useState("Untitled Pipeline");
  const [pipelineStatus, setPipelineStatus] = useState<"draft" | "running" | "completed">("draft");
  const [pipelineSteps, setPipelineSteps] = useState<TransformationStep[]>([]);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [stepModalOpen, setStepModalOpen] = useState(false);
  const [editingStepIndex, setEditingStepIndex] = useState<number | null>(null);
  const [stepType, setStepType] = useState<string | undefined>(undefined);
  const [stepParams, setStepParams] = useState("{}");
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleCadence, setScheduleCadence] = useState<"daily" | "weekly" | "monthly">("daily");
  const [scheduleTime, setScheduleTime] = useState("09:00");
  const [scheduleDayOfWeek, setScheduleDayOfWeek] = useState(0);
  const [scheduleDayOfMonth, setScheduleDayOfMonth] = useState(1);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1200);
  const [dataPanelOpen, setDataPanelOpen] = useState(false);
  const [pipelineOpen, setPipelineOpen] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

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
      } else {
        clearAuthToken();
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      const accessToken = session?.access_token;
      if (accessToken) {
        setAuthToken(accessToken);
      } else {
        clearAuthToken();
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

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1200);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    listDatasets()
      .then((data) => {
        setDatasets(data);
        if (!datasetId && data.length) {
          setDatasetId(data[0].dataset_id);
        }
      })
      .catch((err: any) => {
        const detail = err?.response?.data?.detail || "Failed to load datasets.";
        notify.error(detail);
      });
  }, []);

  const refreshPipelines = async () => {
    try {
      const data = await listPipelines();
      setPipelines(data);
      if (!selectedPipelineId && data.length) {
        setSelectedPipelineId(data[0].pipeline_id);
      }
    } catch (err: any) {
      const detail = err?.response?.data?.detail || "Failed to load pipelines.";
      notify.error(detail);
    }
  };

  useEffect(() => {
    refreshPipelines();
  }, []);

  useEffect(() => {
    if (!selectedPipelineId) {
      setSelectedPipelineMeta(null);
      setSelectedPipelineSteps([]);
      return;
    }
    const pipeline = pipelines.find((item) => item.pipeline_id === selectedPipelineId) || null;
    setSelectedPipelineMeta(pipeline);
    if (!pipeline?.dataset_id) {
      setSelectedPipelineSteps([]);
      return;
    }
    fetchRecipe(pipeline.dataset_id)
      .then((recipe) => setSelectedPipelineSteps(recipe.steps || []))
      .catch((err: any) => {
        const detail = err?.response?.data?.detail;
        if (detail && detail.toLowerCase().includes("not found")) {
          setSelectedPipelineSteps([]);
        } else if (detail) {
          notify.error(detail);
        }
      });
  }, [selectedPipelineId, pipelines]);

  useEffect(() => {
    if (!datasetId) {
      setInsights(null);
      setSuggestion(null);
      setPipelineSteps([]);
      return;
    }
    fetchInsights(datasetId)
      .then(setInsights)
      .catch((err: any) => {
        const detail = err?.response?.data?.detail || "Failed to load insights.";
        notify.error(detail);
      });
    fetchAgentSuggestions(datasetId)
      .then(setSuggestion)
      .catch((err: any) => {
        const detail = err?.response?.data?.detail || "Failed to load suggestions.";
        notify.error(detail);
      });
    fetchRecipe(datasetId)
      .then((recipe) => setPipelineSteps(recipe.steps || []))
      .catch((err: any) => {
        const detail = err?.response?.data?.detail;
        if (detail && detail.toLowerCase().includes("not found")) {
          setPipelineSteps([]);
        } else if (detail) {
          notify.error(detail);
        }
      });
  }, [datasetId]);

  useEffect(() => {
    const prompts = PROMPT_SUGGESTIONS[activeDataTab] || [];
    if (!datasetId) {
      setChatMessages([
        {
          role: "assistant",
          content: "Select a dataset to begin the AI conversation.",
          timestamp: new Date(),
        },
      ]);
      return;
    }
    setChatMessages([
      {
        role: "assistant",
        content: `Ready to help with ${datasetId}. Pick a prompt or ask a question.`,
        timestamp: new Date(),
      },
      ...(prompts.length
        ? [
            {
              role: "assistant",
              content: "Try one of the suggested prompts below.",
              timestamp: new Date(),
            },
          ]
        : []),
    ]);
  }, [datasetId, activeDataTab]);

  useEffect(() => {
    const node = chatScrollRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [chatMessages, aiTyping]);

  const handleSendMessage = async () => {
    const trimmed = inputMessage.trim();
    if (!trimmed) return;
    if (!datasetId) {
      notify.info("Select a dataset to start chatting.");
      return;
    }
    const userMessage: ChatEntry = {
      role: "user",
      content: trimmed,
      timestamp: new Date(),
    };
    const history = [...chatMessages, userMessage].map((item) => ({
      role: item.role,
      content: item.content,
    }));
    setChatMessages((prev) => [...prev, userMessage]);
    setInputMessage("");
    setAiTyping(true);
    try {
      const response = await chatWithAgent(datasetId, trimmed, history);
      setChatMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: response.reply,
          timestamp: new Date(),
        },
      ]);
      if (response?.notes?.length) {
        notify.info(response.notes.join(" "));
      }
    } catch (err: any) {
      const detail = err?.response?.data?.detail || "Failed to get assistant response.";
      notify.error(detail);
    } finally {
      setAiTyping(false);
    }
  };

  const handleApplySuggestionStep = async (step: TransformationStep) => {
    if (!datasetId) {
      notify.info("Select a dataset to apply suggestions.");
      return;
    }
    const nextSteps = [...pipelineSteps, step];
    setPipelineSteps(nextSteps);
    try {
      await saveRecipe(datasetId, nextSteps);
      setLastSavedAt(new Date());
      notify.success("Added suggestion to pipeline.");
    } catch (err: any) {
      const detail = err?.response?.data?.detail || "Failed to save suggestion.";
      notify.error(detail);
    }
  };

  const openStepEditor = (index: number | null) => {
    if (index === null) {
      setStepType(undefined);
      setStepParams("{}");
      setEditingStepIndex(null);
      setStepModalOpen(true);
      return;
    }
    const step = pipelineSteps[index];
    setStepType(step.name);
    setStepParams(JSON.stringify(step.params || {}, null, 2));
    setEditingStepIndex(index);
    setStepModalOpen(true);
  };

  const handleSaveStep = () => {
    if (!stepType) {
      notify.info("Choose a step type.");
      return;
    }
    let params: Record<string, unknown> = {};
    try {
      params = stepParams ? JSON.parse(stepParams) : {};
    } catch (err: any) {
      notify.error("Step params must be valid JSON.");
      return;
    }
    const nextSteps = [...pipelineSteps];
    const nextStep = { name: stepType, params };
    if (editingStepIndex !== null) {
      nextSteps[editingStepIndex] = nextStep;
    } else {
      nextSteps.push(nextStep);
    }
    setPipelineSteps(nextSteps);
    setStepModalOpen(false);
  };

  const handleDeleteStep = (index: number) => {
    setPipelineSteps((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSavePipeline = async () => {
    if (!datasetId) {
      notify.info("Select a dataset to save a pipeline.");
      return;
    }
    try {
      await saveRecipe(datasetId, pipelineSteps);
      setLastSavedAt(new Date());
      notify.success("Pipeline saved.");
    } catch (err: any) {
      const detail = err?.response?.data?.detail || "Failed to save pipeline.";
      notify.error(detail);
    }
  };

  const handleExecutePipeline = async () => {
    if (!datasetId) {
      notify.info("Select a dataset to execute a pipeline.");
      return;
    }
    setPipelineStatus("running");
    try {
      await applyRecipe(datasetId);
      setPipelineStatus("completed");
      notify.success("Pipeline executed.");
    } catch (err: any) {
      const detail = err?.response?.data?.detail || "Failed to execute pipeline.";
      notify.error(detail);
      setPipelineStatus("draft");
    }
  };

  const handleRunExistingPipeline = async () => {
    if (!selectedPipelineId) {
      notify.info("Select a pipeline to run.");
      return;
    }
    setPipelineStatus("running");
    try {
      await runPipeline(selectedPipelineId);
      setPipelineStatus("completed");
      notify.success("Pipeline run triggered.");
    } catch (err: any) {
      const detail = err?.response?.data?.detail || "Failed to run pipeline.";
      notify.error(detail);
      setPipelineStatus("draft");
    }
  };

  const handleSchedulePipeline = async () => {
    if (!datasetId) {
      notify.info("Select a dataset to schedule a pipeline.");
      return;
    }
    setScheduleSaving(true);
    try {
      await createPipeline({
        name: pipelineName.trim() || "Pipeline",
        cadence: scheduleCadence,
        time_of_day: scheduleTime,
        day_of_week: scheduleCadence === "weekly" ? scheduleDayOfWeek : undefined,
        day_of_month: scheduleCadence === "monthly" ? scheduleDayOfMonth : undefined,
        dataset_id: datasetId,
        apply_recipe: true,
        run_profile: true,
        run_insights: true,
        enabled: true,
      });
      notify.success("Pipeline schedule created.");
      refreshPipelines();
      setScheduleOpen(false);
    } catch (err: any) {
      const detail = err?.response?.data?.detail || "Failed to schedule pipeline.";
      notify.error(detail);
    } finally {
      setScheduleSaving(false);
    }
  };

  const datasetOptions = useMemo(
    () => datasets.map((item) => ({ label: item.dataset_id, value: item.dataset_id })),
    [datasets]
  );

  const pipelineOptions = useMemo(
    () =>
      pipelines.map((item) => ({
        label: item.dataset_id ? `${item.name} · ${item.dataset_id}` : item.name,
        value: item.pipeline_id,
      })),
    [pipelines]
  );

  const selectedDataset = useMemo(
    () => datasets.find((item) => item.dataset_id === datasetId) || null,
    [datasets, datasetId]
  );

  const suggestionCards = suggestion?.recommended_steps ?? [];
  const promptChips = PROMPT_SUGGESTIONS[activeDataTab] || [];

  const sharedTabContent = (
    <div className="shared-view">
      {shareToken && (
        <>
          <Title level={3}>Shared Dashboard</Title>
          <SharedDashboardPanel shareToken={shareToken} />
        </>
      )}
      {shareWorkspaceToken && (
        <>
          <Title level={3}>Shared Workspace</Title>
          <SharedWorkspacePanel shareToken={shareWorkspaceToken} />
        </>
      )}
      <Text type="secondary">You are viewing a shared resource.</Text>
    </div>
  );

  return (
    <Layout className="ai-analytics-layout">
      <div className="ai-topbar">
        <div className="topbar-left">
          <div className="topbar-brand">
            <DatabaseOutlined className="brand-icon" />
            <span>DataHub</span>
          </div>
          <div className="topbar-nav">
            <Button
              type="text"
              className={`topbar-item ${activeMainTab === "home" ? "active" : ""}`}
              icon={<HomeOutlined />}
              onClick={() => setActiveMainTab("home")}
            >
              Home
            </Button>
            <Button
              type="text"
              className={`topbar-item ${activeMainTab === "workspace" ? "active" : ""}`}
              icon={<AppstoreOutlined />}
              onClick={() => setActiveMainTab("workspace")}
            >
              Workspaces
            </Button>
            <Button
              type="text"
              className={`topbar-item ${activeMainTab === "marketplace" ? "active" : ""}`}
              icon={<ShoppingOutlined />}
              onClick={() => setActiveMainTab("marketplace")}
            >
              Marketplace
            </Button>
          </div>
        </div>
        <div className="topbar-actions">
          <Button onClick={() => setDataPanelOpen((prev) => !prev)}>Data Ops</Button>
          <Button onClick={() => setPipelineOpen((prev) => !prev)}>Pipeline</Button>
        </div>
      </div>

      <div className="ai-body">
        <Sider
          width={leftSidebarCollapsed ? 60 : 280}
          collapsedWidth={60}
          collapsible={false}
          className={`data-sidebar ${dataPanelOpen ? "open" : ""} ${leftSidebarCollapsed ? "collapsed" : ""}`}
          theme="light"
        >
          <div className="main-sidebar-inner">
            <Tabs
              tabPosition="left"
              activeKey={activeDataTab}
              onChange={(key) => setActiveDataTab(key)}
              className="data-operations-tabs"
              items={[
                {
                  key: "import",
                  label: (
                    <span className="data-tab-label">
                      <DatabaseOutlined />
                      Data Import
                    </span>
                  ),
                  children: <DataImportPanel />,
                },
                {
                  key: "transform",
                  label: (
                    <span className="data-tab-label">
                      <SwapOutlined />
                      Transform
                    </span>
                  ),
                  children: <DataTransformationPanel />,
                },
                {
                  key: "ml",
                  label: (
                    <span className="data-tab-label">
                      <ExperimentOutlined />
                      ML/Cleaning
                    </span>
                  ),
                  children: <DataCleaningPanel />,
                },
                {
                  key: "feature",
                  label: (
                    <span className="data-tab-label">
                      <BranchesOutlined />
                      Feature Eng
                    </span>
                  ),
                  children: <TransformationsPanel datasetId={datasetId} />,
                },
                {
                  key: "quality",
                  label: (
                    <span className="data-tab-label">
                      <CheckCircleOutlined />
                      Data Quality
                    </span>
                  ),
                  children: <ProfilePanel datasetId={datasetId} />,
                },
              ]}
            />
            <div className="main-sidebar-footer">
              <Button
                type="text"
                className={`main-nav-item ${activeMainTab === "settings" ? "active" : ""}`}
                icon={<SettingOutlined />}
                onClick={() => setActiveMainTab("settings")}
              >
                {!leftSidebarCollapsed && "Settings"}
              </Button>
              <Button
                type="text"
                className="main-nav-item"
                icon={leftSidebarCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                onClick={() => setLeftSidebarCollapsed((prev) => !prev)}
              >
                {!leftSidebarCollapsed && "Collapse"}
              </Button>
            </div>
          </div>
        </Sider>

        <Content className="center-workspace">
            {isSharedView ? (
              sharedTabContent
            ) : (
              <>
                <div className="ai-chat-container">
                  <div className="chat-header">
                    <div>
                      <Title level={4} style={{ marginBottom: 0 }}>
                        AI Data Analyst
                      </Title>
                      <Text type="secondary">
                        {selectedDataset
                          ? `Working on ${selectedDataset.dataset_id}`
                          : "Select a dataset to start"}
                      </Text>
                    </div>
                    <Space align="center">
                      <Select
                        placeholder="Select dataset"
                        value={datasetId ?? undefined}
                        onChange={(value) => setDatasetId(value)}
                        options={datasetOptions}
                        style={{ minWidth: 200 }}
                        allowClear
                      />
                      <Tag color={aiTyping ? "blue" : "green"}>{aiTyping ? "Thinking" : "Online"}</Tag>
                    </Space>
                  </div>

                  <div className="chat-messages" ref={chatScrollRef}>
                    {chatMessages.map((message, index) => (
                      <div key={`${message.role}-${index}`} className={`chat-message ${message.role}`}>
                        <Avatar className="message-avatar" icon={message.role === "user" ? <UserOutlined /> : <RobotOutlined />} />
                        <div className="message-body">
                          <div className="message-content">{message.content}</div>
                          <Text className="message-time" type="secondary">
                            {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </Text>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="chat-input-area">
                    <div className="suggested-prompts">
                      {promptChips.map((prompt) => (
                        <button
                          key={prompt}
                          className="suggested-prompt-chip"
                          onClick={() => setInputMessage(prompt)}
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                    {aiTyping && <Text className="chat-typing">AI is typing...</Text>}
                    <div className="chat-input-row">
                      <Input.TextArea
                        value={inputMessage}
                        onChange={(event) => setInputMessage(event.target.value)}
                        autoSize={{ minRows: 1, maxRows: 4 }}
                        placeholder="Ask AI to help with your data..."
                        onPressEnter={(event) => {
                          if (!event.shiftKey) {
                            event.preventDefault();
                            handleSendMessage();
                          }
                        }}
                      />
                      <Button type="primary" icon={<SendOutlined />} onClick={handleSendMessage}>
                        Send
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="insights-preview-container">
                  <Tabs
                    activeKey={activeInsightTab}
                    onChange={(key) => setActiveInsightTab(key)}
                    items={[
                      {
                        key: "suggestions",
                        label: (
                          <span className="insight-tab-label">
                            <BulbOutlined /> AI Suggestions
                          </span>
                        ),
                        children: (
                          <div>
                            {suggestion?.notes?.length ? (
                              <Card className="ai-suggestion-notes">
                                <Text strong>Summary</Text>
                                <Divider style={{ margin: "8px 0" }} />
                                <Space direction="vertical">
                                  {suggestion.notes.map((note) => (
                                    <Text key={note} type="secondary">
                                      {note}
                                    </Text>
                                  ))}
                                </Space>
                              </Card>
                            ) : null}
                            <div className="ai-suggestions-grid">
                              {suggestionCards.length ? (
                                suggestionCards.map((step, index) => (
                                  <Card key={`${step.name}-${index}`} className="ai-suggestion-card">
                                    <div className="suggestion-header">
                                      <div>
                                        <Text strong>{step.name}</Text>
                                        <Text type="secondary" className="suggestion-description">
                                          {JSON.stringify(step.params || {})}
                                        </Text>
                                      </div>
                                      <span className="confidence-badge">
                                        {Math.max(70, 95 - index * 5)}% confidence
                                      </span>
                                    </div>
                                    <Button onClick={() => handleApplySuggestionStep(step)}>
                                      Apply
                                    </Button>
                                  </Card>
                                ))
                              ) : (
                                <Text type="secondary">No AI suggestions yet.</Text>
                              )}
                            </div>
                          </div>
                        ),
                      },
                      {
                        key: "preview",
                        label: (
                          <span className="insight-tab-label">
                            <EyeOutlined /> Data Preview
                          </span>
                        ),
                        children: (
                          <div className="data-preview-tab">
                            <div className="data-preview-stats">
                              <Tag color="blue">Rows: {selectedDataset?.row_count ?? "-"}</Tag>
                              <Tag color="cyan">Columns: {datasetColumns.length || "-"}</Tag>
                            </div>
                            <DatasetPreviewPanel datasetId={datasetId} onColumns={setDatasetColumns} />
                          </div>
                        ),
                      },
                      {
                        key: "insights",
                        label: (
                          <span className="insight-tab-label">
                            <ThunderboltOutlined /> Insights
                          </span>
                        ),
                        children: (
                          <div className="insights-grid">
                            <InsightsPanel insights={insights} />
                            <CorrelationPanel datasetId={datasetId} />
                          </div>
                        ),
                      },
                    ]}
                  />
                </div>
              </>
            )}
          </Content>

          <aside className={`pipeline-sidebar ${pipelineOpen ? "open" : ""}`}>
            <div className="pipeline-header">
              <Input
                className="pipeline-name-input"
                value={pipelineName}
                onChange={(event) => setPipelineName(event.target.value)}
                placeholder="Pipeline name"
              />
              <div className="pipeline-status-row">
                <Tag color={pipelineStatus === "completed" ? "green" : pipelineStatus === "running" ? "blue" : "default"}>
                  {pipelineStatus}
                </Tag>
                <Text type="secondary">
                  {lastSavedAt ? `Saved ${lastSavedAt.toLocaleTimeString()}` : "Not saved"}
                </Text>
              </div>
              <div className="pipeline-select-row">
                <Select
                  placeholder="Run existing pipeline"
                  value={selectedPipelineId ?? undefined}
                  onChange={(value) => setSelectedPipelineId(value)}
                  options={pipelineOptions}
                  style={{ width: "100%" }}
                  allowClear
                />
                <Button icon={<PlayCircleOutlined />} onClick={handleRunExistingPipeline}>
                  Run Selected
                </Button>
              </div>
              {selectedPipelineMeta && (
                <div className="selected-pipeline-info">
                  <Text strong>Selected pipeline</Text>
                  <div className="selected-pipeline-meta">
                    <Text type="secondary">Dataset: {selectedPipelineMeta.dataset_id || "-"}</Text>
                    <Text type="secondary">Cadence: {selectedPipelineMeta.cadence}</Text>
                    <Text type="secondary">Enabled: {selectedPipelineMeta.enabled ? "Yes" : "No"}</Text>
                  </div>
                  {selectedPipelineSteps.length ? (
                    <div className="selected-pipeline-steps">
                      {selectedPipelineSteps.map((step, index) => (
                        <div key={`${step.name}-${index}`} className="selected-pipeline-step">
                          <Text>{index + 1}. {step.name}</Text>
                          <Text type="secondary">{JSON.stringify(step.params || {})}</Text>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <Text type="secondary">No steps found for this pipeline.</Text>
                  )}
                </div>
              )}
            </div>

            <div className="pipeline-steps-container">
              {pipelineSteps.length ? (
                <Steps
                  direction="vertical"
                  current={Math.max(pipelineSteps.length - 1, 0)}
                  items={pipelineSteps.map((step, index) => ({
                    title: step.name,
                    description: (
                      <div className="pipeline-step">
                        <Text type="secondary">{JSON.stringify(step.params || {})}</Text>
                        <div className="step-actions">
                          <Button
                            size="small"
                            icon={<EditOutlined />}
                            onClick={() => openStepEditor(index)}
                          />
                          <Button
                            size="small"
                            icon={<DeleteOutlined />}
                            onClick={() => handleDeleteStep(index)}
                          />
                        </div>
                      </div>
                    ),
                    status: pipelineStatus === "running" && index === pipelineSteps.length - 1 ? "process" : "wait",
                  }))}
                />
              ) : (
                <Text type="secondary">Add steps to build your pipeline.</Text>
              )}
              <Button className="add-step-button" icon={<PlusOutlined />} onClick={() => openStepEditor(null)}>
                Add Step
              </Button>
            </div>

            <div className="pipeline-actions">
              <Button icon={<SaveOutlined />} block onClick={handleSavePipeline}>
                Save Pipeline
              </Button>
              <Button icon={<ClockCircleOutlined />} block onClick={() => setScheduleOpen(true)}>
                Schedule
              </Button>
              <Button type="primary" icon={<PlayCircleOutlined />} block onClick={handleExecutePipeline}>
                Execute Now
              </Button>
            </div>
          </aside>
        </div>
      </div>

      <Modal
        title={editingStepIndex !== null ? "Edit Step" : "Add Step"}
        open={stepModalOpen}
        onCancel={() => setStepModalOpen(false)}
        onOk={handleSaveStep}
        okText="Save"
      >
        <Space direction="vertical" style={{ width: "100%" }}>
          <Select
            placeholder="Step type"
            value={stepType}
            onChange={(value) => setStepType(value)}
            options={PIPELINE_STEP_OPTIONS.map((item) => ({ label: item, value: item }))}
          />
          <Input.TextArea
            value={stepParams}
            onChange={(event) => setStepParams(event.target.value)}
            autoSize={{ minRows: 3, maxRows: 6 }}
            placeholder='{"columns": ["col"], "value": 0}'
          />
        </Space>
      </Modal>

      <Modal
        title="Schedule Pipeline"
        open={scheduleOpen}
        onCancel={() => setScheduleOpen(false)}
        onOk={handleSchedulePipeline}
        confirmLoading={scheduleSaving}
      >
        <Space direction="vertical" style={{ width: "100%" }}>
          <Select
            value={scheduleCadence}
            onChange={(value) => setScheduleCadence(value)}
            options={[
              { label: "Daily", value: "daily" },
              { label: "Weekly", value: "weekly" },
              { label: "Monthly", value: "monthly" },
            ]}
          />
          <Input
            value={scheduleTime}
            onChange={(event) => setScheduleTime(event.target.value)}
            placeholder="Time (HH:MM)"
          />
          {scheduleCadence === "weekly" && (
            <Select
              value={scheduleDayOfWeek}
              onChange={(value) => setScheduleDayOfWeek(value)}
              options={[
                { label: "Mon", value: 0 },
                { label: "Tue", value: 1 },
                { label: "Wed", value: 2 },
                { label: "Thu", value: 3 },
                { label: "Fri", value: 4 },
                { label: "Sat", value: 5 },
                { label: "Sun", value: 6 },
              ]}
            />
          )}
          {scheduleCadence === "monthly" && (
            <Input
              value={scheduleDayOfMonth}
              onChange={(event) => setScheduleDayOfMonth(Number(event.target.value) || 1)}
              placeholder="Day of month (1-28)"
            />
          )}
        </Space>
      </Modal>
    </Layout>
  );
}
