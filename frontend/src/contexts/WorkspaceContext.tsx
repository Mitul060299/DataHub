import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { createProject as apiCreateProject, createWorkspace as apiCreateWorkspace, fetchProjects, fetchWorkspaceMembers, listWorkspaces, type WorkspaceMemberOut, type WorkspaceOut } from "../api";
import type { ProjectOut } from "../api";
import { useAuth } from "./AuthContext";

export interface Project {
  id: string;
  name: string;
  /** hex colour, e.g. "#5b6af0" */
  colour: string;
  icon: string;
  /** convenience alias kept for legacy consumers */
  color: string;
  initial: string;
  workspaceId: string;
  description?: string | null;
  pipelineCount: number;
  dashboardCount: number;
  sourceCount: number;
  updatedAt?: string | null;
}

export interface Dataset {
  id: string;
  name: string;
  rows: number;
  row_count?: number | null;
  format?: string | null;
  parentId?: string | null;
}

export interface Member {
  id: string;
  name: string;
  email: string;
  role: "Admin" | "Editor" | "Viewer";
  online?: boolean;
}

export interface WorkspaceContextValue {
  projects: Project[];
  projectsLoading: boolean;
  refreshProjects: () => Promise<void>;
  createProject: (payload: { name: string; description?: string; colour?: string; icon?: string; workspace_id?: string }) => Promise<Project>;
  activeProject: Project | null;
  setActiveProject: (project: Project) => void;
  activeDataset: Dataset | null;
  setActiveDataset: (dataset: Dataset | null) => void;
  members: Member[];
  setMembers: (members: Member[]) => void;
  workspaceMembers: WorkspaceMemberOut[];
  refreshMembers: (workspaceId: string) => Promise<void>;
  // Workspace list + switcher
  workspaces: WorkspaceOut[];
  activeWorkspaceId: string;
  setActiveWorkspaceId: (id: string) => void;
  createWorkspace: (name: string, type: "personal" | "collab") => Promise<WorkspaceOut>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);

function toProject(raw: ProjectOut): Project {
  return {
    id: raw.id,
    name: raw.name,
    colour: raw.colour,
    color: raw.colour,
    icon: raw.icon,
    initial: raw.name.charAt(0).toUpperCase(),
    workspaceId: raw.workspace_id,
    description: raw.description,
    pipelineCount: raw.pipeline_count,
    dashboardCount: raw.dashboard_count,
    sourceCount: raw.source_count,
    updatedAt: raw.updated_at,
  };
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [activeDataset, setActiveDatasetState] = useState<Dataset | null>(null);

  const setActiveDataset = useCallback((dataset: Dataset | null) => {
    if (dataset) {
      localStorage.setItem("activeDatasetId", dataset.id);
    } else {
      localStorage.removeItem("activeDatasetId");
    }
    setActiveDatasetState(dataset);
  }, []);
  const [members, setMembers] = useState<Member[]>([]);
  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMemberOut[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceOut[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceIdState] = useState<string>(
    () => localStorage.getItem("activeWorkspaceId") || "default"
  );

  const setActiveWorkspaceId = useCallback((id: string) => {
    localStorage.setItem("activeWorkspaceId", id);
    setActiveWorkspaceIdState(id);
  }, []);

  const refreshWorkspaces = useCallback(async () => {
    if (!session) return;
    try {
      const data = await listWorkspaces();
      setWorkspaces(data);
    } catch {
      // non-fatal
    }
  }, [session]);

  const createWorkspace = useCallback(
    async (name: string, type: "personal" | "collab") => {
      const ws = await apiCreateWorkspace(name, type);
      setWorkspaces((prev) => [...prev, ws]);
      return ws;
    },
    []
  );

  useEffect(() => {
    void refreshWorkspaces();
  }, [refreshWorkspaces]);

  const refreshMembers = useCallback(async (workspaceId: string) => {
    if (!session || !workspaceId || workspaceId === "default") return;
    try {
      const data = await fetchWorkspaceMembers(workspaceId);
      setWorkspaceMembers(data);
    } catch {
      // non-fatal
    }
  }, [session]);

  const refreshProjects = useCallback(async () => {
    if (!session) {
      setProjectsLoading(false);
      return;
    }
    setProjectsLoading(true);
    try {
      const wsId = localStorage.getItem("activeWorkspaceId") || "default";
      const data = await fetchProjects(wsId);
      const mapped = data.map(toProject);
      setProjects(mapped);
      // If activeProject not loaded yet, default to first
      setActiveProject((prev) => {
        if (prev) {
          // Refresh active project data in case counts changed
          const updated = mapped.find((p) => p.id === prev.id);
          return updated ?? prev;
        }
        return mapped[0] ?? null;
      });
    } catch {
      // swallow — components handle their own loading states
    } finally {
      setProjectsLoading(false);
    }
  }, [session]);

  // Load projects when session becomes available
  useEffect(() => {
    void refreshProjects();
  }, [refreshProjects]);

  // Re-fetch projects whenever the active workspace changes
  useEffect(() => {
    if (session) void refreshProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspaceId]);

  const createProject = useCallback(
    async (payload: { name: string; description?: string; colour?: string; icon?: string; workspace_id?: string }) => {
      const raw = await apiCreateProject(payload);
      const project = toProject(raw);
      setProjects((prev) => [project, ...prev]);
      return project;
    },
    [],
  );

  // Clear the selected dataset when switching projects so a stale ID from
  // the previous project never hits the backend (which would return a 404).
  // We intentionally do NOT clear localStorage here — ExplorerPanel will
  // restore the correct dataset after it loads the new project's dataset list.
  useEffect(() => {
    setActiveDatasetState(null);
  }, [activeProject?.id]);

  const value = useMemo(
    () => ({
      projects,
      projectsLoading,
      refreshProjects,
      createProject,
      activeProject,
      setActiveProject,
      activeDataset,
      setActiveDataset,
      members,
      setMembers,
      workspaceMembers,
      refreshMembers,
      workspaces,
      activeWorkspaceId,
      setActiveWorkspaceId,
      createWorkspace,
    }),
    [projects, projectsLoading, refreshProjects, createProject, activeProject, activeDataset, members, workspaceMembers, refreshMembers, workspaces, activeWorkspaceId, setActiveWorkspaceId, createWorkspace],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspaceContext() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspaceContext must be used inside WorkspaceProvider");
  }
  return context;
}
