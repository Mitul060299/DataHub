import React, { useState, useRef, useEffect } from 'react';
import {
  Layout,
  Input,
  Button,
  Card,
  Tag,
  Empty,
  Spin,
  Tooltip,
  Select,
  Space,
  Badge,
  List,
  Divider,
  Collapse,
  Drawer,
} from 'antd';
import {
  SendOutlined,
  LoadingOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  DeleteOutlined,
  SaveOutlined,
  BarsOutlined,
  PlusOutlined,
  RobotOutlined,
} from '@ant-design/icons';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartTooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import './FullAutoTab.css';


interface AnalysisEvent {
  type: 'message' | 'plan' | 'step_start' | 'step_result' | 'chart' | 'insight' | 'error' | 'ask_user' | 'done';
  content: string;
  data?: any;
  timestamp: number;
}

interface Session {
  id: string;
  title: string;
  status: string;
  created_at: string;
  total_steps: number;
  completed_steps: number;
}

interface FullAutoTabProps {
  projectId: string;
  datasetId: string;
  onDatasetChange?: (datasetId: string) => void;
}

const FullAutoTab: React.FC<FullAutoTabProps> = ({
  projectId,
  datasetId,
  onDatasetChange,
}) => {
  // State
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [events, setEvents] = useState<AnalysisEvent[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [selectedDataset, setSelectedDataset] = useState(datasetId);
  const [showHistory, setShowHistory] = useState(true);
  const [datasetInfo, setDatasetInfo] = useState<any>(null);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [events]);

  // Load sessions on mount
  useEffect(() => {
    loadSessions();
  }, []);

  // Load dataset info
  useEffect(() => {
    loadDatasetInfo();
  }, [selectedDataset]);

  const loadSessions = async () => {
    try {
      const response = await fetch('/api/auto/sessions');
      if (response.ok) {
        const data = await response.json();
        setSessions(data.sessions || []);
      }
    } catch (error) {
      console.error('Failed to load sessions:', error);
    }
  };

  const loadDatasetInfo = async () => {
    try {
      const response = await fetch(`/api/datasets/${selectedDataset}`);
      if (response.ok) {
        const data = await response.json();
        setDatasetInfo(data);
      }
    } catch (error) {
      console.error('Failed to load dataset info:', error);
    }
  };

  const loadSession = async (sessionId: string) => {
    try {
      const response = await fetch(`/api/auto/sessions/${sessionId}`);
      if (response.ok) {
        const session = await response.json();
        setActiveSessionId(sessionId);
        setEvents(session.conversation || []);
      }
    } catch (error) {
      console.error('Failed to load session:', error);
    }
  };

  const startAnalysis = async () => {
    if (!userInput.trim()) return;
    if (!selectedDataset) {
      alert('Please select a dataset');
      return;
    }

    setIsRunning(true);
    setEvents([]);
    setActiveSessionId(null);

    // Create a new session ID
    const sessionId = `session-${Date.now()}`;
    setActiveSessionId(sessionId);

    try {
      // Subscribe to SSE stream
      const eventSource = new EventSource(
        `/api/auto/run?dataset_id=${selectedDataset}&user_request=${encodeURIComponent(
          userInput
        )}`
      );

      eventSourceRef.current = eventSource;

      eventSource.onmessage = (event) => {
        try {
          const parsedEvent = JSON.parse(event.data) as AnalysisEvent;
          setEvents((prev) => [...prev, parsedEvent]);
        } catch (error) {
          console.error('Failed to parse event:', error);
        }
      };

      eventSource.onerror = (error) => {
        console.error('EventSource error:', error);
        eventSource.close();
        setIsRunning(false);
      };

      // Wait for done event
      await new Promise<void>((resolve) => {
        const checkDone = setInterval(() => {
          setEvents((prev) => {
            const isDone = prev.some((e) => e.type === 'done');
            if (isDone) {
              clearInterval(checkDone);
              eventSource.close();
              setIsRunning(false);
              resolve();
            }
            return prev;
          });
        }, 100);
      });

      // Reload sessions
      await loadSessions();

    } catch (error) {
      console.error('Analysis failed:', error);
      setIsRunning(false);
      setEvents((prev) => [
        ...prev,
        {
          type: 'error',
          content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          timestamp: Date.now() / 1000,
        },
      ]);
    }

    setUserInput('');
  };

  const saveCurrentSession = async () => {
    if (!activeSessionId) return;

    try {
      const response = await fetch(`/api/auto/sessions/${activeSessionId}/save`, {
        method: 'POST',
      });

      if (response.ok) {
        const data = await response.json();
        alert(`Session saved with ID: ${data.session_id}`);
        loadSessions();
      }
    } catch (error) {
      console.error('Failed to save session:', error);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    if (!window.confirm('Delete this session?')) return;

    try {
      // Note: implement delete endpoint if needed
      alert('Delete functionality to be implemented');
    } catch (error) {
      console.error('Failed to delete session:', error);
    }
  };

  // Render different event types
  const renderEvent = (event: AnalysisEvent, index: number) => {
    const key = `${index}-${event.timestamp}`;

    switch (event.type) {
      case 'message':
        return (
          <div key={key} className="auto-message-bubble agent">
            <p>{event.content}</p>
          </div>
        );

      case 'step_start':
        return (
          <div key={key} className="auto-step-pill running">
            <LoadingOutlined /> {event.content}
          </div>
        );

      case 'step_result':
        return (
          <div key={key} className="auto-step-result">
            <div className="step-header">
              <CheckCircleOutlined /> {event.content}
            </div>
            {event.data && (
              <div className="step-data">
                <pre>{JSON.stringify(event.data, null, 2).substring(0, 500)}</pre>
              </div>
            )}
          </div>
        );

      case 'chart':
        return (
          <div key={key} className="auto-chart-container">
            <Card title="Visualization" size="small">
              {renderChart(event.data)}
            </Card>
          </div>
        );

      case 'plan':
        return (
          <div key={key} className="auto-plan-card">
            <Card title="Execution Plan" size="small">
              {event.data?.plan && (
                <ol>
                  {event.data.plan.map((step: any, i: number) => (
                    <li key={i}>
                      <strong>{step.action}</strong>: {step.description}
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          </div>
        );

      case 'insight':
        return (
          <div key={key} className="auto-insight-card">
            <Card
              title="📊 Key Insights"
              size="small"
              style={{ borderLeft: '4px solid #faad14' }}
            >
              <p>{event.content}</p>
            </Card>
          </div>
        );

      case 'error':
        return (
          <div key={key} className="auto-error-card">
            <Card
              title={<ExclamationCircleOutlined style={{ color: 'red' }} />}
              size="small"
              style={{ borderLeft: '4px solid #ff4d4f' }}
            >
              <p style={{ color: '#ff4d4f' }}>{event.content}</p>
            </Card>
          </div>
        );

      case 'ask_user':
        return (
          <div key={key} className="auto-question-card">
            <Card size="small" style={{ borderLeft: '4px solid #1890ff' }}>
              <p>{event.content}</p>
              <Input.TextArea
                placeholder="Your answer..."
                rows={2}
                style={{ marginTop: 10 }}
              />
              <Button type="primary" size="small" style={{ marginTop: 10 }}>
                Submit
              </Button>
            </Card>
          </div>
        );

      case 'done':
        return (
          <div key={key} className="auto-done-banner">
            <CheckCircleOutlined style={{ color: '#52c41a' }} />
            <span>{event.content}</span>
          </div>
        );

      default:
        return null;
    }
  };

  const renderChart = (chartConfig: any) => {
    if (!chartConfig || !chartConfig.data) {
      return <Empty description="No chart data" />;
    }

    const { type, data, x, y } = chartConfig;

    try {
      switch (type) {
        case 'bar':
          return (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey={x} />
                <YAxis />
                <RechartTooltip />
                <Legend />
                <Bar dataKey={y} fill="#8884d8" />
              </BarChart>
            </ResponsiveContainer>
          );

        case 'line':
          return (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey={x} />
                <YAxis />
                <RechartTooltip />
                <Legend />
                <Line type="monotone" dataKey={y} stroke="#8884d8" />
              </LineChart>
            </ResponsiveContainer>
          );

        case 'scatter':
          return (
            <ResponsiveContainer width="100%" height={300}>
              <ScatterChart>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey={x} />
                <YAxis />
                <RechartTooltip />
                <Scatter name={y} data={data} fill="#8884d8" />
              </ScatterChart>
            </ResponsiveContainer>
          );

        default:
          return <Empty description={`Chart type ${type} not supported`} />;
      }
    } catch (error) {
      console.error('Chart render error:', error);
      return <Empty description="Failed to render chart" />;
    }
  };

  // Quick prompt suggestions
  const quickPrompts = [
    'Find patterns in my customer data',
    'Predict customer churn',
    'Segment customers by behavior',
    'Forecast next quarter sales',
    'Identify outliers and anomalies',
    'Analyze top features',
  ];

  return (
    <Layout className="full-auto-tab">
      {/* Top info bar */}
      <div className="auto-info-bar">
        <div className="info-left">
          <RobotOutlined /> Full Auto Analysis
        </div>
        <div className="info-center">
          {datasetInfo && (
            <span>
              📊 {datasetInfo.name} • {datasetInfo.row_count?.toLocaleString()} rows •{' '}
              {datasetInfo.column_count} columns
            </span>
          )}
        </div>
        <div className="info-right">
          <Button
            icon={<BarsOutlined />}
            onClick={() => setShowHistory(!showHistory)}
            size="small"
            type="text"
          >
            History
          </Button>
        </div>
      </div>

      <Layout className="auto-main-layout">
        {/* Left sidebar - Session history */}
        {showHistory && (
          <Layout.Sider width={300} className="auto-history-sidebar">
            <div className="sidebar-header">
              <h3>Session History</h3>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                size="small"
                onClick={() => {
                  setActiveSessionId(null);
                  setEvents([]);
                  setUserInput('');
                }}
              >
                New
              </Button>
            </div>

            <div className="sessions-list">
              {sessions.length === 0 ? (
                <Empty description="No sessions yet" size="small" />
              ) : (
                <List
                  dataSource={sessions}
                  renderItem={(session) => (
                    <List.Item
                      key={session.id}
                      className={`session-item ${
                        activeSessionId === session.id ? 'active' : ''
                      }`}
                      onClick={() => loadSession(session.id)}
                    >
                      <div className="session-content">
                        <div className="session-title">{session.title}</div>
                        <div className="session-meta">
                          <Badge
                            status={
                              session.status === 'completed'
                                ? 'success'
                                : session.status === 'running'
                                  ? 'processing'
                                  : 'error'
                            }
                            text={session.status}
                          />
                          <span className="session-steps">
                            {session.completed_steps}/{session.total_steps}
                          </span>
                        </div>
                        <div className="session-time">
                          {new Date(session.created_at).toLocaleDateString()}
                        </div>
                      </div>
                    </List.Item>
                  )}
                />
              )}
            </div>
          </Layout.Sider>
        )}

        {/* Right content - Chat and analysis */}
        <Layout.Content className="auto-content">
          <div className="auto-messages-container">
            {events.length === 0 && !isRunning ? (
              <div className="auto-empty-state">
                <RobotOutlined style={{ fontSize: 48, marginBottom: 16 }} />
                <h2>Welcome to Full Auto Analysis</h2>
                <p>Ask me anything about your data in plain English.</p>

                <div className="quick-prompts">
                  {quickPrompts.map((prompt) => (
                    <Button
                      key={prompt}
                      onClick={() => setUserInput(prompt)}
                      className="quick-prompt-btn"
                    >
                      {prompt}
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="messages-list">
                {events.map((event, index) => renderEvent(event, index))}
                {isRunning && (
                  <div className="auto-step-pill thinking">
                    <Spin size="small" /> Thinking...
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Input bar */}
          <div className="auto-input-bar">
            <Space.Compact style={{ width: '100%' }}>
              <Input
                placeholder="What would you like to analyze? (e.g., 'Find patterns in my sales data')"
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                onPressEnter={startAnalysis}
                disabled={isRunning}
                size="large"
              />
              <Button
                type="primary"
                icon={<SendOutlined />}
                onClick={startAnalysis}
                loading={isRunning}
                disabled={!userInput.trim() || isRunning}
                size="large"
              >
                Analyze
              </Button>
            </Space.Compact>

            {events.length > 0 && !isRunning && (
              <div className="auto-input-actions">
                <Button
                  size="small"
                  icon={<SaveOutlined />}
                  onClick={saveCurrentSession}
                >
                  Save Session
                </Button>
              </div>
            )}
          </div>
        </Layout.Content>
      </Layout>
    </Layout>
  );
};

export default FullAutoTab;
