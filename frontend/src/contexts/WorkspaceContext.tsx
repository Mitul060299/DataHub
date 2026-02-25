import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

export interface Project {
  id: string;
  name: string;
  color: string;
  initial: string;
  workspaceId: string;
  memberCount?: number;
  description?: string;
}

export interface Dataset {
  id: string;
  name: string;
  rows: number;
}

export interface Member {
  id: string;
  name: string;
  email: string;
  role: "Admin" | "Editor" | "Viewer";
  online?: boolean;
}

export interface WorkspaceContextValue {
  activeProject: Project | null;
  setActiveProject: (project: Project) => void;
  activeDataset: Dataset | null;
  setActiveDataset: (dataset: Dataset) => void;
  members: Member[];
  setMembers: (members: Member[]) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);

const defaultProject: Project = {
  id: "project-local",
  name: "Default Project",
  color: "#5b6af0",
  initial: "D",
  workspaceId: "default",
  memberCount: 3,
  description: "Primary data workspace",
};

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [activeProject, setActiveProject] = useState<Project | null>(defaultProject);
  const [activeDataset, setActiveDataset] = useState<Dataset | null>(null);
  const [members, setMembers] = useState<Member[]>([
    { id: "m1", name: "Alex Lee", email: "alex@datahub.dev", role: "Admin", online: true },
    { id: "m2", name: "Sam Kim", email: "sam@datahub.dev", role: "Editor", online: true },
    { id: "m3", name: "Nora Diaz", email: "nora@datahub.dev", role: "Viewer", online: false },
  ]);

  const value = useMemo(
    () => ({ activeProject, setActiveProject, activeDataset, setActiveDataset, members, setMembers }),
    [activeProject, activeDataset, members],
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
