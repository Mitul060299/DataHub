import {
  Avatar,
  Badge,
  Button,
  Card,
  Checkbox,
  Collapse,
  Divider,
  Dropdown,
  Input,
  List,
  Modal,
  Progress,
  Select,
  Space,
  Switch,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import {
  BellOutlined,
  CrownOutlined,
  DeleteOutlined,
  DownOutlined,
  EditOutlined,
  EllipsisOutlined,
  FolderOpenOutlined,
  PlusOutlined,
  SearchOutlined,
  SettingOutlined,
  StarFilled,
  StarOutlined,
  TeamOutlined,
  UserAddOutlined,
} from "@ant-design/icons";
import { useEffect, useMemo, useState } from "react";
import { notify } from "../utils/notify";

const { Text, Title } = Typography;

type Workspace = {
  id: string;
  name: string;
  plan: "Free" | "Pro" | "Business";
  members: number;
  avatar: string;
};

type Project = {
  id: string;
  workspaceId: string;
  name: string;
  status: "Active" | "Archived";
  lastModified: string;
  datasets: number;
  dashboards: number;
  models: number;
  collaborators: string[];
  starred: boolean;
};

type Member = {
  id: string;
  name: string;
  role: "Owner" | "Admin" | "Editor" | "Viewer";
  online: boolean;
};

type Invite = {
  id: string;
  email: string;
  invitedBy: string;
  date: string;
};

type Activity = {
  id: string;
  text: string;
  time: string;
};

const WORKSPACES: Workspace[] = [
  { id: "personal", name: "Personal Workspace", plan: "Free", members: 1, avatar: "P" },
  { id: "growth", name: "Growth Team", plan: "Pro", members: 5, avatar: "G" },
  { id: "enterprise", name: "Enterprise Ops", plan: "Business", members: 12, avatar: "E" },
];

const PROJECTS: Project[] = [
  {
    id: "proj-1",
    workspaceId: "growth",
    name: "Q4 Revenue",
    status: "Active",
    lastModified: "2 hours ago",
    datasets: 3,
    dashboards: 2,
    models: 1,
    collaborators: ["AK", "SR", "JL", "TW"],
    starred: true,
  },
  {
    id: "proj-2",
    workspaceId: "growth",
    name: "Pipeline Health",
    status: "Active",
    lastModified: "1 day ago",
    datasets: 5,
    dashboards: 4,
    models: 0,
    collaborators: ["AK", "SR"],
    starred: false,
  },
  {
    id: "proj-3",
    workspaceId: "personal",
    name: "Customer Churn",
    status: "Archived",
    lastModified: "3 days ago",
    datasets: 2,
    dashboards: 1,
    models: 2,
    collaborators: ["ME"],
    starred: false,
  },
  {
    id: "proj-4",
    workspaceId: "enterprise",
    name: "Inventory Tracking",
    status: "Active",
    lastModified: "5 hours ago",
    datasets: 4,
    dashboards: 3,
    models: 1,
    collaborators: ["RA", "MS", "KT", "JP", "LW"],
    starred: true,
  },
];

const MEMBERS: Member[] = [
  { id: "m1", name: "Sarah", role: "Owner", online: true },
  { id: "m2", name: "John", role: "Admin", online: false },
  { id: "m3", name: "Alice", role: "Editor", online: true },
  { id: "m4", name: "You", role: "Viewer", online: true },
];

const INVITES: Invite[] = [
  { id: "i1", email: "michael@company.com", invitedBy: "Sarah", date: "Feb 2" },
];

const ACTIVITY: Activity[] = [
  { id: "a1", text: "Sarah uploaded sales_data.csv", time: "2 min ago" },
  { id: "a2", text: "John created Dashboard: Q4 Review", time: "1 hour ago" },
  { id: "a3", text: "Alice trained ML model: Churn Predictor", time: "3 hours ago" },
];

const TEMPLATE_OPTIONS = [
  "Blank",
  "Sales Analysis",
  "Customer Segmentation",
  "Financial Dashboard",
  "Inventory Tracking",
];

export function WorkspaceManagementPanel() {
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState(WORKSPACES[1].id);
  const [projects, setProjects] = useState<Project[]>(PROJECTS);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("recent");
  const [filterActive, setFilterActive] = useState(true);
  const [filterArchived, setFilterArchived] = useState(false);
  const [filterStarred, setFilterStarred] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [workspaceName, setWorkspaceName] = useState("");
  const [projectName, setProjectName] = useState("");
  const [projectTemplate, setProjectTemplate] = useState(TEMPLATE_OPTIONS[0]);

  const currentWorkspace = WORKSPACES.find((workspace) => workspace.id === currentWorkspaceId) || WORKSPACES[0];

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        notify.info("Search focused");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const filteredProjects = useMemo(() => {
    let next = projects.filter((project) => project.workspaceId === currentWorkspaceId);
    if (search.trim()) {
      next = next.filter((project) => project.name.toLowerCase().includes(search.toLowerCase()));
    }
    next = next.filter((project) => {
      if (project.status === "Active" && !filterActive) return false;
      if (project.status === "Archived" && !filterArchived) return false;
      if (filterStarred && !project.starred) return false;
      return true;
    });
    if (sortBy === "name") {
      next = [...next].sort((a, b) => a.name.localeCompare(b.name));
    }
    if (sortBy === "recent") {
      next = [...next];
    }
    return next;
  }, [projects, currentWorkspaceId, search, filterActive, filterArchived, filterStarred, sortBy]);

  const toggleStar = (id: string) => {
    setProjects((prev) => prev.map((project) => (project.id === id ? { ...project, starred: !project.starred } : project)));
  };

  const handleBulk = (action: "archive" | "delete") => {
    if (selectedProjects.length === 0) return;
    if (action === "delete") {
      setProjects((prev) => prev.filter((project) => !selectedProjects.includes(project.id)));
      setSelectedProjects([]);
      notify.success("Projects deleted");
      return;
    }
    setProjects((prev) =>
      prev.map((project) =>
        selectedProjects.includes(project.id) ? { ...project, status: "Archived" } : project
      )
    );
    notify.success("Projects archived");
  };

  const renderProjectCard = (project: Project) => (
    <Card
      key={project.id}
      className="workspace-project-card"
      hoverable
      actions={[
        <Button key="open" type="link" icon={<FolderOpenOutlined />}>
          Open
        </Button>,
      ]}
    >
      <div className="project-card-header">
        <Space>
          <div className="project-icon">{project.name.slice(0, 1)}</div>
          <div>
            <Text strong>{project.name}</Text>
            <Text type="secondary">Last modified {project.lastModified}</Text>
          </div>
        </Space>
        <Space>
          <Tag color={project.status === "Active" ? "green" : "default"}>{project.status}</Tag>
          <Button type="text" icon={project.starred ? <StarFilled /> : <StarOutlined />} onClick={() => toggleStar(project.id)} />
          <Dropdown
            menu={{
              items: [
                { key: "edit", label: "Edit" },
                { key: "duplicate", label: "Duplicate" },
                { key: "archive", label: "Archive" },
                { key: "delete", label: "Delete" },
              ],
              onClick: ({ key }) => notify.info(`Action: ${key}`),
            }}
          >
            <Button type="text" icon={<EllipsisOutlined />} />
          </Dropdown>
        </Space>
      </div>
      <Divider />
      <div className="project-stats">
        <span>{project.datasets} datasets</span>
        <span>{project.dashboards} dashboards</span>
        <span>{project.models} ML models</span>
      </div>
      <div className="project-collaborators">
        <div className="avatar-stack">
          {project.collaborators.slice(0, 3).map((initials) => (
            <Avatar key={initials}>{initials}</Avatar>
          ))}
          {project.collaborators.length > 3 && (
            <Avatar>+{project.collaborators.length - 3}</Avatar>
          )}
        </div>
        <Checkbox
          checked={selectedProjects.includes(project.id)}
          onChange={() => {
            setSelectedProjects((prev) =>
              prev.includes(project.id) ? prev.filter((item) => item !== project.id) : [...prev, project.id]
            );
          }}
        >
          Select
        </Checkbox>
      </div>
    </Card>
  );

  return (
    <div className="workspace-root">
      <div className="workspace-top">
        <Space>
          <Select
            value={currentWorkspaceId}
            onChange={setCurrentWorkspaceId}
            style={{ minWidth: 260 }}
            options={WORKSPACES.map((workspace) => ({
              value: workspace.id,
              label: (
                <Space>
                  <Avatar size="small">{workspace.avatar}</Avatar>
                  <span>{workspace.name}</span>
                  <Tag color={workspace.plan === "Free" ? "default" : workspace.plan === "Pro" ? "blue" : "purple"}>
                    {workspace.plan}
                  </Tag>
                  <Text type="secondary">{workspace.members} members</Text>
                </Space>
              ),
            }))}
            dropdownRender={(menu) => (
              <div>
                {menu}
                <Divider style={{ margin: "8px 0" }} />
                <Button type="text" icon={<PlusOutlined />} onClick={() => setCreateWorkspaceOpen(true)}>
                  Create Workspace
                </Button>
              </div>
            )}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateWorkspaceOpen(true)}>
            Create New
          </Button>
          <Button icon={<SettingOutlined />} onClick={() => setSettingsOpen(true)}>
            Workspace settings
          </Button>
        </Space>
        <Button type="primary" size="large" icon={<PlusOutlined />} onClick={() => setCreateProjectOpen(true)}>
          New Project
        </Button>
      </div>

      <div className="workspace-filters">
        <Input
          prefix={<SearchOutlined />}
          placeholder="Filter projects..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Select
          value={sortBy}
          onChange={setSortBy}
          options={[
            { label: "Recent", value: "recent" },
            { label: "Name", value: "name" },
            { label: "Created date", value: "created" },
          ]}
        />
        <Space>
          <Switch checked={filterActive} onChange={setFilterActive} />
          <Text type="secondary">Active</Text>
          <Switch checked={filterArchived} onChange={setFilterArchived} />
          <Text type="secondary">Archived</Text>
          <Switch checked={filterStarred} onChange={setFilterStarred} />
          <Text type="secondary">Starred</Text>
        </Space>
        <Select value={viewMode} onChange={(value) => setViewMode(value)}>
          <Select.Option value="grid">Grid</Select.Option>
          <Select.Option value="list">List</Select.Option>
        </Select>
        {selectedProjects.length > 0 && (
          <Space>
            <Button onClick={() => handleBulk("archive")}>Archive selected</Button>
            <Button danger onClick={() => handleBulk("delete")}>Delete selected</Button>
          </Space>
        )}
      </div>

      <div className="workspace-main">
        <div className="workspace-projects">
          {filteredProjects.length === 0 ? (
            <div className="workspace-empty">
              <div className="empty-illustration">📁</div>
              <Title level={4}>No projects yet</Title>
              <Text type="secondary">Create your first project to get started.</Text>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateProjectOpen(true)}>
                Create Project
              </Button>
            </div>
          ) : viewMode === "grid" ? (
            <div className="project-grid">
              {filteredProjects.map((project) => renderProjectCard(project))}
            </div>
          ) : (
            <List
              dataSource={filteredProjects}
              renderItem={(project) => (
                <List.Item
                  actions={[
                    <Button key="open">Open</Button>,
                    <Button key="more" icon={<EllipsisOutlined />} />,
                  ]}
                >
                  <List.Item.Meta
                    title={project.name}
                    description={`Last modified ${project.lastModified}`}
                  />
                  <Tag>{project.status}</Tag>
                </List.Item>
              )}
            />
          )}
        </div>

        <div className="workspace-sidebar">
          <Card className="workspace-card" title="Team">
            <Collapse
              defaultActiveKey={["members"]}
              items={[
                {
                  key: "members",
                  label: "Members",
                  children: (
                    <div>
                      {MEMBERS.length === 0 ? (
                        <div className="workspace-empty">
                          <Text type="secondary">It's lonely here!</Text>
                          <Button icon={<UserAddOutlined />} onClick={() => setInviteOpen(true)}>
                            Invite Team Members
                          </Button>
                        </div>
                      ) : (
                        <List
                          dataSource={MEMBERS}
                          renderItem={(member) => (
                            <List.Item
                              actions={[
                                <Dropdown
                                  key="menu"
                                  menu={{
                                    items: [
                                      { key: "role", label: "Change role" },
                                      { key: "remove", label: "Remove" },
                                    ],
                                  }}
                                >
                                  <Button size="small">Manage</Button>
                                </Dropdown>,
                              ]}
                            >
                              <List.Item.Meta
                                avatar={
                                  <Badge status={member.online ? "success" : "default"}>
                                    <Avatar>{member.name.slice(0, 1)}</Avatar>
                                  </Badge>
                                }
                                title={member.name}
                                description={<Tag>{member.role}</Tag>}
                              />
                            </List.Item>
                          )}
                        />
                      )}
                      <Button block icon={<UserAddOutlined />} onClick={() => setInviteOpen(true)}>
                        Invite Members
                      </Button>
                    </div>
                  ),
                },
                {
                  key: "invites",
                  label: "Pending Invites",
                  children: (
                    <List
                      dataSource={INVITES}
                      renderItem={(invite) => (
                        <List.Item
                          actions={[
                            <Button key="resend" size="small">Resend</Button>,
                            <Button key="cancel" size="small" danger>Cancel</Button>,
                          ]}
                        >
                          <List.Item.Meta
                            title={invite.email}
                            description={`Invited by ${invite.invitedBy} · ${invite.date}`}
                          />
                        </List.Item>
                      )}
                    />
                  ),
                },
                {
                  key: "activity",
                  label: "Activity Feed",
                  children: (
                    <div className="activity-feed">
                      {ACTIVITY.map((activity, index) => (
                        <div key={activity.id} className="activity-item">
                          <div className="activity-icon">
                            <BellOutlined />
                          </div>
                          <div>
                            <Text>{activity.text}</Text>
                            <Text type="secondary">{activity.time}</Text>
                          </div>
                          {index < ACTIVITY.length - 1 && <div className="activity-line" />}
                        </div>
                      ))}
                      <Button type="link">View All Activity</Button>
                    </div>
                  ),
                },
              ]}
            />
          </Card>
        </div>
      </div>

      <Modal
        title="Create Workspace"
        open={createWorkspaceOpen}
        onCancel={() => setCreateWorkspaceOpen(false)}
        onOk={() => {
          notify.success("Workspace created");
          setCreateWorkspaceOpen(false);
          setWorkspaceName("");
        }}
      >
        <Space direction="vertical" style={{ width: "100%" }}>
          <Input
            placeholder="Workspace name"
            value={workspaceName}
            onChange={(event) => setWorkspaceName(event.target.value)}
          />
          <Input placeholder="Icon/Color" />
          <Input.TextArea placeholder="Description" />
          <Select
            placeholder="Plan"
            options={[
              { label: "Free", value: "Free" },
              { label: "Pro", value: "Pro" },
              { label: "Business", value: "Business" },
            ]}
          />
        </Space>
      </Modal>

      <Modal
        title="Create Project"
        open={createProjectOpen}
        onCancel={() => setCreateProjectOpen(false)}
        onOk={() => {
          notify.success("Project created");
          setCreateProjectOpen(false);
          setProjectName("");
        }}
      >
        <Space direction="vertical" style={{ width: "100%" }}>
          <Input
            placeholder="Project name"
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
          />
          <Input.TextArea placeholder="Description" />
          <Select
            value={projectTemplate}
            onChange={(value) => setProjectTemplate(value)}
            options={TEMPLATE_OPTIONS.map((item) => ({ label: item, value: item }))}
          />
        </Space>
      </Modal>

      <Modal
        title="Invite Members"
        open={inviteOpen}
        onCancel={() => setInviteOpen(false)}
        onOk={() => {
          notify.success("Invites sent");
          setInviteOpen(false);
        }}
      >
        <Space direction="vertical" style={{ width: "100%" }}>
          <Input placeholder="Emails" />
          <Select
            placeholder="Role"
            options={[
              { label: "Editor", value: "Editor" },
              { label: "Viewer", value: "Viewer" },
              { label: "Admin", value: "Admin" },
            ]}
          />
          <Input.TextArea placeholder="Message (optional)" />
        </Space>
      </Modal>

      <Modal
        title="Workspace Settings"
        open={settingsOpen}
        onCancel={() => setSettingsOpen(false)}
        onOk={() => setSettingsOpen(false)}
        width={860}
      >
        <Tabs
          items={[
            {
              key: "general",
              label: "General",
              children: (
                <Space direction="vertical" style={{ width: "100%" }}>
                  <Input defaultValue={currentWorkspace.name} />
                  <Input.TextArea defaultValue="Workspace description" />
                  <Input placeholder="Icon/Color" />
                  <Select
                    defaultValue="Private"
                    options={[
                      { label: "Private", value: "Private" },
                      { label: "Team", value: "Team" },
                    ]}
                  />
                  <Button type="primary">Save Changes</Button>
                </Space>
              ),
            },
            {
              key: "billing",
              label: "Billing",
              children: (
                <Space direction="vertical" style={{ width: "100%" }}>
                  <Card className="billing-card">
                    <Space direction="vertical">
                      <Text strong>Current plan: {currentWorkspace.plan}</Text>
                      <Progress percent={80} />
                      <Text type="secondary">Projects: 8/unlimited</Text>
                      <Text type="secondary">Storage: 2.3GB/10GB</Text>
                      <Text type="secondary">Team members: 3/5</Text>
                      <Button type="primary">Upgrade Plan</Button>
                    </Space>
                  </Card>
                  <Divider />
                  <Text strong>Payment method</Text>
                  <Input placeholder="**** **** **** 1243" />
                </Space>
              ),
            },
            {
              key: "security",
              label: "Security",
              children: (
                <Space direction="vertical" style={{ width: "100%" }}>
                  <Switch checked={currentWorkspace.plan === "Business"} />
                  <Text type="secondary">SSO settings (Business+)</Text>
                  <Input placeholder="IP whitelist" />
                  <Switch defaultChecked />
                  <Text type="secondary">Require 2FA</Text>
                  <Input placeholder="Session timeout" />
                  <Button type="primary">Generate New Key</Button>
                </Space>
              ),
            },
            {
              key: "danger",
              label: "Danger Zone",
              children: (
                <Space direction="vertical" style={{ width: "100%" }}>
                  <Button icon={<CrownOutlined />}>Transfer Ownership</Button>
                  <Button danger icon={<DeleteOutlined />}>
                    Delete Workspace
                  </Button>
                </Space>
              ),
            },
          ]}
        />
      </Modal>
    </div>
  );
}
