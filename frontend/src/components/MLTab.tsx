import React, { useState, useEffect, useRef } from "react";
import {
  Tabs,
  Card,
  Button,
  Select,
  Checkbox,
  Space,
  Progress,
  Row,
  Col,
  Input,
  Slider,
  Statistic,
  Tag,
  Table,
  message,
  Modal,
  Empty,
  Spin,
  Form,
  Radio,
  Switch,
  Divider,
  Typography,
  Drawer,
  List,
} from "antd";
import {
  SettingOutlined,
  PlayCircleOutlined,
  FileTextOutlined,
  BarChartOutlined,
  ExperimentOutlined,
  RobotOutlined,
  SendOutlined,
} from "@ant-design/icons";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, ScatterChart, Scatter } from "recharts";
import { AIChat, type AIAction, type DatasetSummary } from "./ai/AIChat";
import "./MLTab.css";

const { Text, Title } = Typography;

interface Experiment {
  id: string;
  name: string;
  experiment_type: string;
  status: "pending" | "training" | "completed" | "failed";
  progress: number;
  metrics: Record<string, any>;
  best_model?: string;
  feature_importance?: Record<string, number>;
  confusion_matrix?: number[][];
  created_at: string;
  training_duration_seconds?: number;
}

interface TaskTypeCard {
  key: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
}

const TASK_TYPES: TaskTypeCard[] = [
  {
    key: "classification",
    title: "Classification",
    description: "Predict categories or classes",
    icon: <FileTextOutlined />,
    color: "#1890ff",
  },
  {
    key: "regression",
    title: "Regression",
    description: "Predict numeric values",
    icon: <BarChartOutlined />,
    color: "#52c41a",
  },
  {
    key: "clustering",
    title: "Clustering",
    description: "Segment and group data",
    icon: <ExperimentOutlined />,
    color: "#faad14",
  },
  {
    key: "forecasting",
    title: "Forecasting",
    description: "Predict future trends",
    icon: <BarChartOutlined />,
    color: "#eb2f96",
  },
];

interface MLTabProps {
  currentDataset?: any;
  datasetColumns?: string[];
}

