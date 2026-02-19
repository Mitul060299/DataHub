import React, { useState, useCallback, useEffect } from 'react';
import { Layout, Table, Breadcrumb, Button, Space, Tooltip, message } from 'antd';
import { LeftOutlined, RightOutlined, SaveOutlined, ShareAltOutlined, DownloadOutlined } from '@ant-design/icons';
import ChatInterface from './ChatInterface';
import StepsPanel from './StepsPanel';

const { Content, Sider } = Layout;

export interface ChatWorkspaceContentProps {
  workspace?: any;
  project?: any;
  dataset?: any;
  userPlan?: 'free' | 'professional' | 'team' | 'business' | 'enterprise';
  onSessionCreated?: (sessionId: string) => void;
}

export const ChatWorkspaceContent: React.FC<ChatWorkspaceContentProps> = ({
  workspace,
  project,
  dataset,
  userPlan = 'free',
  onSessionCreated,
}) => {
  const [sessionId] = useState<string>(() => `session_${Date.now()}`);
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [stepsCollapsed, setStepsCollapsed] = useState(false);
  const [steps, setSteps] = useState<any[]>([]);
  const [datasetRows, setDatasetRows] = useState<any[]>([]);
  const [datasetColumns, setDatasetColumns] = useState<any[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);

  // Simulate loading dataset
  useEffect(() => {
    setIsLoadingData(true);
    // Mock data loading - in real app, fetch from API
    setTimeout(() => {
      setDatasetColumns([
        { title: 'ID', dataIndex: 'id', key: 'id', width: 80 },
        { title: 'Name', dataIndex: 'name', key: 'name', width: 150 },
        { title: 'Email', dataIndex: 'email', key: 'email', width: 200 },
        { title: 'Age', dataIndex: 'age', key: 'age', width: 80 },
        { title: 'City', dataIndex: 'city', key: 'city', width: 120 },
      ]);

      setDatasetRows([
        {
          id: 1,
          name: 'John Doe',
          email: 'john@example.com',
          age: 28,
          city: 'New York',
        },
        {
          id: 2,
          name: 'Jane Smith',
          email: 'jane@example.com',
          age: 34,
          city: 'San Francisco',
        },
        {
          id: 3,
          name: 'Bob Johnson',
          email: 'bob@example.com',
          age: 45,
          city: 'Chicago',
        },
        {
          id: 4,
          name: 'Alice Williams',
          email: 'alice@example.com',
          age: 29,
          city: 'Boston',
        },
        {
          id: 5,
          name: 'Charlie Brown',
          email: 'charlie@example.com',
          age: 52,
          city: 'Seattle',
        },
      ]);

      setIsLoadingData(false);
    }, 500);

    if (onSessionCreated) {
      onSessionCreated(sessionId);
    }
  }, [dataset?.id, sessionId, onSessionCreated]);

  const handleStepsUpdate = useCallback((newSteps: any[]) => {
    setSteps(newSteps);
  }, []);

  const handleExportData = () => {
    message.success('Data exported successfully');
  };

  const handleSavePipeline = async () => {
    try {
      // API call to save pipeline
      message.success('Pipeline saved successfully');
    } catch (error) {
      message.error('Failed to save pipeline');
    }
  };

  const handleSharePipeline = () => {
    message.info('Share functionality coming soon');
  };

  return (
    <Layout className="chat-workspace-layout">
      {/* Left Sidebar - Chat Interface */}
      <Sider
        width={400}
        className={`chat-sidebar ${chatCollapsed ? 'collapsed' : ''}`}
        trigger={null}
        collapsible
        collapsed={chatCollapsed}
        style={{ overflow: 'hidden' }}
      >
        <ChatInterface
          sessionId={sessionId}
          datasetId={dataset?.id || 'default'}
          userPlan={userPlan}
          onSessionUpdated={handleStepsUpdate}
        />
      </Sider>

      {/* Chat Toggle Button */}
      <Tooltip title={chatCollapsed ? 'Show Chat' : 'Hide Chat'}>
        <Button
          type="text"
          className="chat-toggle-btn"
          icon={chatCollapsed ? <RightOutlined /> : <LeftOutlined />}
          onClick={() => setChatCollapsed(!chatCollapsed)}
        />
      </Tooltip>

      {/* Center - Data Table View */}
      <Content className="center-workspace">
        <div className="data-table-header">
          <div className="data-table-header-title">
            Dataset: <strong>{dataset?.name || 'Untitled'}</strong> ({datasetRows.length} rows)
          </div>
          <div className="data-table-header-actions">
            <Space>
              <Button
                size="small"
                icon={<DownloadOutlined />}
                onClick={handleExportData}
                title="Download as CSV"
              >
                Export
              </Button>
              <Button
                size="small"
                icon={<SaveOutlined />}
                onClick={handleSavePipeline}
                title="Save as pipeline"
              >
                Save
              </Button>
              <Button
                size="small"
                icon={<ShareAltOutlined />}
                onClick={handleSharePipeline}
                title="Share pipeline"
              >
                Share
              </Button>
            </Space>
          </div>
        </div>

        <Breadcrumb className="project-breadcrumb">
          <Breadcrumb.Item>{workspace?.name}</Breadcrumb.Item>
          <Breadcrumb.Item>{project?.name}</Breadcrumb.Item>
          <Breadcrumb.Item>{dataset?.name}</Breadcrumb.Item>
        </Breadcrumb>

        <div className="data-table-wrapper">
          <Table
            columns={datasetColumns}
            dataSource={datasetRows}
            pagination={{
              pageSize: 10,
              showSizeChanger: true,
              showTotal: (total) => `Total ${total} rows`,
            }}
            loading={isLoadingData}
            rowKey="id"
            size="small"
            scroll={{ x: 1200 }}
          />
        </div>
      </Content>

      {/* Right Sidebar - Steps Panel */}
      <Sider
        width={320}
        className={`steps-sidebar ${stepsCollapsed ? 'collapsed' : ''}`}
        trigger={null}
        collapsible
        collapsed={stepsCollapsed}
        style={{ overflow: stepsCollapsed ? 'hidden' : 'auto', padding: stepsCollapsed ? 0 : 16 }}
      >
        <div style={{ marginBottom: '8px', textAlign: 'right' }}>
          <Tooltip title={stepsCollapsed ? 'Show Steps' : 'Hide Steps'}>
            <Button
              type="text"
              size="small"
              icon={stepsCollapsed ? <LeftOutlined /> : <RightOutlined />}
              onClick={() => setStepsCollapsed(!stepsCollapsed)}
            />
          </Tooltip>
        </div>

        <StepsPanel
          steps={steps}
          onRollback={(stepNum) => {
            message.info(`Rollback to step ${stepNum}`);
            // API call to rollback
          }}
          onDelete={(stepNum) => {
            setSteps((prev) => prev.filter((s) => s.step_number !== stepNum));
            message.success(`Step ${stepNum} deleted`);
          }}
          onEdit={(stepNum) => {
            message.info(`Edit step ${stepNum}`);
            // Open edit modal
          }}
        />
      </Sider>
    </Layout>
  );
};

export default ChatWorkspaceContent;
