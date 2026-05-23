import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { createProject as apiCreateProject, fetchProjects, provisionQuickstart } from "../api";
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
  description?: string | null;
  is_quickstart?: boolean;
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
  /** Up to 2 suspended/active dataset lanes for quick switching */
  activeLanes: Dataset[];
  addLane: (dataset: Dataset) => void;
  removeLane: (datasetId: string) => void;
  members: Member[];
  setMembers: (members: Member[]) => void;
  /** Last project id the user explicitly opened in this account; persists
   * across reloads so a refresh on /workspace can deep-link back to it. */
  lastProjectId: string | null;
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
    
    description: raw.description,
    is_quickstart: raw.is_quickstart ?? false,
    pipelineCount: raw.pipeline_count,
    dashboardCount: raw.dashboard_count,
    sourceCount: raw.source_count,
    updatedAt: raw.updated_at,
  };
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { session, isAnonymous } = useAuth();
  // User-scoped key so two accounts on the same browser don't clobber each
  // other's "last project" memory, and an anon visitor's last project can't
  // hijack a signed-in user's view.
  const lastProjectStorageKey = session?.user?.id
    ? `datahub_last_project_${session.user.id}`
    : null;
  const readLastProjectId = useCallback((): string | null => {
    if (!lastProjectStorageKey) return null;
    try { return localStorage.getItem(lastProjectStorageKey); } catch { return null; }
  }, [lastProjectStorageKey]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [activeProject, setActiveProjectState] = useState<Project | null>(null);
  const [activeDataset, setActiveDatasetState] = useState<Dataset | null>(null);
  const [activeLanes, setActiveLanes] = useState<Dataset[]>([]);
  const [lastProjectId, setLastProjectId] = useState<string | null>(() => {
    // Initial peek (may be null if session not yet hydrated; reconciled below).
    try {
      const uid = session?.user?.id;
      return uid ? localStorage.getItem(`datahub_last_project_${uid}`) : null;
    } catch { return null; }
  });

  // Re-read once the session resolves (AuthContext is async on cold start).
  useEffect(() => {
    setLastProjectId(readLastProjectId());
  }, [readLastProjectId]);

  const setActiveProject = useCallback((project: Project) => {
    setActiveProjectState(project);
    if (lastProjectStorageKey) {
      try {
        localStorage.setItem(lastProjectStorageKey, project.id);
        setLastProjectId(project.id);
      } catch { /* ignore quota */ }
    }
  }, [lastProjectStorageKey]);

  const addLane = useCallback((dataset: Dataset) => {
    setActiveLanes((prev) => {
      if (prev.some((d) => d.id === dataset.id)) return prev;
      // Max 4 lanes — drop the oldest if at capacity. Supports common
      // multi-file workflows (e.g. finance reconciliation: JE + TB + COA + result).
      const next = [...prev, dataset];
      return next.length > 4 ? next.slice(next.length - 4) : next;
    });
  }, []);

  const removeLane = useCallback((datasetId: string) => {
    setActiveLanes((prev) => prev.filter((d) => d.id !== datasetId));
  }, []);

  const setActiveDataset = useCallback((dataset: Dataset | null) => {
    if (dataset) {
      localStorage.setItem("activeDatasetId", dataset.id);
      // Track in lanes (max 4, newest wins)
      setActiveLanes((prev) => {
        if (prev.some((d) => d.id === dataset.id)) return prev;
        const next = [...prev, dataset];
        return next.length > 4 ? next.slice(next.length - 4) : next;
      });
    } else {
      localStorage.removeItem("activeDatasetId");
    }
    setActiveDatasetState(dataset);
  }, []);
  const [members, setMembers] = useState<Member[]>([]);

  const refreshProjects = useCallback(async () => {
    // Allow both real sessions and anonymous guest sessions to load projects.
    // Anonymous users have a valid JWT set via setAuthToken() — the API works;
    // only the Supabase `session` object is null for them.
    if (!session && !isAnonymous) {
      setProjectsLoading(false);
      return;
    }
    setProjectsLoading(true);
    try {
        const data = await fetchProjects();
      let mapped = data.map(toProject);

      // For ALL users: if the API returned no is_quickstart project, provision
      // one now. The backend endpoint is fully idempotent so calling it when
      // the project already exists is harmless. We intentionally do NOT gate
      // this on a localStorage flag — stale flags from previous sessions would
      // prevent re-provisioning after a project deletion (e.g. migration 0075).
      const hasQsProject = mapped.some((p) => p.is_quickstart);
      if (!hasQsProject) {
        try {
          await provisionQuickstart();
          const data2 = await fetchProjects();
          mapped = data2.map(toProject);
        } catch {
          // Non-fatal — fall through with existing list
        }
      }

      setProjects(mapped);
      // If activeProject not loaded yet, prefer the user's last opened
      // project (persisted in localStorage) so refresh returns them to where
      // they were. Fall back to first.
      setActiveProjectState((prev) => {
        if (prev) {
          const updated = mapped.find((p) => p.id === prev.id);
          return updated ?? prev;
        }
        const lastId = readLastProjectId();
        const restored = lastId ? mapped.find((p) => p.id === lastId) : undefined;
        return restored ?? mapped[0] ?? null;
      });
    } catch {
      // swallow — components handle their own loading states
    } finally {
      setProjectsLoading(false);
    }
  }, [session, isAnonymous]);

  // Load projects when session (real or anon) becomes available
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

  // Clear lanes when switching projects.
  //
  // Also clear the localStorage `activeDatasetId` key.  Without this, deleting
  // a project then opening (or creating) any other project leaves the
  // previous project's dataset id in localStorage; on the next page reload,
  // PipelineContext picks it up via its mount-time peek and hydrates stale
  // steps + liveArtifact from `datahub_steps_v2_<id>` / `datahub_live_artifact_<id>`
  // keys — producing ghost "clean · LIVE" artifacts and pipeline-step nodes
  // in the canvas of an otherwise-empty new project.
  useEffect(() => {
    setActiveDatasetState(null);
    setActiveLanes([]);
    try { localStorage.removeItem("activeDatasetId"); } catch { /* ignore quota */ }
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
      activeLanes,
      addLane,
      removeLane,
      members,
      setMembers,
      lastProjectId,
    }),
    [projects, projectsLoading, refreshProjects, createProject, activeProject, setActiveProject, activeDataset, setActiveDataset, activeLanes, addLane, removeLane, members, lastProjectId],
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
