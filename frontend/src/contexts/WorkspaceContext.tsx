import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { createProject as apiCreateProject, fetchProjects } from "../api";
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
  createProject: (payload: { name: string; description?: string; colour?: string; icon?: string }) => Promise<Project>;
  activeProject: Project | null;
  setActiveProject: (project: Project) => void;
  activeDataset: Dataset | null;
  setActiveDataset: (dataset: Dataset | null) => void;
  members: Member[];
  setMembers: (members: Member[]) => void;
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
  // Start as true so ExplorerPanel waits for the first project fetch before
  // loading datasets — prevents a wasted no-project-id request on cold mount.
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [activeDataset, setActiveDataset] = useState<Dataset | null>(null);
  const [members, setMembers] = useState<Member[]>([]);

  const refreshProjects = useCallback(async () => {
    if (!session) {
      setProjectsLoading(false);
      return;
    }
    setProjectsLoading(true);
    try {
      const data = await fetchProjects();
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

  const createProject = useCallback(
    async (payload: { name: string; description?: string; colour?: string; icon?: string }) => {
      const raw = await apiCreateProject(payload);
      const project = toProject(raw);
      setProjects((prev) => [project, ...prev]);
      return project;
    },
    [],
  );

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
    }),
    [projects, projectsLoading, refreshProjects, createProject, activeProject, activeDataset, members],
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