export function MLTab({ currentDataset = null, datasetColumns = [] }: MLTabProps = {}) {
  // ──────────────────────────────────────────
  // STATE
  // ──────────────────────────────────────────
  const [activeTab, setActiveTab] = useState("automl");
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [selectedExperiment, setSelectedExperiment] = useState<Experiment | null>(null);

  // AutoML chat state
  const [chatMessages, setChatMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([
    { role: "assistant", content: "Hi! I'm your ML Assistant. Describe what you want to predict and I'll help you build a model." },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [isLoadingChat, setIsLoadingChat] = useState(false);

  // Manual config state
  const [taskType, setTaskType] = useState<string | null>(null);
  const [targetColumn, setTargetColumn] = useState<string>("");
  const [featureColumns, setFeatureColumns] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [availableModels, setAvailableModels] = useState<any[]>([]);
  const [testSize, setTestSize] = useState(0.2);
  const [cvFolds, setCvFolds] = useState(5);
  const [useDL, setUseDL] = useState(false);
  const [dlEpochs, setDlEpochs] = useState(50);
  const [dateColumn, setDateColumn] = useState<string>("");
  const [forecastPeriods, setForecastPeriods] = useState(30);
  const [nClusters, setNClusters] = useState(3);
  const [experimentName, setExperimentName] = useState("");

  // Training state
  const [isTraining, setIsTraining] = useState(false);
  const [trainingProgress, setTrainingProgress] = useState(0);
  const [trainingMessage, setTrainingMessage] = useState("");
  const [trainingExperimentId, setTrainingExperimentId] = useState<string | null>(null);

  // Visualization state
  const [showPredictionForm, setShowPredictionForm] = useState(false);
  const [predictionInput, setPredictionInput] = useState<Record<string, any>>({});

  // Dataset summary for AI
  const datasetSummary: DatasetSummary = {
    total_rows: 10000, // placeholder
    total_columns: datasetColumns.length,
    columns: datasetColumns,
    data_quality_score: 85,
  };

  const chartColors = ["#1890ff", "#52c41a", "#faad14", "#f5222d", "#13c2c2"];

  // ──────────────────────────────────────────
  // HANDLERS
  // ──────────────────────────────────────────
  const handleAIAction = (action: AIAction) => {
    if (action.type === "apply_all") {
      message.success("ML configuration created by AI");
      return;
    }
    message.info(`Action: ${action.type}`);
  };

  const handleSendChatMessage = async () => {
    if (!chatInput.trim()) return;

    const userMessage = chatInput;
    setChatInput("");
    setChatMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setIsLoadingChat(true);

    try {
      // Call AutoML chat endpoint
      const response = await fetch("/api/ml/automl/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dataset_id: currentDataset?.id || "unknown",
          message: userMessage,
          conversation_history: chatMessages,
        }),
      });

      const result = await response.json();
      setChatMessages((prev) => [...prev, { role: "assistant", content: result.text || "I'll help you build an ML model." }]);

      // If action provided, apply it
      if (result.action === "configure_ml_experiment" && result.config) {
        setTaskType(result.config.experiment_type);
        setTargetColumn(result.config.target_column || "");
        setFeatureColumns(result.config.feature_columns || []);
        setSelectedModel(result.config.models_to_try?.[0] || "");
        setExperimentName(`${result.config.experiment_type}_experiment`);
        message.success("Configuration loaded. Ready to train!");
      }
    } catch (error) {
      setChatMessages((prev) => [...prev, { role: "assistant", content: "Sorry, I couldn't process that. Please try again." }]);
    } finally {
      setIsLoadingChat(false);
    }
  };

  const handleTaskTypeSelect = async (type: string) => {
    setTaskType(type);

    // Load available models
    try {
      const response = await fetch(`/api/ml/models/${type}`);
      const data = await response.json();
      setAvailableModels(data.models || []);
      if (data.models && data.models.length > 0) {
        setSelectedModel(data.models[0].name);
      }
    } catch (error) {
      message.error("Failed to load models");
    }
  };

  const handleFeatureToggle = (column: string) => {
    setFeatureColumns((prev) =>
      prev.includes(column) ? prev.filter((c) => c !== column) : [...prev, column]
    );
  };

  const handleStartTraining = async () => {
    if (!taskType) {
      message.error("Please select a task type");
      return;
    }
    if (!targetColumn) {
      message.error("Please select a target column");
      return;
    }
    if (featureColumns.length === 0) {
      message.error("Please select at least one feature column");
      return;
    }

    const expName = experimentName || `${taskType}_${new Date().toISOString().slice(0, 10)}`;
    setExperimentName(expName);
    setIsTraining(true);
    setTrainingProgress(0);
    setTrainingMessage("Starting training...");

    try {
      const response = await fetch("/api/ml/experiments/train", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dataset_id: currentDataset?.id || "unknown",
          experiment_name: expName,
          experiment_type: taskType,
          target_column: targetColumn,
          feature_columns: featureColumns,
          model_name: selectedModel || undefined,
          test_size: testSize,
          cv_folds: cvFolds,
          use_deep_learning: useDL,
          dl_epochs: dlEpochs,
          date_column: dateColumn || undefined,
          forecast_periods: forecastPeriods,
          n_clusters: nClusters,
        }),
      });

      const result = await response.json();
      setTrainingExperimentId(result.experiment_id);

      // Poll for progress
      const pollInterval = setInterval(async () => {
        try {
          const statusResponse = await fetch(`/api/ml/experiments/${result.experiment_id}/status`);
          const status = await statusResponse.json();

          setTrainingProgress(status.progress || 0);
          setTrainingMessage(status.message || "Training...");

          if (status.status === "completed" || status.status === "failed") {
            clearInterval(pollInterval);
            setIsTraining(false);
            if (status.status === "completed") {
              message.success("Training completed!");
              // Load experiment results
              loadExperimentDetails(result.experiment_id);
            } else {
              message.error(status.message || "Training failed");
            }
          }
        } catch (error) {
          console.error("Error polling status:", error);
        }
      }, 2000);
    } catch (error) {
      message.error("Failed to start training");
      setIsTraining(false);
    }
  };

  const loadExperimentDetails = async (experimentId: string) => {
    try {
      const response = await fetch(`/api/ml/experiments/${experimentId}`);
      const experiment = await response.json();
      setSelectedExperiment(experiment);
      setExperiments((prev) => [experiment, ...prev.filter((e) => e.id !== experimentId)]);
    } catch (error) {
      message.error("Failed to load experiment details");
    }
  };

  // Load initial experiments
  useEffect(() => {
    const loadExperiments = async () => {
      try {
        const response = await fetch(`/api/ml/experiments?dataset_id=${currentDataset?.id || "unknown"}`);
        const data = await response.json();
        setExperiments(data.experiments || []);
      } catch (error) {
        console.error("Failed to load experiments:", error);
      }
    };

    loadExperiments();
  }, [currentDataset?.id]);

  // ──────────────────────────────────────────
  // RENDER FUNCTIONS
  // ──────────────────────────────────────────
  const renderTaskTypeCards = () => (
    <Row gutter={[16, 16]}>
      {TASK_TYPES.map((task) => (
        <Col span={12} key={task.key}>
          <Card
            hoverable
            onClick={() => handleTaskTypeSelect(task.key)}
            className={`task-type-card ${taskType === task.key ? "active" : ""}`}
            style={{
              borderColor: taskType === task.key ? task.color : undefined,
              borderWidth: taskType === task.key ? 2 : 1,
            }}
          >
            <Space direction="vertical" style={{ width: "100%" }}>
              <div style={{ fontSize: 24, color: task.color }}>{task.icon}</div>
              <Text strong>{task.title}</Text>
              <Text type="secondary">{task.description}</Text>
            </Space>
          </Card>
        </Col>
      ))}
    </Row>
  );

  const renderFeatureSelector = () => (
    <Card title="Select Features">
      <Space direction="vertical" style={{ width: "100%" }}>
        <Text>Available columns: {datasetColumns.length}</Text>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {datasetColumns.map((col) => (
            <Checkbox
              key={col}
              checked={featureColumns.includes(col)}
              onChange={() => handleFeatureToggle(col)}
            >
              {col}
            </Checkbox>
          ))}
        </div>
      </Space>
    </Card>
  );

  const renderManualConfig = () => (
    <Space direction="vertical" style={{ width: "100%" }}>
      <Card title="Step 1: Select Task Type">{renderTaskTypeCards()}</Card>

      {taskType && (
        <>
          <Card title="Step 2: Select Target Column">
            <Select
              placeholder="Choose column to predict"
              style={{ width: "100%" }}
              value={targetColumn || undefined}
              onChange={setTargetColumn}
              options={datasetColumns.map((col) => ({ label: col, value: col }))}
            />
          </Card>

          <Card title="Step 3: Select Features">{renderFeatureSelector()}</Card>

          <Card title="Step 4: Choose Model">
            <Select
              placeholder="Select model"
              style={{ width: "100%" }}
              value={selectedModel || undefined}
              onChange={setSelectedModel}
              options={availableModels.map((m) => ({
                label: `${m.name} - ${m.description}`,
                value: m.name,
              }))}
            />
          </Card>

          <Card title="Step 5: Training Options">
            <Space direction="vertical" style={{ width: "100%" }}>
              <div>
                <Text>Train/Test Split: {(testSize * 100).toFixed(0)}%</Text>
                <Slider
                  min={0.1}
                  max={0.5}
                  step={0.05}
                  value={testSize}
                  onChange={setTestSize}
                />
              </div>

              <div>
                <Text>Cross-Validation Folds: {cvFolds}</Text>
                <Slider
                  min={2}
                  max={10}
                  step={1}
                  value={cvFolds}
                  onChange={setCvFolds}
                />
              </div>

              <Space>
                <Switch checked={useDL} onChange={setUseDL} />
                <Text>Use Deep Learning</Text>
              </Space>

              {useDL && (
                <div>
                  <Text>Epochs: {dlEpochs}</Text>
                  <Slider
                    min={10}
                    max={200}
                    step={10}
                    value={dlEpochs}
                    onChange={setDlEpochs}
                  />
                </div>
              )}

              {/* Task-specific options */}
              {taskType === "forecasting" && (
                <>
                  <Select
                    placeholder="Select date column"
                    value={dateColumn || undefined}
                    onChange={setDateColumn}
                    options={datasetColumns.map((col) => ({ label: col, value: col }))}
                  />
                  <div>
                    <Text>Forecast Periods: {forecastPeriods}</Text>
                    <Slider
                      min={7}
                      max={365}
                      step={7}
                      value={forecastPeriods}
                      onChange={setForecastPeriods}
                    />
                  </div>
                </>
              )}

              {taskType === "clustering" && (
                <div>
                  <Text>Number of Clusters: {nClusters}</Text>
                  <Slider
                    min={2}
                    max={10}
                    step={1}
                    value={nClusters}
                    onChange={setNClusters}
                  />
                </div>
              )}
            </Space>
          </Card>

          <Input
            placeholder="Experiment name (optional)"
            value={experimentName}
            onChange={(e) => setExperimentName(e.target.value)}
          />

          <Button
            type="primary"
            size="large"
            icon={<PlayCircleOutlined />}
            onClick={handleStartTraining}
            block
            loading={isTraining}
          >
            {isTraining ? "Training..." : "Start Training"}
          </Button>
        </>
      )}
    </Space>
  );

  const renderAutoMLChat = () => (
    <Space direction="vertical" style={{ width: "100%" }}>
      <Card
        className="ml-chat-container"
        style={{ height: "400px", overflowY: "auto", marginBottom: 16 }}
      >
        {chatMessages.map((msg, idx) => (
          <div key={idx} style={{ marginBottom: 12 }}>
            <Text
              strong
              style={{
                color: msg.role === "user" ? "#1890ff" : "#52c41a",
              }}
            >
              {msg.role === "user" ? "You" : "AI Assistant"}:
            </Text>
            <div style={{ marginTop: 4, marginLeft: 16 }}>
              <Text>{msg.content}</Text>
            </div>
          </div>
        ))}
        {isLoadingChat && <Spin />}
      </Card>

      <Space style={{ width: "100%" }}>
        <Input
          placeholder="Describe what you want to predict or build..."
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          onPressEnter={handleSendChatMessage}
          disabled={isLoadingChat}
        />
        <Button
          type="primary"
          icon={<SendOutlined />}
          onClick={handleSendChatMessage}
          loading={isLoadingChat}
        />
      </Space>

      {(targetColumn || featureColumns.length > 0) && (
        <Button
          type="primary"
          size="large"
          block
          onClick={handleStartTraining}
          loading={isTraining}
        >
          {isTraining ? "Training..." : "Train Model"}
        </Button>
      )}
    </Space>
  );

  const renderResults = () => {
    if (!selectedExperiment) return <Empty />;

    const { experiment_type, metrics, best_model, feature_importance, confusion_matrix } = selectedExperiment;

    return (
      <Space direction="vertical" style={{ width: "100%" }}>
        <Card title={selectedExperiment.name}>
          <Row gutter={16}>
            <Col span={6}>
              <Statistic
                title="Status"
                value={selectedExperiment.status}
                valueStyle={{
                  color: selectedExperiment.status === "completed" ? "#52c41a" : "#faad14",
                }}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="Model"
                value={best_model || "N/A"}
              />
            </Col>
            {selectedExperiment.training_duration_seconds && (
              <Col span={6}>
                <Statistic
                  title="Duration"
                  value={`${(selectedExperiment.training_duration_seconds / 60).toFixed(1)}m`}
                />
              </Col>
            )}
            <Col span={6}>
              <Statistic
                title="Progress"
                value={selectedExperiment.progress}
                suffix="%"
              />
            </Col>
          </Row>
        </Card>

        {/* Metrics */}
        {metrics && (
          <Card title="Metrics">
            <Row gutter={16}>
              {Object.entries(metrics).map(([key, value]) => (
                <Col span={8} key={key}>
                  <Statistic
                    title={key.replace(/_/g, " ").toUpperCase()}
                    value={typeof value === "number" ? value.toFixed(4) : value}
                  />
                </Col>
              ))}
            </Row>
          </Card>
        )}

        {/* Feature Importance */}
        {feature_importance && Object.keys(feature_importance).length > 0 && (
          <Card title="Feature Importance">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={Object.entries(feature_importance).map(([key, value]) => ({
                  name: key,
                  importance: value,
                }))}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="importance" fill="#1890ff" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        )}

        {/* Confusion Matrix */}
        {confusion_matrix && experiment_type === "classification" && (
          <Card title="Confusion Matrix">
            <Table
              dataSource={confusion_matrix.map((row, idx) => ({
                key: idx,
                ...Object.fromEntries(row.map((val, i) => [`Pred ${i}`, val])),
              }))}
              pagination={false}
              size="small"
            />
          </Card>
        )}

        <Button
          type="text"
          onClick={() => setShowPredictionForm(true)}
        >
          Make Prediction
        </Button>
      </Space>
    );
  };

  const renderTrainingProgress = () => {
    if (!isTraining) return null;

    return (
      <Modal
        title="Training Progress"
        open={isTraining}
        footer={null}
        closable={false}
      >
        <Space direction="vertical" style={{ width: "100%" }}>
          <Progress
            type="circle"
            percent={trainingProgress}
            width={200}
            format={(percent) => `${percent}%`}
          />
          <Text>{trainingMessage}</Text>
        </Space>
      </Modal>
    );
  };

  // ──────────────────────────────────────────
  // MAIN RENDER
  // ──────────────────────────────────────────
  return (
    <div className="ml-workspace">
      <div className="ml-config-panel">
        <div className="ml-config-panel-inner">
          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            items={[
              {
                key: "automl",
                label: (
                  <span>
                    <RobotOutlined /> AutoML Chat
                  </span>
                ),
                children: renderAutoMLChat(),
              },
              {
                key: "manual",
                label: (
                  <span>
                    <SettingOutlined /> Manual Config
                  </span>
                ),
                children: renderManualConfig(),
              },
            ]}
          />
        </div>
      </div>

      <div className="ml-results-panel">
        <Card title="Results" style={{ height: "100%", overflowY: "auto" }}>
          {selectedExperiment ? renderResults() : <Empty description="Select an experiment to view results" />}
        </Card>
      </div>

      <div className="ml-automl-chat">
        <div className="ml-experiments-panel">
          <Card title="Experiments" size="small">
            {experiments.length === 0 ? (
              <Empty />
            ) : (
              <List
                dataSource={experiments}
                renderItem={(exp) => (
                  <List.Item
                    onClick={() => setSelectedExperiment(exp)}
                    className={`ml-experiment-item ${selectedExperiment?.id === exp.id ? "active" : ""}`}
                  >
                    <List.Item.Meta
                      title={exp.name}
                      description={
                        <>
                          <Tag color="blue">{exp.experiment_type}</Tag>
                          <Tag
                            color={
                              exp.status === "completed"
                                ? "green"
                                : exp.status === "failed"
                                ? "red"
                                : "orange"
                            }
                          >
                            {exp.status}
                          </Tag>
                        </>
                      }
                    />
                  </List.Item>
                )}
              />
            )}
          </Card>
        </div>
      </div>

      {renderTrainingProgress()}
    </div>
  );
}
