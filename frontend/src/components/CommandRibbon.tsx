import React, { useState } from 'react';
import { Button, Space, Divider, Modal, Dropdown, MenuProps, Tag, Tooltip, message } from 'antd';
import {
  CloudUploadOutlined,
  DownloadOutlined,
  PlayCircleOutlined,
  SaveOutlined,
  ShareAltOutlined,
  ClockCircleOutlined,
  MoreOutlined,
} from '@ant-design/icons';
import { DataImportTab } from './DataImportTab';

interface CommandRibbonProps {
  projectId?: string;
  workspaceId?: string;
  hasData?: boolean;
  onDataImport?: () => void;
  onExport?: () => void;
  onRunPipeline?: () => void;
  onSavePipeline?: () => void;
  onShare?: () => void;
  onSchedule?: () => void;
  isCompact?: boolean;
  onImportComplete?: (selection: { datasetId: string; tableName: string }) => void;
}

export const CommandRibbon: React.FC<CommandRibbonProps> = ({
  projectId,
  workspaceId,
  hasData = false,
  onDataImport,
  onExport,
  onRunPipeline,
  onSavePipeline,
  onShare,
  onSchedule,
  isCompact = false,
  onImportComplete,
}) => {
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);

  const handleImportClick = () => {
    setImportModalOpen(true);
  };

  const handleImportComplete = (selection: { datasetId: string; tableName: string }) => {
    setImportModalOpen(false);
    message.success(`Data imported: ${selection.tableName}`);
    if (onImportComplete) {
      onImportComplete(selection);
    }
  };

  const handleExport = () => {
    if (onExport) {
      onExport();
    } else {
      message.info('Export functionality coming soon');
    }
  };

  const handleRunPipeline = () => {
    if (onRunPipeline) {
      onRunPipeline();
    } else {
      message.info('Run pipeline functionality coming soon');
    }
  };

  const handleSavePipeline = async () => {
    if (onSavePipeline) {
      onSavePipeline();
    } else {
      message.info('Save pipeline functionality coming soon');
    }
  };

  const handleShare = () => {
    setShareModalOpen(true);
  };

  const handleSchedule = () => {
    if (onSchedule) {
      onSchedule();
    } else {
      message.info('Schedule functionality coming soon');
    }
  };

  const moreMenuItems: MenuProps['items'] = [
    {
      key: 'schedule',
      icon: <ClockCircleOutlined />,
      label: 'Schedule Pipeline',
      onClick: handleSchedule,
    },
    {
      key: 'divider1',
      type: 'divider',
    },
    {
      key: 'settings',
      label: 'Pipeline Settings',
      onClick: () => message.info('Settings coming soon'),
    },
    {
      key: 'history',
      label: 'Execution History',
      onClick: () => message.info('History coming soon'),
    },
  ];

  const ribbonClasses = isCompact ? 'command-ribbon-compact' : 'command-ribbon';

  return (
    <>
      <div className={ribbonClasses}>
        <Space size={isCompact ? 'small' : 'middle'} wrap style={{ width: '100%' }}>
          {/* Data Operations Section */}
          <Space size={isCompact ? 4 : 8}>
            <Tooltip title={hasData ? 'Import new data file' : 'Import data to get started'}>
              <Button
                type={!hasData ? 'primary' : 'default'}
                icon={<CloudUploadOutlined />}
                onClick={handleImportClick}
                size={isCompact ? 'small' : 'middle'}
              >
                {!isCompact && 'Import'}
              </Button>
            </Tooltip>

            <Tooltip title="Export current data">
              <Button
                icon={<DownloadOutlined />}
                onClick={handleExport}
                disabled={!hasData}
                size={isCompact ? 'small' : 'middle'}
              >
                {!isCompact && 'Export'}
              </Button>
            </Tooltip>
          </Space>

          {hasData && (
            <>
              <Divider type="vertical" style={{ height: isCompact ? 20 : 30 }} />

              {/* Pipeline Operations Section */}
              <Space size={isCompact ? 4 : 8}>
                <Tooltip title="Execute the current pipeline">
                  <Button
                    type="primary"
                    icon={<PlayCircleOutlined />}
                    onClick={handleRunPipeline}
                    size={isCompact ? 'small' : 'middle'}
                  >
                    {!isCompact && 'Run'}
                  </Button>
                </Tooltip>

                <Tooltip title="Save current pipeline configuration">
                  <Button
                    icon={<SaveOutlined />}
                    onClick={handleSavePipeline}
                    size={isCompact ? 'small' : 'middle'}
                  >
                    {!isCompact && 'Save'}
                  </Button>
                </Tooltip>
              </Space>

              <Divider type="vertical" style={{ height: isCompact ? 20 : 30 }} />

              {/* Sharing & Collaboration Section */}
              <Space size={isCompact ? 4 : 8}>
                <Tooltip title="Share this workspace with team members">
                  <Button
                    icon={<ShareAltOutlined />}
                    onClick={handleShare}
                    size={isCompact ? 'small' : 'middle'}
                  >
                    {!isCompact && 'Share'}
                  </Button>
                </Tooltip>

                <Dropdown menu={{ items: moreMenuItems }} trigger={['click']}>
                  <Button
                    icon={<MoreOutlined />}
                    size={isCompact ? 'small' : 'middle'}
                  />
                </Dropdown>
              </Space>
            </>
          )}
        </Space>
      </div>

      {/* Import Data Modal */}
      <Modal
        title="Import Data"
        open={importModalOpen}
        onCancel={() => setImportModalOpen(false)}
        footer={null}
        width={700}
        bodyStyle={{ padding: 0 }}
      >
        <DataImportTab onImportComplete={handleImportComplete} />
      </Modal>

      {/* Share Modal */}
      <Modal
        title="Share Workspace"
        open={shareModalOpen}
        onCancel={() => setShareModalOpen(false)}
        footer={[
          <Button key="cancel" onClick={() => setShareModalOpen(false)}>
            Cancel
          </Button>,
          <Button key="share" type="primary" onClick={() => {
            message.success('Workspace shared successfully');
            setShareModalOpen(false);
          }}>
            Send Invites
          </Button>,
        ]}
        width={600}
      >
        <div style={{ padding: '20px 0' }}>
          <p style={{ marginBottom: '16px' }}>Share workspace ID</p>
          <input
            type="text"
            value={workspaceId || 'ws_1234567890'}
            readOnly
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid #d9d9d9',
              borderRadius: '4px',
              marginBottom: '20px',
            }}
          />

          <p style={{ marginBottom: '16px' }}>Invite team members</p>
          <input
            type="email"
            placeholder="Enter email address"
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid #d9d9d9',
              borderRadius: '4px',
            }}
          />
        </div>
      </Modal>
    </>
  );
};

export default CommandRibbon;
