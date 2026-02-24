import React, { useState, useRef, useEffect } from 'react';
import { Card, Input, Button, Spin, Empty, Avatar, Badge, Space, Tooltip, message } from 'antd';
import { SendOutlined, LoadingOutlined, RobotOutlined, UserOutlined } from '@ant-design/icons';
import { createChatSession, streamChatSessionMessage } from '../api';

export interface ChatMessage {
  id: string;
  timestamp: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  type: string;
  metadata?: Record<string, any>;
}

export interface StreamingEvent {
  type: string;
  content: string;
  data?: Record<string, any>;
  timestamp: number;
}

type ConfirmationEventData = {
  category?: string;
  block_reason?: string;
  retryable?: boolean;
  retry_actions?: string[];
  details?: Record<string, any>;
  policy?: {
    max_rows?: number;
    max_columns?: number;
    max_request_chars?: number;
  };
};

interface ChatInterfaceProps {
  sessionId?: string;
  datasetId: string;
  onSessionUpdated?: (sessionData: any) => void;
  onSessionCreated?: (sessionId: string) => void;
  userPlan?: 'free' | 'professional' | 'team' | 'business' | 'enterprise';
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({
  sessionId,
  datasetId,
  onSessionUpdated,
  onSessionCreated,
  userPlan = 'free',
}) => {
  const [activeSessionId, setActiveSessionId] = useState<string | null>(sessionId || null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [events, setEvents] = useState<StreamingEvent[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setActiveSessionId(sessionId || null);
  }, [sessionId]);

  useEffect(() => {
    setMessages([]);
    setEvents([]);
    setActiveSessionId(null);
  }, [datasetId]);

  const ensureSession = async (initialRequest?: string): Promise<string> => {
    if (activeSessionId) return activeSessionId;
    const response = await createChatSession(datasetId, initialRequest);
    const createdId = response?.data?.id;
    if (!createdId) {
      throw new Error('Failed to create chat session');
    }
    setActiveSessionId(createdId);
    onSessionCreated?.(createdId);
    return createdId;
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, events]);

