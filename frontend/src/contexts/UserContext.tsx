import { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { ReactNode } from "react";
import { fetchCurrentUser, updateOnboardingState } from "../api";
import { useAuth } from "./AuthContext";
import { recordMilestone as _recordMilestone } from "../lib/activation";
import type { Milestone } from "../lib/activation";

type UserPlan = "Free" | "Beta" | "Starter" | "Professional" | "Team" | "Business" | "Enterprise";

type PlanLimits = {
  maxFileSize: number;
  maxDatasets: number;
  maxStorage: number;
  maxWorkspaces: number;
  maxProjectsPerWorkspace: number;
  maxDatasetsPerProject: number;
  maxPipelines: number;
  aiMessagesPerMonth: number;
  features: {
    allFileFormats: boolean;
    databaseConnections: boolean;
    cloudStorage: boolean;
    autoML: boolean;
    apiAccess: boolean;
    scheduledPipelines: boolean;
    collaboration: boolean;
    customML: boolean;
    enterpriseConnectors: boolean;
    sso: boolean;
  };
};

type UserContextType = {
  plan: UserPlan;
  setPlan: (plan: UserPlan) => void;
  limits: PlanLimits;
  usage: {
    datasetsUsed: number;
    storageUsed: number;
    aiMessagesUsed: number;
  };
  user: {
    id: string;
    username: string;
    role: string;
  } | null;
  hasCompletedOnboarding: boolean;
  hasUploadedFirstFile: boolean;
  firstAiAnswerAt: string | null;
  firstDatasetAt: string | null;
  markOnboardingComplete: () => void;
  markFirstUpload: () => void;
  recordMilestone: (milestone: Milestone, props?: Record<string, unknown>) => void;
};

const planLimits: Record<UserPlan, PlanLimits> = {
  Free: {
    maxFileSize: 50 * 1024 * 1024,
    maxDatasets: 3,
    maxStorage: 500 * 1024 * 1024,
    maxWorkspaces: 1,
    maxProjectsPerWorkspace: 2,
    maxDatasetsPerProject: 3,
    maxPipelines: 1,
    aiMessagesPerMonth: 50,
    features: {
      allFileFormats: false,
      databaseConnections: false,
      cloudStorage: false,
      autoML: false,
      apiAccess: false,
      scheduledPipelines: false,
      collaboration: false,
      customML: false,
      enterpriseConnectors: false,
      sso: false,
    },
  },
  // Open beta tier — assigned to every user while billing is disabled.
  // Generous on cheap resources, conservative on AI calls.
  Beta: {
    maxFileSize: 2 * 1024 * 1024 * 1024,
    maxDatasets: -1,
    maxStorage: 20 * 1024 * 1024 * 1024,
    maxWorkspaces: 1,
    maxProjectsPerWorkspace: -1,
    maxDatasetsPerProject: -1,
    maxPipelines: -1,
    aiMessagesPerMonth: 500,
    features: {
      allFileFormats: true,
      databaseConnections: true,
      cloudStorage: true,
      autoML: true,
      apiAccess: true,
      scheduledPipelines: true,
      collaboration: false,
      customML: true,
      enterpriseConnectors: true,
      sso: false,
    },
  },
  Starter: {
    maxFileSize: 250 * 1024 * 1024,
    maxDatasets: 25,
    maxStorage: 5 * 1024 * 1024 * 1024,
    maxWorkspaces: 1,
    maxProjectsPerWorkspace: 5,
    maxDatasetsPerProject: 25,
    maxPipelines: 5,
    aiMessagesPerMonth: 500,
    features: {
      allFileFormats: false,
      databaseConnections: true,   // SQLite only
      cloudStorage: false,
      autoML: false,
      apiAccess: false,
      scheduledPipelines: true,    // daily-only
      collaboration: false,
      customML: false,
      enterpriseConnectors: false,
      sso: false,
    },
  },
  Professional: {
    maxFileSize: 1 * 1024 * 1024 * 1024,
    maxDatasets: 25,
    maxStorage: 10 * 1024 * 1024 * 1024,
    maxWorkspaces: 3,
    maxProjectsPerWorkspace: 10,
    maxDatasetsPerProject: 25,
    maxPipelines: -1,
    aiMessagesPerMonth: 1500,
    features: {
      allFileFormats: true,
      databaseConnections: true,
      cloudStorage: true,
      autoML: true,
      apiAccess: true,
      scheduledPipelines: true,
      collaboration: false,
      customML: false,
      enterpriseConnectors: false,
      sso: false,
    },
  },
  Team: {
    maxFileSize: 5 * 1024 * 1024 * 1024,
    maxDatasets: -1,
    maxStorage: 100 * 1024 * 1024 * 1024,
    maxWorkspaces: -1,
    maxProjectsPerWorkspace: -1,
    maxDatasetsPerProject: -1,
    maxPipelines: -1,
    aiMessagesPerMonth: 4000,
    features: {
      allFileFormats: true,
      databaseConnections: true,
      cloudStorage: true,
      autoML: true,
      apiAccess: true,
      scheduledPipelines: true,
      collaboration: true,
      customML: true,
      enterpriseConnectors: true,
      sso: false,
    },
  },
  Business: {
    maxFileSize: 10 * 1024 * 1024 * 1024,
    maxDatasets: -1,
    maxStorage: 500 * 1024 * 1024 * 1024,
    maxWorkspaces: -1,
    maxProjectsPerWorkspace: -1,
    maxDatasetsPerProject: -1,
    maxPipelines: -1,
    aiMessagesPerMonth: 15000,
    features: {
      allFileFormats: true,
      databaseConnections: true,
      cloudStorage: true,
      autoML: true,
      apiAccess: true,
      scheduledPipelines: true,
      collaboration: true,
      customML: true,
      enterpriseConnectors: true,
      sso: true,
    },
  },
  Enterprise: {
    maxFileSize: -1,
    maxDatasets: -1,
    maxStorage: -1,
    maxWorkspaces: -1,
    maxProjectsPerWorkspace: -1,
    maxDatasetsPerProject: -1,
    maxPipelines: -1,
    aiMessagesPerMonth: -1,
    features: {
      allFileFormats: true,
      databaseConnections: true,
      cloudStorage: true,
      autoML: true,
      apiAccess: true,
      scheduledPipelines: true,
      collaboration: true,
      customML: true,
      enterpriseConnectors: true,
      sso: true,
    },
  },
};

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider = ({ children }: { children: ReactNode }) => {
  const [plan, setPlan] = useState<UserPlan>("Free");
  const [usage, setUsage] = useState({
    datasetsUsed: 0,
    storageUsed: 0,
    aiMessagesUsed: 0,
  });
  const [user, setUser] = useState<UserContextType["user"]>(null);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);
  const [hasUploadedFirstFile, setHasUploadedFirstFile] = useState(false);
  const [firstAiAnswerAt, setFirstAiAnswerAt] = useState<string | null>(null);
  const [firstDatasetAt, setFirstDatasetAt] = useState<string | null>(null);
  const { session, loading } = useAuth();

  useEffect(() => {
    let mounted = true;
    const loadUser = async () => {
      if (loading) return;
      if (!session) {
        if (!mounted) return;
        setPlan("Free");
        setUsage({ datasetsUsed: 0, storageUsed: 0, aiMessagesUsed: 0 });
        setUser(null);
        setHasCompletedOnboarding(false);
        setHasUploadedFirstFile(false);
        return;
      }
      try {
        const profile = await fetchCurrentUser();
        if (!mounted) return;
        setPlan(profile.plan);
        setUsage(profile.usage);
        setUser({
          id: profile.id,
          username: profile.username,
          role: profile.role,
        });
        setHasCompletedOnboarding(profile.has_completed_onboarding ?? false);
        setHasUploadedFirstFile(profile.has_uploaded_first_file ?? false);
        setFirstAiAnswerAt((profile as { first_ai_answer_at?: string | null }).first_ai_answer_at ?? null);
        setFirstDatasetAt((profile as { first_dataset_at?: string | null }).first_dataset_at ?? null);
      } catch {
        if (!mounted) return;
        setUser(null);
      }
    };
    loadUser();
    return () => {
      mounted = false;
    };
  }, [session, loading]);

  const markOnboardingComplete = useCallback(() => {
    setHasCompletedOnboarding(true);
    updateOnboardingState({ completed: true }).catch(() => {});
  }, []);

  const markFirstUpload = useCallback(() => {
    setHasUploadedFirstFile(true);
    updateOnboardingState({ uploadedFirstFile: true }).catch(() => {});
    if (!firstDatasetAt) {
      setFirstDatasetAt(new Date().toISOString());
      _recordMilestone("dataset_loaded", { source: "upload" });
    }
  }, [firstDatasetAt]);

  const recordMilestone = useCallback(
    (milestone: Milestone, props?: Record<string, unknown>) => {
      // Update local state when the aha milestone fires so components can
      // react immediately without waiting for a server round-trip.
      if (milestone === "aha_first_ai_answer" && !firstAiAnswerAt) {
        setFirstAiAnswerAt(new Date().toISOString());
      }
      if (milestone === "dataset_loaded" && !firstDatasetAt) {
        setFirstDatasetAt(new Date().toISOString());
      }
      _recordMilestone(milestone, props);
    },
    [firstAiAnswerAt, firstDatasetAt],
  );

  const limits = planLimits[plan];

  return (
    <UserContext.Provider
      value={{
        plan,
        setPlan,
        limits,
        usage,
        user,
        hasCompletedOnboarding,
        hasUploadedFirstFile,
        firstAiAnswerAt,
        firstDatasetAt,
        markOnboardingComplete,
        markFirstUpload,
        recordMilestone,
      }}
    >
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error("useUser must be used within UserProvider");
  }
  return context;
};

export const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};
