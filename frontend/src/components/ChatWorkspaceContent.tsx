import React, { useState, useCallback, useEffect } from 'react';
import { Layout, Table, Breadcrumb, Button, Tooltip, Alert, message, Tour } from 'antd';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import ChatInterface from './ChatInterface';
import StepsPanel from './StepsPanel';
import { CommandRibbon } from './CommandRibbon';
import { WorkspaceHeaderActions } from './WorkspaceHeaderActions';
import { invalidateAnalyticsCache } from '../api';

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
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [stepsCollapsed, setStepsCollapsed] = useState(true);
  const [steps, setSteps] = useState<any[]>([]);
  const [datasetRows, setDatasetRows] = useState<any[]>([]);
  const [datasetColumns, setDatasetColumns] = useState<any[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [saveState, setSaveState] = useState<'saved' | 'syncing' | 'recovered'>('saved');
  const [dataVersion, setDataVersion] = useState(0);
  const [lastExecutionDataVersion, setLastExecutionDataVersion] = useState(0);
  const [tourOpen, setTourOpen] = useState(false);
  const [tourReady, setTourReady] = useState(false);
  const [headerRef, setHeaderRef] = useState<HTMLDivElement | null>(null);
  const [tableRef, setTableRef] = useState<HTMLDivElement | null>(null);
  const [stepsRef, setStepsRef] = useState<HTMLDivElement | null>(null);

  const workspaceKey = `${workspace?.id || 'workspace'}:${project?.id || 'project'}`;
  const uiStateKey = `workspace-ui-state:${workspaceKey}`;
  const onboardKey = `workspace-onboarding-seen:${workspaceKey}`;

  useEffect(() => {
    try {
      const saved = localStorage.getItem(uiStateKey);
      if (!saved) return;
      const parsed = JSON.parse(saved);
      if (typeof parsed.chatCollapsed === 'boolean') setChatCollapsed(parsed.chatCollapsed);
      if (typeof parsed.stepsCollapsed === 'boolean') setStepsCollapsed(parsed.stepsCollapsed);
      setSaveState('recovered');
      const timer = setTimeout(() => setSaveState('saved'), 1200);
      return () => clearTimeout(timer);
    } catch {
      return;
    }
  }, [uiStateKey]);

  useEffect(() => {
    if (!tourReady) return;
    const seen = localStorage.getItem(onboardKey) === 'true';
    if (!seen) {
      setTourOpen(true);
    }
  }, [tourReady, onboardKey]);

  useEffect(() => {
    setSaveState('syncing');
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(
          uiStateKey,
          JSON.stringify({
            chatCollapsed,
            stepsCollapsed,
          })
        );
      } catch {
      }
      setSaveState('saved');
    }, 250);
    return () => clearTimeout(timer);
  }, [chatCollapsed, stepsCollapsed, uiStateKey]);

  useEffect(() => {
    if (headerRef && tableRef && stepsRef) {
      setTourReady(true);
    }
  }, [headerRef, tableRef, stepsRef]);

  // Simulate loading dataset
  useEffect(() => {
    setSessionId(undefined);
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

  }, [dataset?.id]);

  const handleStepsUpdate = useCallback((newSteps: any[]) => {
    setSteps(newSteps);
    if (newSteps.length > 0) {
      setLastExecutionDataVersion(dataVersion);
    }
  }, [dataVersion]);

  const handleExportData = () => {
    message.success('Data exported successfully');
  };

  const handleSavePipeline = async () => {
    try {
      setSaveState('syncing');
      // API call to save pipeline
      setTimeout(() => setSaveState('saved'), 300);
      message.success('Pipeline saved successfully');
    } catch (error) {
      setSaveState('saved');
      message.error('Failed to save pipeline');
    }
  };

  const handleSharePipeline = () => {
    message.info('Share functionality coming soon');
  };

  const handleDataUpdate = (fileName: string) => {
    invalidateAnalyticsCache({
      datasetId: dataset?.id,
      workspaceId: workspace?.id,
    });
    setDataVersion((prev) => prev + 1);
    // Handle data update - chat context is silently updated
    // Previous chat history is preserved
    message.info(`Data updated: ${fileName}. Previous analysis history is preserved.`);
  };

  const isOutputStale = steps.length > 0 && dataVersion > lastExecutionDataVersion;

  const persistenceTag =
    saveState === 'syncing'
      ? { color: 'processing', label: 'Syncing' }
      : saveState === 'recovered'
        ? { color: 'gold', label: 'Recovered' }
        : { color: 'success', label: 'Saved' };

  const onboardingSteps = [
    {
      title: 'Stage 1: Direct actions',
      description: 'Use the command ribbon for import, actions, and quick operations.',
      target: () => headerRef as HTMLElement,
    },
    {
      title: 'Stage 2: Explore data',
      description: 'Review your dataset preview and validate rows before transformations.',
      target: () => tableRef as HTMLElement,
    },
    {
      title: 'Stage 3: Execute and track',
      description: 'Expand execution stages on the right to review steps, rollback, and refine.',
      target: () => stepsRef as HTMLElement,
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Tour
        open={tourOpen}
        onClose={() => {
          setTourOpen(false);
          localStorage.setItem(onboardKey, 'true');
        }}
        steps={onboardingSteps}
      />
      <CommandRibbon
        projectId={project?.id}
        workspaceId={workspace?.id}
        hasData={true}
        onImportComplete={handleDataUpdate}
        isCompact={false}
      />
      <Layout className="chat-workspace-layout" style={{ flex: 1 }}>
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
          onSessionCreated={(createdId) => {
            setSessionId(createdId);
            onSessionCreated?.(createdId);
          }}
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
        <div className="data-table-header" ref={setHeaderRef}>
          <div className="data-table-header-title">
            Stage 2: Explore Data • <strong>{dataset?.name || 'Untitled'}</strong> ({datasetRows.length} rows)
          </div>
          <div className="data-table-header-actions">
            <WorkspaceHeaderActions
              persistence={persistenceTag}
              onHelp={() => setTourOpen(true)}
              onExport={handleExportData}
              onSave={handleSavePipeline}
              onShare={handleSharePipeline}
            />
          </div>
        </div>

        <Breadcrumb className="project-breadcrumb">
          <Breadcrumb.Item>{workspace?.name}</Breadcrumb.Item>
          <Breadcrumb.Item>{project?.name}</Breadcrumb.Item>
          <Breadcrumb.Item>{dataset?.name}</Breadcrumb.Item>
        </Breadcrumb>

        {isOutputStale && (
          <div style={{ padding: '8px 16px' }}>
            <Alert
              type="warning"
              showIcon
              message="Upstream data changed"
              description="Execution stages may be stale. Re-run or update steps to refresh outputs against the latest dataset."
              action={
                <Button size="small" onClick={() => setLastExecutionDataVersion(dataVersion)}>
                  Mark reviewed
                </Button>
              }
            />
          </div>
        )}

        <div className="data-table-wrapper" ref={setTableRef}>
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
        <div ref={setStepsRef} style={{ marginBottom: '8px', textAlign: 'right' }}>
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
          title="Execution Stages"
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
    </div>
  );
};

export default ChatWorkspaceContent;
