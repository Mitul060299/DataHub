import {
  Badge,
  Button,
  Card,
  Checkbox,
  Collapse,
  Divider,
  Input,
  List,
  Progress,
  Select,
  Slider,
  Space,
  Steps,
  Switch,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExperimentOutlined,
  PlayCircleOutlined,
  RocketOutlined,
} from "@ant-design/icons";
import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { notify } from "../utils/notify";
import { AIChat, type AIAction, type DatasetSummary } from "./ai/AIChat";

const { Text, Title } = Typography;

type Dataset = {
  id: string;
  name: string;
  columns: string[];
  preview: Array<Record<string, string | number>>;
};

type ModelType =
  | "linear_regression"
  | "logistic_regression"
  | "random_forest"
  | "xgboost"
  | "neural_network"
  | "kmeans"
  | "arima";

type ModelCard = {
  id: ModelType;
  name: string;
  description: string;
  useCases: string;
  complexity: number;
};

type TrainingResult = {
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  auc: number;
};

type ModelHistoryItem = {
  id: string;
  name: string;
  type: string;
  accuracy: number;
  createdAt: string;
  status: "deployed" | "archived";
};

type HyperParams = {
  trees: number;
  maxDepth: number;
  minSamplesSplit: number;
};

const DATASETS: Dataset[] = [
  {
    id: "sales",
    name: "Customer Sales",
    columns: ["region", "segment", "revenue", "orders", "churned"],
    preview: Array.from({ length: 10 }).map((_, index) => ({
      key: index + 1,
      region: ["North", "South", "West", "East"][index % 4],
      segment: ["SMB", "Mid", "Enterprise"][index % 3],
      revenue: 5200 + index * 420,
      orders: 12 + (index % 6),
      churned: index % 4 === 0 ? "Yes" : "No",
    })),
  },
  {
    id: "marketing",
    name: "Marketing Leads",
    columns: ["channel", "campaign", "spend", "clicks", "converted"],
    preview: Array.from({ length: 10 }).map((_, index) => ({
      key: index + 1,
      channel: ["Email", "Search", "Social"][index % 3],
      campaign: `Q${(index % 4) + 1}`,
      spend: 1200 + index * 90,
      clicks: 320 + index * 40,
      converted: index % 5 === 0 ? "Yes" : "No",
    })),
  },
];

const MODEL_CARDS: ModelCard[] = [
  {
    id: "linear_regression",
    name: "Linear Regression",
    description: "Predict continuous outcomes with interpretable coefficients.",
    useCases: "Forecasting, demand planning",
    complexity: 2,
  },
  {
    id: "logistic_regression",
    name: "Logistic Regression",
    description: "Classify outcomes with probabilistic output.",
    useCases: "Churn, propensity scoring",
    complexity: 2,
  },
  {
    id: "random_forest",
    name: "Random Forest",
    description: "Ensemble trees for strong performance and robustness.",
    useCases: "Classification, regression",
    complexity: 3,
  },
  {
    id: "xgboost",
    name: "XGBoost",
    description: "Gradient boosted trees for high accuracy.",
    useCases: "Structured data, competitions",
    complexity: 4,
  },
  {
    id: "neural_network",
    name: "Neural Network",
    description: "Deep learning for complex nonlinear patterns.",
    useCases: "High-dimensional data",
    complexity: 5,
  },
  {
    id: "kmeans",
    name: "K-Means Clustering",
    description: "Unsupervised segmentation and grouping.",
    useCases: "Customer segmentation",
    complexity: 3,
  },
  {
    id: "arima",
    name: "ARIMA",
    description: "Time series forecasting with autoregressive models.",
    useCases: "Seasonality, trend analysis",
    complexity: 3,
  },
];

const TRAINING_METRICS = Array.from({ length: 20 }).map((_, index) => ({
  epoch: index + 1,
  loss: 0.9 - index * 0.03,
  accuracy: 0.65 + index * 0.015,
}));

const FEATURE_IMPORTANCE = [
  { feature: "revenue", score: 0.42 },
  { feature: "orders", score: 0.31 },
  { feature: "segment", score: 0.18 },
  { feature: "region", score: 0.09 },
];

const CONFUSION_MATRIX = [
  { label: "Actual Yes", predictedYes: 420, predictedNo: 32 },
  { label: "Actual No", predictedYes: 28, predictedNo: 380 },
];

