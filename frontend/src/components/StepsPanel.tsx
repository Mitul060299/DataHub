import React, { useState } from 'react';
import { Card, Button, Space, Tooltip, Collapse, Badge, Empty } from 'antd';
import { DeleteOutlined, UndoOutlined, SettingOutlined, CheckCircleOutlined, ExclamationCircleOutlined, LoadingOutlined } from '@ant-design/icons';

export interface TransformationStep {
  id?: string;
  step_number: number;
  action_type: string;
  description: string;
  parameters?: Record<string, any>;
  input_rows?: number;
  output_rows?: number;
  execution_time_ms?: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  error_details?: string;
}

interface StepsPanelProps {
  steps: TransformationStep[];
  onRollback?: (stepNumber: number) => void;
  onDelete?: (stepNumber: number) => void;
  onEdit?: (stepNumber: number) => void;
}

const getStatusIcon = (status: string) => {
  const icons: Record<string, React.ReactNode> = {
    completed: (
      <CheckCircleOutlined style={{ color: '#52c41a' }} /> // Green
    ),
    failed: (
      <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} /> // Red
    ),
    running: (
      <LoadingOutlined style={{ color: '#faad14' }} /> // Orange
    ),
    pending: (
      <div
        style={{
          width: '16px',
          height: '16px',
          borderRadius: '50%',
          backgroundColor: '#d9d9d9',
        }}
      />
    ),
  };
  return icons[status] || icons.pending;
};

const getStatusColor = (status: string): string => {
  const colors: Record<string, string> = {
    completed: '#52c41a',
    failed: '#ff4d4f',
    running: '#faad14',
    pending: '#d9d9d9',
  };
  return colors[status] || '#d9d9d9';
};

export const StepsPanel: React.FC<StepsPanelProps> = ({
  steps,
  onRollback,
  onDelete,
  onEdit,
}) => {
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());

  const toggleExpand = (stepNumber: number) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(stepNumber)) {
        next.delete(stepNumber);
      } else {
        next.add(stepNumber);
      }
      return next;
    });
  };

  if (!steps || steps.length === 0) {
    return (
      <div className="steps-panel">
        <Card title="Transformation Steps" bordered={false} size="small">
          <Empty description="No steps yet" />
        </Card>
      </div>
    );
  }

  return (
    <div className="steps-panel">
      <Card
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>Transformation Steps</span>
            <Badge count={steps.length} style={{ backgroundColor: '#1890ff' }} />
          </div>
        }
        bordered={false}
        size="small"
      >
        <div className="steps-list">
          {steps.map((step) => (
            <div
              key={step.step_number}
              className={`step-card step-${step.status}`}
              style={{
                borderLeft: `4px solid ${getStatusColor(step.status)}`,
              }}
            >
              <div className="step-header" onClick={() => toggleExpand(step.step_number)}>
                <div className="step-number-badge">
                  {getStatusIcon(step.status)}
                  <span className="step-number">#{step.step_number}</span>
                </div>

                <div className="step-info">
                  <div className="step-action">
                    <strong>{step.action_type}</strong>
                  </div>
                  <div className="step-description">{step.description}</div>
                </div>

                {step.status === 'completed' && step.input_rows !== undefined && (
                  <div className="step-stats-inline">
                    <Tooltip title="Input rows → Output rows">
                      <span className="stat-badge">
                        {step.input_rows} → {step.output_rows}
                      </span>
                    </Tooltip>
                    {step.execution_time_ms && (
                      <Tooltip title="Execution time">
                        <span className="stat-time">
                          {step.execution_time_ms}ms
                        </span>
                      </Tooltip>
                    )}
                  </div>
                )}

                <div className="step-expand-arrow">
                  {expandedSteps.has(step.step_number) ? '▼' : '▶'}
                </div>
              </div>

              {expandedSteps.has(step.step_number) && (
                <div className="step-details">
                  {step.parameters && (
                    <div className="details-section">
                      <h5>Parameters</h5>
                      <pre className="params-display">
                        {JSON.stringify(step.parameters, null, 2)}
                      </pre>
                    </div>
                  )}

                  {step.status === 'completed' && (
                    <div className="details-section stats-section">
                      <h5>Statistics</h5>
                      <div className="stats-grid">
                        <div className="stat-item">
                          <span className="stat-label">Input Rows</span>
                          <span className="stat-value">{step.input_rows}</span>
                        </div>
                        <div className="stat-item">
                          <span className="stat-label">Output Rows</span>
                          <span className="stat-value">{step.output_rows}</span>
                        </div>
                        {step.execution_time_ms && (
                          <div className="stat-item">
                            <span className="stat-label">Time (ms)</span>
                            <span className="stat-value">
                              {step.execution_time_ms}
                            </span>
                          </div>
                        )}
                        {step.input_rows && step.output_rows && (
                          <div className="stat-item">
                            <span className="stat-label">Change</span>
                            <span className="stat-value">
                              {Math.round(
                                ((step.output_rows - step.input_rows) /
                                  step.input_rows) *
                                  100
                              )}
                              %
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {step.status === 'failed' && step.error_details && (
                    <div className="details-section error-section">
                      <h5>Error</h5>
                      <div className="error-details">
                        <p>{step.error_details}</p>
                      </div>
                    </div>
                  )}

                  <div className="step-actions">
                    <Space wrap>
                      {onEdit && (
                        <Tooltip title="Edit parameters">
                          <Button
                            type="text"
                            size="small"
                            icon={<SettingOutlined />}
                            onClick={() => onEdit(step.step_number)}
                          >
                            Edit
                          </Button>
                        </Tooltip>
                      )}

                      {onRollback && step.status === 'completed' && (
                        <Tooltip title="Rollback to this step">
                          <Button
                            type="text"
                            size="small"
                            icon={<UndoOutlined />}
                            onClick={() => onRollback(step.step_number)}
                          >
                            Rollback
                          </Button>
                        </Tooltip>
                      )}

                      {onDelete && (
                        <Tooltip title="Delete this step">
                          <Button
                            type="text"
                            size="small"
                            danger
                            icon={<DeleteOutlined />}
                            onClick={() => onDelete(step.step_number)}
                          >
                            Delete
                          </Button>
                        </Tooltip>
                      )}
                    </Space>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {steps.some((s) => s.status === 'failed') && (
          <div className="steps-footer warning">
            ⚠️ Some steps failed. Review errors and adjust parameters.
          </div>
        )}
      </Card>
    </div>
  );
};

export default StepsPanel;