  const sendMessage = async () => {
    if (!inputValue.trim()) return;
    if (!datasetId) {
      message.warning('Select a dataset in workspace before running AI commands.');
      return;
    }

    const userMsg: ChatMessage = {
      id: Math.random().toString(),
      timestamp: Date.now(),
      role: 'user',
      content: inputValue,
      type: 'text',
    };

    setMessages((prev) => [...prev, userMsg]);
    const userInput = inputValue;
    setInputValue('');
    setIsLoading(true);
    setEvents([]);

    try {
      const ensuredSessionId = await ensureSession(userInput);
      const streamEvents = await streamChatSessionMessage(ensuredSessionId, userInput);
      for (const event of streamEvents) {
        setEvents((prev) => [...prev, event as StreamingEvent]);
        if (event.type === 'message') {
          const aiMsg: ChatMessage = {
            id: Math.random().toString(),
            timestamp: event.timestamp,
            role: 'assistant',
            content: event.content,
            type: 'text',
            metadata: event.data,
          };
          setMessages((prev) => [...prev, aiMsg]);
        }
      }
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages((prev) => [
        ...prev,
        {
          id: Math.random().toString(),
          timestamp: Date.now(),
          role: 'assistant',
          content: 'Error: Failed to process request',
          type: 'text',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const renderEventBadge = (type: string) => {
    const badges: Record<string, [string, string]> = {
      message: ['blue', 'Message'],
      thinking: ['cyan', 'Thinking'],
      plan: ['cyan', 'Planning'],
      step_start: ['blue', 'Starting'],
      step_result: ['green', 'Step Complete'],
      preview: ['gold', 'Preview'],
      confirmation_needed: ['gold', 'Confirmation'],
      error: ['red', 'Error'],
      done: ['green', 'Done'],
    };

    const [color, label] = badges[type] || ['default', type];
    return <Badge color={color} text={label} />;
  };

  return (
    <div className="chat-interface">
      <div className="chat-messages">
        {messages.length === 0 && !isLoading ? (
          <Empty description="Start a conversation" style={{ marginTop: '50px' }} />
        ) : (
          <>
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`chat-message chat-message-${msg.role}`}
              >
                <div className="message-avatar">
                  <Avatar
                    icon={msg.role === 'user' ? <UserOutlined /> : <RobotOutlined />}
                    style={{
                      backgroundColor: msg.role === 'user' ? '#1890ff' : '#52c41a',
                    }}
                  />
                </div>
                <div className="message-content">
                  <p className="message-text">{msg.content}</p>
                  <span className="message-time">
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              </div>
            ))}

            {events.length > 0 && (
              <div className="events-container">
                {events.map((event, idx) => (
                  <Card
                    key={idx}
                    size="small"
                    className={`event-card event-${event.type}`}
                    title={renderEventBadge(event.type)}
                    bordered={false}
                  >
                    <p>{event.content}</p>

                    {event.type === 'step_result' && event.data && (
                      <div className="step-stats">
                        <p>
                          Rows: {event.data.rows_before} → {event.data.rows_after}{' '}
                          <span className="stat-time">
                            ({event.data.time_ms}ms)
                          </span>
                        </p>
                      </div>
                    )}

                    {event.type === 'preview' && event.data && (
                      <div className="preview-block">
                        <p>
                          <strong>Before:</strong> {event.data.before_rows} rows |{' '}
                          <strong>After:</strong> {event.data.after_rows} rows
                        </p>
                        {event.data.sample_data && (
                          <table className="preview-table">
                            <thead>
                              <tr>
                                {Object.keys(event.data.sample_data[0] || {}).map(
                                  (col) => (
                                    <th key={col}>{col}</th>
                                  )
                                )}
                              </tr>
                            </thead>
                            <tbody>
                              {event.data.sample_data.slice(0, 3).map((row: any, i: number) => (
                                <tr key={i}>
                                  {Object.values(row).map((val: any, j: number) => (
                                    <td key={j}>{String(val).slice(0, 20)}</td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )}

                    {event.type === 'plan' && event.data?.steps && (
                      <div className="plan-block">
                        <ol>
                          {event.data.steps.map((step: any, i: number) => (
                            <li key={i}>{step.description}</li>
                          ))}
                        </ol>
                      </div>
                    )}

                    {event.type === 'confirmation_needed' && (
                      <div className="confirmation-block">
                        <p className="confirmation-caption">
                          This request requires confirmation before retry.
                        </p>
                        {(() => {
                          const data = (event.data || {}) as ConfirmationEventData;
                          return (
                            <>
                              {data.block_reason && (
                                <p className="confirmation-reason">
                                  <strong>Reason:</strong> {data.block_reason}
                                </p>
                              )}
                              {data.policy && (
                                <p className="confirmation-policy">
                                  <strong>Guardrails:</strong> rows ≤ {data.policy.max_rows ?? '-'}, columns ≤ {data.policy.max_columns ?? '-'}, request chars ≤ {data.policy.max_request_chars ?? '-'}
                                </p>
                              )}
                              {data.retry_actions && data.retry_actions.length > 0 && (
                                <div className="confirmation-actions">
                                  <p className="confirmation-actions-title">Suggested retry actions</p>
                                  <Space wrap>
                                    {data.retry_actions.map((action, idx) => (
                                      <Button
                                        key={`${action}-${idx}`}
                                        size="small"
                                        onClick={() => setInputValue(action)}
                                      >
                                        {action}
                                      </Button>
                                    ))}
                                  </Space>
                                </div>
                              )}
                              {data.retryable === false && (
                                <p className="confirmation-non-retryable">
                                  This action is currently blocked until admin policy is updated.
                                </p>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            )}

            {isLoading && (
              <div className="loading-indicator">
                <Spin indicator={<LoadingOutlined style={{ fontSize: 24 }} />} />
                <p>Processing your request...</p>
              </div>
            )}

            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      <div className="chat-input-area">
        <div className="tier-badge">
          <small>
            Plan: <strong>{userPlan}</strong> | Max steps:{' '}
            {userPlan === 'free' ? '1' : userPlan === 'professional' ? '3' : '∞'}
          </small>
        </div>

        <div className="input-wrapper">
          <Input.TextArea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                sendMessage();
              }
            }}
            placeholder="Ask me to clean, transform, or visualize your data... (Ctrl+Enter to send)"
            rows={3}
            disabled={isLoading}
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={sendMessage}
            disabled={!inputValue.trim() || isLoading}
            loading={isLoading}
          >
            Send
          </Button>
        </div>

        {userPlan !== 'free' && (
          <div className="quick-actions">
            <small>Quick actions:</small>
            <Space wrap>
              <Button
                size="small"
                onClick={() => setInputValue('Remove duplicates')}
              >
                Remove Dups
              </Button>
              <Button
                size="small"
                onClick={() => setInputValue('Fill missing values')}
              >
                Fill Missing
              </Button>
              <Button
                size="small"
                onClick={() => setInputValue('Summary statistics')}
              >
                Summarize
              </Button>
            </Space>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatInterface;