const PREDICTIONS = Array.from({ length: 12 }).map((_, index) => ({
  key: index + 1,
  actual: index % 4 === 0 ? "No" : "Yes",
  predicted: index % 5 === 0 ? "No" : "Yes",
  confidence: `${Math.round(70 + (index % 5) * 6)}%`,
}));

const HISTORY_ITEMS: ModelHistoryItem[] = [
  {
    id: "m1",
    name: "Churn RF v1",
    type: "Random Forest",
    accuracy: 0.945,
    createdAt: "2025-12-04",
    status: "deployed",
  },
  {
    id: "m2",
    name: "Churn XGB v2",
    type: "XGBoost",
    accuracy: 0.931,
    createdAt: "2025-11-19",
    status: "archived",
  },
];

export function MlModelingPanel() {
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedDatasetId, setSelectedDatasetId] = useState(DATASETS[0].id);
  const [features, setFeatures] = useState<string[]>(["region", "segment", "orders"]);
  const [target, setTarget] = useState<string | null>("churned");
  const [split, setSplit] = useState([70, 85]);
  const [missingHandling, setMissingHandling] = useState("drop");
  const [selectedModel, setSelectedModel] = useState<ModelType>("random_forest");
  const [hyperparams, setHyperparams] = useState<HyperParams>({
    trees: 200,
    maxDepth: 18,
    minSamplesSplit: 2,
  });
  const [trainingProgress, setTrainingProgress] = useState(68);
  const [trainingResult] = useState<TrainingResult>({
    accuracy: 0.945,
    precision: 0.921,
    recall: 0.953,
    f1: 0.936,
    auc: 0.97,
  });
  const [autoML, setAutoML] = useState(false);
  const [compareModels, setCompareModels] = useState<ModelType[]>([]);
  const [showMisclassifiedOnly, setShowMisclassifiedOnly] = useState(false);

  const dataset = DATASETS.find((item) => item.id === selectedDatasetId) || DATASETS[0];
  const datasetSummary: DatasetSummary = {
    id: dataset.id,
    name: dataset.name,
    columns: dataset.columns,
  };

  const predictionData = useMemo(
    () =>
      showMisclassifiedOnly
        ? PREDICTIONS.filter((row) => row.actual !== row.predicted)
        : PREDICTIONS,
    [showMisclassifiedOnly]
  );

  const handleStartTraining = () => {
    setTrainingProgress(15);
    notify.info("Training started");
    setTimeout(() => setTrainingProgress(68), 800);
  };

  const handleAIAction = (action: AIAction) => {
    switch (action.type) {
      case "start_training":
        handleStartTraining();
        break;
      case "suggest_model":
        setSelectedModel("arima");
        notify.info("Suggested model selected: ARIMA");
        break;
      case "switch_dataset":
        setSelectedDatasetId(DATASETS[1]?.id || DATASETS[0].id);
        break;
      default:
        notify.info(`AI action: ${action.type}`);
    }
  };

  return (
    <div className="ai-first-layout">
      <div className="ai-first-main">
        <div className="ml-root">
          <div className="ml-header">
            <Space direction="vertical">
              <Title level={3} style={{ margin: 0 }}>
                ML Modeling Studio
              </Title>
              <Text type="secondary">Build, train, and deploy machine learning models.</Text>
            </Space>
            <Space>
              <Switch checked={autoML} onChange={setAutoML} />
              <Text type="secondary">AutoML</Text>
            </Space>
          </div>

          <Steps
            current={currentStep}
            items={[
              { title: "Data" },
              { title: "Model" },
              { title: "Train" },
              { title: "Evaluate" },
              { title: "Deploy" },
            ]}
          />

          <div className="ml-layout">
            <div className="ml-sidebar">
              <Card className="ml-card" title="Model history">
                <List
                  dataSource={HISTORY_ITEMS}
                  renderItem={(item) => (
                    <List.Item
                      actions={[
                        <Button key="view" size="small">View</Button>,
                        <Button key="deploy" size="small" type="primary">Deploy</Button>,
                        <Button key="delete" size="small" danger>Delete</Button>,
                      ]}
                    >
                      <Space direction="vertical" size={2}>
                        <Text strong>{item.name}</Text>
                        <Text type="secondary">{item.type}</Text>
                        <Text type="secondary">Accuracy {Math.round(item.accuracy * 100)}%</Text>
                        <Badge status={item.status === "deployed" ? "success" : "default"} text={item.status} />
                      </Space>
                    </List.Item>
                  )}
                />
              </Card>
            </div>

            <div className="ml-content">
              {currentStep === 0 && (
                <Card className="ml-card" title="Data selection">
                  <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                    <Select
                      value={selectedDatasetId}
                      onChange={setSelectedDatasetId}
                      options={DATASETS.map((item) => ({ label: item.name, value: item.id }))}
                      style={{ width: 260 }}
                    />
                <Table
                  dataSource={dataset.preview}
                  columns={dataset.columns.map((col) => ({ title: col, dataIndex: col, key: col }))}
                  pagination={false}
                  size="small"
                />
                <div className="ml-columns">
                  <div>
                    <Text strong>Features (X)</Text>
                    <Checkbox.Group
                      value={features}
                      onChange={(checked) => setFeatures(checked as string[])}
                    >
                      <Space direction="vertical">
                        {dataset.columns.map((col) => (
                          <Checkbox key={col} value={col}>
                            {col}
                          </Checkbox>
                        ))}
                      </Space>
                    </Checkbox.Group>
                  </div>
                  <div>
                    <Text strong>Target (Y)</Text>
                    <Select
                      value={target || undefined}
                      onChange={(value) => setTarget(value)}
                      options={dataset.columns.map((col) => ({ label: col, value: col }))}
                      style={{ width: 200 }}
                    />
                  </div>
                </div>
                <div>
                  <Text strong>Data split</Text>
                  <Slider
                    range
                    value={split}
                    onChange={(value) => setSplit(value as number[])}
                    tooltip={{ formatter: (value) => `${value}%` }}
                  />
                  <Text type="secondary">
                    Training {split[0]}% · Validation {split[1] - split[0]}% · Test {100 - split[1]}%
                  </Text>
                </div>
                <div>
                  <Text strong>Missing value handling</Text>
                  <Select
                    value={missingHandling}
                    onChange={setMissingHandling}
                    options={[
                      { label: "Drop rows", value: "drop" },
                      { label: "Fill with mean/median/mode", value: "fill" },
                      { label: "Predictive imputation", value: "predict" },
                    ]}
                    style={{ width: 260 }}
                  />
                </div>
                <Space>
                  <Button type="primary" onClick={() => setCurrentStep(1)}>Next</Button>
                </Space>
              </Space>
            </Card>
          )}

          {currentStep === 1 && (
            <Card className="ml-card" title="Model selection">
              <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                <Card className="recommend-card">
                  <Space direction="vertical">
                    <Text strong>Based on your data, we recommend Random Forest</Text>
                    <Text type="secondary">
                      You have {features.length} features, 10K rows, and categorical target.
                    </Text>
                    <Button type="primary" onClick={() => setSelectedModel("random_forest")}>
                      Select model
                    </Button>
                  </Space>
                </Card>
                <div className="model-grid">
                  {MODEL_CARDS.map((model) => {
                    if (!target && model.id === "logistic_regression") return null;
                    if (!target && model.id === "linear_regression") return null;
                    if (target && model.id === "kmeans") return null;
                    return (
                      <Card key={model.id} className="model-card" hoverable>
                        <Space direction="vertical" size={8}>
                          <Text strong>{model.name}</Text>
                          <Text type="secondary">{model.description}</Text>
                          <Text type="secondary">Best for: {model.useCases}</Text>
                          <Text type="secondary">Complexity: {"⭐".repeat(model.complexity)}</Text>
                          <Space>
                            <Button
                              type={selectedModel === model.id ? "primary" : "default"}
                              onClick={() => setSelectedModel(model.id)}
                            >
                              Select Model
                            </Button>
                            <Button type="link">Learn more</Button>
                          </Space>
                        </Space>
                      </Card>
                    );
                  })}
                </div>
                <Space>
                  <Select
                    mode="multiple"
                    placeholder="Compare models"
                    value={compareModels}
                    onChange={(value) => setCompareModels(value as ModelType[])}
                    options={MODEL_CARDS.map((model) => ({ label: model.name, value: model.id }))}
                    style={{ minWidth: 260 }}
                  />
                  <Button onClick={() => notify.info("Model comparison loaded")}>Compare</Button>
                </Space>
                <Space>
                  <Button onClick={() => setCurrentStep(0)}>Back</Button>
                  <Button type="primary" onClick={() => setCurrentStep(2)}>Next</Button>
                </Space>
              </Space>
            </Card>
          )}

          {currentStep === 2 && (
            <Card className="ml-card" title="Training">
              <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                <Space direction="vertical">
                  <Text strong>Random Forest hyperparameters</Text>
                  <Slider
                    min={10}
                    max={500}
                    value={hyperparams.trees}
                    onChange={(value) => setHyperparams((prev) => ({ ...prev, trees: value as number }))}
                  />
                  <Text type="secondary">Number of trees: {hyperparams.trees}</Text>
                  <Slider
                    min={3}
                    max={50}
                    value={hyperparams.maxDepth}
                    onChange={(value) => setHyperparams((prev) => ({ ...prev, maxDepth: value as number }))}
                  />
                  <Text type="secondary">Max depth: {hyperparams.maxDepth}</Text>
                  <Input
                    value={hyperparams.minSamplesSplit}
                    onChange={(event) =>
                      setHyperparams((prev) => ({
                        ...prev,
                        minSamplesSplit: Number(event.target.value),
                      }))
                    }
                    placeholder="Min samples split"
                  />
                  <Collapse
                    items={[
                      {
                        key: "advanced",
                        label: "Advanced options",
                        children: <Text type="secondary">Additional tuning options go here.</Text>,
                      },
                    ]}
                  />
                </Space>
                <Button type="primary" icon={<PlayCircleOutlined />} onClick={handleStartTraining}>
                  Start Training
                </Button>
                <Card className="ml-training-card">
                  <Space direction="vertical" size="small" style={{ width: "100%" }}>
                    <Text strong>Training progress</Text>
                    <Progress percent={trainingProgress} status="active" />
                    <Text type="secondary">Loss: 0.18 · Accuracy: 94% · ETA 2m</Text>
                    <Button danger>Cancel</Button>
                  </Space>
                </Card>
                <Button onClick={() => setCurrentStep(3)}>Next</Button>
              </Space>
            </Card>
          )}

          {currentStep === 3 && (
            <Card className="ml-card" title="Evaluation">
              <Tabs
                items={[
                  {
                    key: "performance",
                    label: "Performance",
                    children: (
                      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                        <div className="metric-grid">
                          <Card className="metric-card">
                            <Text type="secondary">Accuracy</Text>
                            <Title level={4}>{Math.round(trainingResult.accuracy * 100)}%</Title>
                          </Card>
                          <Card className="metric-card">
                            <Text type="secondary">Precision</Text>
                            <Title level={4}>{Math.round(trainingResult.precision * 100)}%</Title>
                          </Card>
                          <Card className="metric-card">
                            <Text type="secondary">Recall</Text>
                            <Title level={4}>{Math.round(trainingResult.recall * 100)}%</Title>
                          </Card>
                          <Card className="metric-card">
                            <Text type="secondary">F1 Score</Text>
                            <Title level={4}>{Math.round(trainingResult.f1 * 100)}%</Title>
                          </Card>
                        </div>
                        <div className="ml-charts">
                          <Card className="ml-chart-card" title="Confusion Matrix">
                            <ResponsiveContainer width="100%" height={180}>
                              <BarChart data={CONFUSION_MATRIX} layout="vertical">
                                <XAxis type="number" />
                                <YAxis type="category" dataKey="label" />
                                <RechartsTooltip />
                                <Bar dataKey="predictedYes" fill="#22c55e" />
                                <Bar dataKey="predictedNo" fill="#3b82f6" />
                              </BarChart>
                            </ResponsiveContainer>
                          </Card>
                          <Card className="ml-chart-card" title="ROC Curve">
                            <ResponsiveContainer width="100%" height={180}>
                              <LineChart data={TRAINING_METRICS}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="epoch" />
                                <YAxis />
                                <RechartsTooltip />
                                <Line type="monotone" dataKey="accuracy" stroke="#f97316" />
                              </LineChart>
                            </ResponsiveContainer>
                            <Text type="secondary">AUC: {trainingResult.auc}</Text>
                          </Card>
                          <Card className="ml-chart-card" title="Feature Importance">
                            <ResponsiveContainer width="100%" height={180}>
                              <BarChart data={FEATURE_IMPORTANCE} layout="vertical">
                                <XAxis type="number" />
                                <YAxis type="category" dataKey="feature" />
                                <RechartsTooltip />
                                <Bar dataKey="score" fill="#6366f1" />
                              </BarChart>
                            </ResponsiveContainer>
                          </Card>
                        </div>
                      </Space>
                    ),
                  },
                  {
                    key: "predictions",
                    label: "Predictions",
                    children: (
                      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                        <Space>
                          <Switch checked={showMisclassifiedOnly} onChange={setShowMisclassifiedOnly} />
                          <Text type="secondary">Show only misclassified</Text>
                          <Button onClick={() => notify.success("Predictions exported")}>Download CSV</Button>
                        </Space>
                        <Table
                          dataSource={predictionData}
                          columns={[
                            { title: "Actual", dataIndex: "actual" },
                            { title: "Predicted", dataIndex: "predicted" },
                            { title: "Confidence", dataIndex: "confidence" },
                          ]}
                          pagination={false}
                          size="small"
                        />
                      </Space>
                    ),
                  },
                  {
                    key: "diagnostics",
                    label: "Diagnostics",
                    children: (
                      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                        <Card className="ml-chart-card" title="Learning Curves">
                          <ResponsiveContainer width="100%" height={180}>
                            <LineChart data={TRAINING_METRICS}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="epoch" />
                              <YAxis />
                              <RechartsTooltip />
                              <Line type="monotone" dataKey="loss" stroke="#ef4444" />
                              <Line type="monotone" dataKey="accuracy" stroke="#22c55e" />
                            </LineChart>
                          </ResponsiveContainer>
                        </Card>
                        <Card className="ml-chart-card" title="Error distribution">
                          <ResponsiveContainer width="100%" height={180}>
                            <AreaChart data={TRAINING_METRICS}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="epoch" />
                              <YAxis />
                              <RechartsTooltip />
                              <Area dataKey="loss" stroke="#f59e0b" fill="#fde68a" />
                            </AreaChart>
                          </ResponsiveContainer>
                        </Card>
                      </Space>
                    ),
                  },
                ]}
              />
              <Space>
                <Button onClick={() => setCurrentStep(2)}>Back</Button>
                <Button type="primary" onClick={() => setCurrentStep(4)}>Next</Button>
              </Space>
            </Card>
          )}

          {currentStep === 4 && (
            <Card className="ml-card" title="Deploy">
              <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                <Input placeholder="Model name" defaultValue="Churn RF" />
                <Input.TextArea placeholder="Description" />
                <div>
                  <Text strong>Deployment options</Text>
                  <Space direction="vertical">
                    <Button icon={<RocketOutlined />}>Generate API endpoint</Button>
                    <Button>Batch prediction</Button>
                    <Button>Scheduled retraining</Button>
                  </Space>
                </div>
                <Divider />
                <div>
                  <Text strong>Version control</Text>
                  <Space direction="vertical">
                    <Tag color="blue">Current version: v1.2</Tag>
                    <Tag>v1.1</Tag>
                    <Tag>v1.0</Tag>
                    <Button>Rollback</Button>
                  </Space>
                </div>
                <Space>
                  <Button type="primary">Deploy Model</Button>
                  <Button onClick={() => setCurrentStep(3)}>Back</Button>
                </Space>
              </Space>
            </Card>
          )}
        </div>
      </div>

          <Card className="ml-card">
            <Space direction="vertical" size="small" style={{ width: "100%" }}>
              <Text strong>Monitoring & Explainability</Text>
              <Space wrap>
                <Tag icon={<CheckCircleOutlined />} color="green">Model monitoring active</Tag>
                <Tag icon={<ClockCircleOutlined />} color="blue">A/B testing running</Tag>
                <Tag icon={<ExperimentOutlined />} color="purple">SHAP explainability enabled</Tag>
              </Space>
            </Space>
          </Card>
        </div>
      </div>
      <div className="ai-first-chat">
        <AIChat
          context="ml"
          currentDataset={datasetSummary}
          onAction={handleAIAction}
          suggestions={[
            "Predict next month's sales",
            "Find customer segments",
            "Detect anomalies in my data",
            "Recommend a model for my use case",
          ]}
        />
      </div>
    </div>
  );
}
