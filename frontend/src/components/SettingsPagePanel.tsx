import {
  Avatar,
  Badge,
  Button,
  Card,
  Checkbox,
  Collapse,
  Divider,
  Input,
  List,
  Modal,
  Progress,
  Radio,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
} from "antd";
import {
  CopyOutlined,
  KeyOutlined,
  LockOutlined,
  SafetyCertificateOutlined,
  SearchOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import { useEffect, useMemo, useState } from "react";
import { notify } from "../utils/notify";
import { PaymentSubscriptionPanel } from "./PaymentSubscriptionPanel";

const { Text, Title } = Typography;

type Session = {
  id: string;
  device: string;
  location: string;
  lastActive: string;
  current: boolean;
};

type LoginHistory = {
  id: string;
  date: string;
  device: string;
  location: string;
  ip: string;
  status: "Success" | "Failed";
};

type TeamMember = {
  id: string;
  name: string;
  email: string;
  role: "Owner" | "Admin" | "Editor" | "Viewer";
  lastActive: string;
};

type ApiKey = {
  id: string;
  name: string;
  key: string;
  created: string;
  lastUsed: string;
  scopes: string[];
};

type Integration = {
  id: string;
  name: string;
  status: "Connected" | "Available";
  lastSync?: string;
};

const TIMEZONES = [
  "Auto-detect",
  "America/Los_Angeles",
  "America/New_York",
  "Europe/London",
  "Asia/Kolkata",
  "Asia/Singapore",
];

const SESSIONS: Session[] = [
  { id: "s1", device: "Chrome on Mac", location: "San Francisco, CA", lastActive: "2 min ago", current: true },
  { id: "s2", device: "Safari on iPhone", location: "San Francisco, CA", lastActive: "1 hour ago", current: false },
];

const LOGIN_HISTORY: LoginHistory[] = Array.from({ length: 10 }).map((_, index) => ({
  id: `l${index}`,
  date: `Feb ${index + 1}, 2026 · 09:${index}0 AM`,
  device: index % 2 === 0 ? "Chrome" : "Edge",
  location: index % 2 === 0 ? "San Francisco" : "New York",
  ip: `192.168.1.${index + 10}`,
  status: index % 3 === 0 ? "Failed" : "Success",
}));

const TEAM_MEMBERS: TeamMember[] = [
  { id: "t1", name: "Sarah", email: "sarah@acme.com", role: "Owner", lastActive: "2 min ago" },
  { id: "t2", name: "John", email: "john@acme.com", role: "Admin", lastActive: "1 hour ago" },
  { id: "t3", name: "Alice", email: "alice@acme.com", role: "Editor", lastActive: "Yesterday" },
];

const API_KEYS: ApiKey[] = [
  { id: "k1", name: "Prod ETL", key: "sk_live_1234abcd", created: "Jan 15, 2026", lastUsed: "1 hour ago", scopes: ["read", "write"] },
  { id: "k2", name: "CI Token", key: "sk_test_5678efgh", created: "Dec 02, 2025", lastUsed: "Yesterday", scopes: ["read"] },
];

const INTEGRATIONS: Integration[] = [
  { id: "slack", name: "Slack", status: "Connected", lastSync: "5 min ago" },
  { id: "sheets", name: "Google Sheets", status: "Available" },
  { id: "salesforce", name: "Salesforce", status: "Available" },
  { id: "stripe", name: "Stripe", status: "Connected", lastSync: "1 day ago" },
  { id: "zapier", name: "Zapier", status: "Available" },
  { id: "webhooks", name: "Webhooks", status: "Connected", lastSync: "3 hours ago" },
];

export function SettingsPagePanel() {
  const [activeTab, setActiveTab] = useState("profile");
  const [dirty, setDirty] = useState(false);
  const [twoFAOpen, setTwoFAOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [apiKeyOpen, setApiKeyOpen] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [showKeyId, setShowKeyId] = useState<string | null>(null);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (dirty) {
          notify.success("Changes saved");
          setDirty(false);
        }
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        notify.info("Search settings");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [dirty]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  const maskedKey = (key: string) => `${key.slice(0, 4)}••••••${key.slice(-4)}`;

  const profileContent = (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Card className="settings-card" title="Profile">
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          <div className="avatar-row">
            <Avatar size={80} src={avatarPreview || undefined}>
              JS
            </Avatar>
            <Space>
              <Button icon={<UploadOutlined />} onClick={() => setAvatarPreview("https://i.pravatar.cc/80")}>Change Photo</Button>
              <Button onClick={() => setAvatarPreview(null)}>Remove Photo</Button>
            </Space>
          </div>
          <div className="settings-grid">
            <Input placeholder="Full name" defaultValue="Jordan Smith" onChange={() => setDirty(true)} />
            <Input placeholder="Email" defaultValue="jordan@acme.com" onChange={() => setDirty(true)} />
            <Input placeholder="Job title" defaultValue="Analytics Lead" onChange={() => setDirty(true)} />
            <Input placeholder="Company" defaultValue="Acme Inc" onChange={() => setDirty(true)} />
            <Input placeholder="Phone" onChange={() => setDirty(true)} />
            <Select
              placeholder="Timezone"
              defaultValue="Auto-detect"
              options={TIMEZONES.map((tz) => ({ label: tz, value: tz }))}
              onChange={() => setDirty(true)}
            />
            <Select
              placeholder="Language"
              defaultValue="English"
              options={["English", "Spanish", "German"].map((lang) => ({ label: lang, value: lang }))}
              onChange={() => setDirty(true)}
            />
          </div>
          <Tag color="green">Email verified</Tag>
        </Space>
      </Card>
    </Space>
  );

  const securityContent = (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Card className="settings-card" title="Password">
        <Space direction="vertical" style={{ width: "100%" }}>
          <Input.Password placeholder="Current password" onChange={() => setDirty(true)} />
          <Input.Password placeholder="New password" onChange={() => setDirty(true)} />
          <Input.Password placeholder="Confirm password" onChange={() => setDirty(true)} />
          <Progress percent={72} status="active" />
          <Button type="primary">Update Password</Button>
        </Space>
      </Card>

      <Card className="settings-card" title="Two-Factor Authentication">
        <Space direction="vertical" style={{ width: "100%" }}>
          <Badge status="success" text="Enabled since Jan 15, 2026" />
          <Space>
            <Button onClick={() => setTwoFAOpen(true)}>Disable 2FA</Button>
            <Button>Regenerate Backup Codes</Button>
          </Space>
        </Space>
      </Card>

      <Card className="settings-card" title="Sessions">
        <List
          dataSource={SESSIONS}
          renderItem={(session: Session) => (
            <List.Item
              actions={[
                session.current ? <Tag color="blue">Current</Tag> : <Button size="small">Revoke</Button>,
              ]}
            >
              <List.Item.Meta
                title={session.device}
                description={`${session.location} · ${session.lastActive}`}
              />
            </List.Item>
          )}
        />
        <Button>Sign out all other sessions</Button>
      </Card>

      <Card className="settings-card" title="Login history">
        <Table
          dataSource={LOGIN_HISTORY}
          columns={[
            { title: "Date", dataIndex: "date" },
            { title: "Device", dataIndex: "device" },
            { title: "Location", dataIndex: "location" },
            { title: "IP", dataIndex: "ip" },
            { title: "Status", dataIndex: "status" },
          ]}
          size="small"
          pagination={{ pageSize: 5 }}
        />
      </Card>
    </Space>
  );

  const workspaceContent = (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Card className="settings-card" title="General">
        <Space direction="vertical" style={{ width: "100%" }}>
          <Input placeholder="Workspace name" defaultValue="Growth Team" onChange={() => setDirty(true)} />
          <Input.TextArea placeholder="Description" onChange={() => setDirty(true)} />
          <Input placeholder="Icon/Color" onChange={() => setDirty(true)} />
          <Select placeholder="Default language" defaultValue="English" options={["English", "French"].map((item) => ({ label: item, value: item }))} />
          <Select placeholder="Timezone" defaultValue="Auto-detect" options={TIMEZONES.map((tz) => ({ label: tz, value: tz }))} />
        </Space>
      </Card>
      <Card className="settings-card" title="Defaults">
        <Space direction="vertical" style={{ width: "100%" }}>
          <Select placeholder="New project permissions" defaultValue="Team" options={["Private", "Team"].map((item) => ({ label: item, value: item }))} />
          <Select placeholder="Data retention" defaultValue="180 days" options={["30 days", "90 days", "180 days"].map((item) => ({ label: item, value: item }))} />
          <Select placeholder="Auto-save interval" defaultValue="5 min" options={["1 min", "5 min", "10 min"].map((item) => ({ label: item, value: item }))} />
        </Space>
      </Card>
      <Card className="settings-card" title="Branding (Business+)">
        <Space direction="vertical" style={{ width: "100%" }}>
          <Button icon={<UploadOutlined />}>Upload logo</Button>
          <Input placeholder="Primary color" />
          <Input placeholder="Custom domain" />
          <Button>Preview</Button>
        </Space>
      </Card>
      <Card className="settings-card" title="Advanced">
        <Space direction="vertical" style={{ width: "100%" }}>
          <Input value="ws_123456" readOnly suffix={<Button icon={<CopyOutlined />} />} />
          <Text type="secondary">Created Feb 1, 2026</Text>
          <Button>Export Workspace Data</Button>
          <Divider />
          <Button danger>Transfer Ownership</Button>
          <Button danger icon={<LockOutlined />}>Delete Workspace</Button>
        </Space>
      </Card>
    </Space>
  );

  const teamContent = (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Card className="settings-card" title="Members">
        <Table
          dataSource={TEAM_MEMBERS}
          columns={[
            {
              title: "Member",
              render: (_, row) => (
                <Space>
                  <Avatar>{row.name.slice(0, 1)}</Avatar>
                  <div>
                    <Text strong>{row.name}</Text>
                    <Text type="secondary">{row.email}</Text>
                  </div>
                </Space>
              ),
            },
            {
              title: "Role",
              render: (_, row) => (
                <Select
                  defaultValue={row.role}
                  options={["Owner", "Admin", "Editor", "Viewer"].map((role) => ({ label: role, value: role }))}
                  onChange={() => setDirty(true)}
                />
              ),
            },
            { title: "Last active", dataIndex: "lastActive" },
            { title: "Actions", render: () => <Button size="small">Remove</Button> },
          ]}
          pagination={false}
        />
        <Button type="primary" icon={<UploadOutlined />} onClick={() => setInviteOpen(true)}>
          Invite Members
        </Button>
      </Card>
      <Card className="settings-card" title="Roles & Permissions (Business+)">
        <Space direction="vertical" style={{ width: "100%" }}>
          <Input placeholder="Role name" />
          <Divider />
          <Text type="secondary">Data Import</Text>
          <Checkbox.Group options={["View", "Create", "Edit", "Delete"]} />
          <Text type="secondary">Dashboards</Text>
          <Checkbox.Group options={["View", "Create", "Edit", "Delete"]} />
          <Text type="secondary">ML Models</Text>
          <Checkbox.Group options={["View", "Train", "Deploy"]} />
          <Button type="primary">Create Role</Button>
        </Space>
      </Card>
    </Space>
  );

  const integrationsContent = (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <div className="integration-grid">
        {INTEGRATIONS.map((integration) => (
          <Card key={integration.id} className="settings-card" hoverable>
            <Space direction="vertical">
              <Title level={5}>{integration.name}</Title>
              <Tag color={integration.status === "Connected" ? "green" : "default"}>
                {integration.status}
              </Tag>
              {integration.lastSync && <Text type="secondary">Last synced {integration.lastSync}</Text>}
              <Space>
                <Button type={integration.status === "Connected" ? "default" : "primary"}>
                  {integration.status === "Connected" ? "Disconnect" : "Connect"}
                </Button>
                {integration.status === "Connected" && <Button>Configure</Button>}
              </Space>
            </Space>
          </Card>
        ))}
      </div>
      <Card className="settings-card" title="Webhook configuration">
        <Space direction="vertical" style={{ width: "100%" }}>
          <Input placeholder="Webhook URL" />
          <Select
            mode="multiple"
            placeholder="Events"
            options={["Dataset uploaded", "Model trained", "Dashboard shared"].map((event) => ({ label: event, value: event }))}
          />
          <Input placeholder="Secret key" value="whsec_1234" />
          <Button>Test webhook</Button>
          <Table
            dataSource={[{ key: 1, event: "Model trained", status: "200 OK" }]}
            columns={[
              { title: "Event", dataIndex: "event" },
              { title: "Status", dataIndex: "status" },
            ]}
            pagination={false}
            size="small"
          />
        </Space>
      </Card>
    </Space>
  );

  const notificationsContent = (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Card className="settings-card" title="Email notifications">
        <Collapse
          defaultActiveKey={["account", "workspace"]}
          items={[
            {
              key: "account",
              label: "Account Activity",
              children: <Checkbox.Group options={["Login from new device", "Password changed", "2FA disabled"]} />,
            },
            {
              key: "workspace",
              label: "Workspace Updates",
              children: <Checkbox.Group options={["Added to workspace", "Role changed", "Member joined"]} />,
            },
            {
              key: "data",
              label: "Data Events",
              children: <Checkbox.Group options={["Dataset imported", "Data quality issues detected", "Scheduled import failed"]} />,
            },
            {
              key: "ml",
              label: "ML Events",
              children: <Checkbox.Group options={["Model training complete", "Model deployed", "Prediction drift detected"]} />,
            },
            {
              key: "billing",
              label: "Billing",
              children: <Checkbox.Group options={["Payment succeeded", "Payment failed", "Trial expiring", "Usage limit warning"]} />,
            },
          ]}
        />
      </Card>
      <Card className="settings-card" title="In-app notifications">
        <Switch defaultChecked />
        <Text type="secondary">Enable desktop notifications</Text>
      </Card>
      <Card className="settings-card" title="Digest settings">
        <Space direction="vertical">
          <Switch defaultChecked />
          <Text type="secondary">Daily summary</Text>
          <Switch />
          <Text type="secondary">Weekly report</Text>
          <Select placeholder="Send time" options={["8 AM", "10 AM", "4 PM"].map((time) => ({ label: time, value: time }))} />
        </Space>
      </Card>
      <Card className="settings-card" title="Do not disturb">
        <Space direction="vertical">
          <Select mode="multiple" placeholder="Days" options={["Mon", "Tue", "Wed", "Thu", "Fri"].map((day) => ({ label: day, value: day }))} />
          <Input placeholder="Quiet hours (e.g. 10pm - 6am)" />
        </Space>
      </Card>
    </Space>
  );

  const apiKeysContent = (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Card className="settings-card" title="API Keys">
        <Space direction="vertical" style={{ width: "100%" }}>
          <Text type="secondary">Use API keys to automate integrations securely.</Text>
          <Button type="primary" icon={<KeyOutlined />} onClick={() => setApiKeyOpen(true)}>
            Generate New Key
          </Button>
          <Table
            dataSource={API_KEYS}
            columns={[
              { title: "Name", dataIndex: "name" },
              {
                title: "Key",
                render: (_, row) => (
                  <Button type="link" onClick={() => setShowKeyId(showKeyId === row.id ? null : row.id)}>
                    {showKeyId === row.id ? row.key : maskedKey(row.key)}
                  </Button>
                ),
              },
              { title: "Created", dataIndex: "created" },
              { title: "Last used", dataIndex: "lastUsed" },
              { title: "Scopes", render: (_, row) => row.scopes.join(", ") },
              {
                title: "Actions",
                render: () => (
                  <Space>
                    <Button size="small" icon={<CopyOutlined />}>Copy</Button>
                    <Button size="small">Regenerate</Button>
                    <Button size="small" danger>Delete</Button>
                  </Space>
                ),
              },
            ]}
            pagination={false}
          />
          <Text type="secondary">Rate limit: 1,523 / 10,000 calls this month</Text>
          <Button type="link">API documentation</Button>
        </Space>
      </Card>
    </Space>
  );

  const dataPrivacyContent = (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Card className="settings-card" title="Data export">
        <Space direction="vertical">
          <Button type="primary">Export All Data</Button>
          <Select placeholder="Format" options={["JSON", "CSV"].map((item) => ({ label: item, value: item }))} />
          <Checkbox.Group options={["datasets", "dashboards", "models", "settings"]} />
          <Text type="secondary">Email when ready</Text>
        </Space>
      </Card>
      <Card className="settings-card" title="Data retention">
        <Space direction="vertical">
          <Select placeholder="Keep deleted items for" defaultValue="30 days" options={["30 days", "60 days", "90 days"].map((item) => ({ label: item, value: item }))} />
          <Button danger>Permanently delete now</Button>
        </Space>
      </Card>
      <Card className="settings-card" title="Privacy settings">
        <Space direction="vertical">
          <Switch defaultChecked />
          <Text type="secondary">Allow usage analytics</Text>
          <Switch />
          <Text type="secondary">Share crash reports</Text>
          <Switch defaultChecked />
          <Text type="secondary">Product announcements</Text>
        </Space>
      </Card>
      <Card className="settings-card" title="Compliance">
        <Space direction="vertical">
          <Button>GDPR data request</Button>
          <Button>CCPA opt-out</Button>
          <Button type="link">Privacy policy</Button>
          <Button type="link">Terms of service</Button>
        </Space>
      </Card>
      <Card className="settings-card" title="Delete account">
        <Space direction="vertical">
          <Text type="secondary">Requires workspace transfer or deletion.</Text>
          <Input.Password placeholder="Confirm password" />
          <Select placeholder="Reason" options={["Too expensive", "Missing features", "Other"].map((item) => ({ label: item, value: item }))} />
          <Input placeholder='Type "DELETE" to confirm' />
          <Button danger>Delete Account</Button>
        </Space>
      </Card>
    </Space>
  );

  return (
    <div className="settings-root">
      <Tabs
        tabPosition="left"
        activeKey={activeTab}
        onChange={setActiveTab}
        className="settings-tabs"
        items={[
          { key: "profile", label: "Profile", children: profileContent },
          { key: "security", label: "Account Security", children: securityContent },
          { key: "workspace", label: "Workspace Settings", children: workspaceContent },
          { key: "billing", label: "Billing", children: <PaymentSubscriptionPanel /> },
          { key: "team", label: "Team & Permissions", children: teamContent },
          { key: "integrations", label: "Integrations", children: integrationsContent },
          { key: "notifications", label: "Notifications", children: notificationsContent },
          { key: "api", label: "API Keys", children: apiKeysContent },
          { key: "privacy", label: "Data & Privacy", children: dataPrivacyContent },
        ]}
      />

      {dirty && (
        <div className="settings-save-bar">
          <Text>Changes pending</Text>
          <Button type="primary" onClick={() => { notify.success("Settings saved"); setDirty(false); }}>
            Save Changes
          </Button>
        </div>
      )}

      <Modal
        title="Enable Two-Factor Authentication"
        open={twoFAOpen}
        onCancel={() => setTwoFAOpen(false)}
        onOk={() => { setTwoFAOpen(false); notify.success("2FA updated"); }}
      >
        <Space direction="vertical" style={{ width: "100%" }}>
          <div className="qr-placeholder">QR</div>
          <Input value="ABCD-EFGH-IJKL" readOnly />
          <Input placeholder="Verification code" />
          <Button icon={<SafetyCertificateOutlined />}>Download backup codes</Button>
        </Space>
      </Modal>

      <Modal
        title="Invite Members"
        open={inviteOpen}
        onCancel={() => setInviteOpen(false)}
        onOk={() => { setInviteOpen(false); notify.success("Invites sent"); }}
      >
        <Space direction="vertical" style={{ width: "100%" }}>
          <Input placeholder="Emails" />
          <Select placeholder="Role" options={["Editor", "Viewer", "Admin"].map((role) => ({ label: role, value: role }))} />
          <Input.TextArea placeholder="Message" />
        </Space>
      </Modal>

      <Modal
        title="Generate API Key"
        open={apiKeyOpen}
        onCancel={() => setApiKeyOpen(false)}
        onOk={() => { setApiKeyOpen(false); notify.success("API key generated"); }}
      >
        <Space direction="vertical" style={{ width: "100%" }}>
          <Input placeholder="Key name" />
          <Checkbox.Group options={["Read datasets", "Write datasets", "Train models", "Create dashboards"]} />
          <Select placeholder="Expiration" options={["Never", "30 days", "90 days", "365 days"].map((item) => ({ label: item, value: item }))} />
        </Space>
      </Modal>
    </div>
  );
}
