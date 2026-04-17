import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { api, fetchDatasetPage } from "../api";
import { ActivityBar } from "../components/ActivityBar";
import { Breadcrumb } from "../components/Breadcrumb";
import { AIPanel } from "../components/AIPanel";
import { PipelinePanel } from "../components/PipelinePanel";
import { CanvasPanel } from "../components/CanvasPanel";
import { ExplorerPanel } from "../components/ExplorerPanel";
import { ImportModal } from "../components/modals/ImportModal";
import { SheetsExportModal } from "../components/SheetsExportModal";
import { WelcomeModal } from "../components/WelcomeModal";
import { OnboardingProgress } from "../components/OnboardingProgress";
import { TourTooltip, STEPS } from "../components/TourTooltip";
import { usePipelineContext } from "../contexts/PipelineContext";
import { useWorkspaceContext } from "../contexts/WorkspaceContext";
import { useUser } from "../contexts/UserContext";
import { useDataset } from "../hooks/useDataset";
import { useTour } from "../hooks/useTour";
import { capture } from "../lib/posthog";


export function WorkspacePage() {
  const { projectId, pipelineId } = useParams<{ projectId?: string; pipelineId?: string }>();
  const { activeProject, activeDataset, setActiveDataset, activeLanes, removeLane, projects, activeWorkspaceId } = useWorkspaceContext();
  const workspaceId = activeWorkspaceId !== "default" ? activeWorkspaceId : "default";

  // Resolve project from URL param or fall back to activeProject
  const resolvedProject = projectId
    ? (projects.find((p) => p.id === projectId) ?? activeProject)
    : activeProject;
  const { steps, liveArtifact, setLiveArtifact } = usePipelineContext();
  const { data, loading, error: datasetError, refetch } = useDataset(activeDataset?.id);
  const { hasCompletedOnboarding, hasUploadedFirstFile, markOnboardingComplete } = useUser();
  const [explorerOpen, setExplorerOpen] = useState(true);
  const [importOpen, setImportOpen] = useState(false);
  const [sampleUrl, setSampleUrl] = useState<string | undefined>(undefined);
  const [datasetRefreshNonce, setDatasetRefreshNonce] = useState(0);
  const [explorerSearchFocusNonce, setExplorerSearchFocusNonce] = useState(0);
  const [explorerWidth, setExplorerWidth] = useState(() => Number(localStorage.getItem("explorerWidth") ?? 280));
  const [resizingExplorer, setResizingExplorer] = useState(false);
  const [pipelineOpen, setPipelineOpen] = useState(() => localStorage.getItem("pipelineOpen") !== "false");
  const [pipelineWidth, setPipelineWidth] = useState(() => Number(localStorage.getItem("pipelineWidth") ?? 300));
  const [resizingPipeline, setResizingPipeline] = useState(false);
  const [aiWidth, setAiWidth] = useState(() => Number(localStorage.getItem("aiWidth") ?? 320));
  const [resizingAI, setResizingAI] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const [hasAskedFirstQuestion, setHasAskedFirstQuestion] = useState(false);
  const [sheetsExportOpen, setSheetsExportOpen] = useState(false);
  const [sessionPreview, setSessionPreview] = useState<{ rows: Record<string, unknown>[]; columns: string[] } | null>(null);
  const [showingOriginal, setShowingOriginal] = useState(false);
  const [replayingPipeline, setReplayingPipeline] = useState(false);
  const [replayError, setReplayError] = useState<string | null>(null);
  const { tourActive, currentStep, startTour, nextStep, skipTour, isTourDone } = useTour();

  // When agent.done sets sessionPreview/liveArtifact AND switches the active
  // dataset in the same React batch, the clearing useEffect on activeDataset?.id
  // would destroy that freshly-set state. This ref tells the effect to skip one
  // clearing cycle so the agent-provided preview survives the dataset switch.
  const skipNextClearRef = useRef(false);

  // Re-execute all pipeline steps and restore session preview.
  // Called from the green banner when the user refreshes and liveArtifact is gone.
  const handleRunPipeline = async () => {
    if (!activeDataset?.id || !steps.length || replayingPipeline) return;
    setReplayingPipeline(true);
    try {
      const replaySteps = steps
        .map((s) => s.rawConfig ?? (s.sql ? { sql: s.sql } : null))
        .filter(Boolean);
      // Use the root dataset (first step's input) as the pivot so the alias
      // computed from its name matches the SQL written by the agent at capture time.
      const pivotId = steps[0]?.inputDataset?.id ?? activeDataset.id;
      const result = await api.post<{ final_dataset_id: string; final_row_count: number }>(
        `/cleaning/datasets/${pivotId}/replay`,
        { steps: replaySteps },
      );
      const { final_dataset_id, final_row_count } = result.data;
      const page = await fetchDatasetPage(final_dataset_id, 0, 500);
      setSessionPreview({ rows: page.rows ?? [], columns: page.columns ?? [] });
      setLiveArtifact({
        tableName: final_dataset_id,
        rowCount: final_row_count ?? page.total_rows ?? page.rows?.length ?? 0,
        stepLabel: steps[steps.length - 1].description,
        sessionId: "replayed",
      });
    } catch (err) {
      console.error("Pipeline replay failed", err);
      const axiosDetail = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail;
      const msg = axiosDetail ?? (err instanceof Error ? err.message : "Pipeline replay failed. Please try again.");
      setReplayError(msg);
    } finally {
      setReplayingPipeline(false);
    }
  };

  // Show welcome modal on first visit
  useEffect(() => {
    if (!hasCompletedOnboarding) {
      const shown = sessionStorage.getItem("datahub_welcome_shown");
      if (!shown) {
        setWelcomeOpen(true);
        sessionStorage.setItem("datahub_welcome_shown", "1");
        capture("onboarding_modal_shown");
      }
    }
  }, [hasCompletedOnboarding]);

  // Auto-start tooltip tour for first-time visitors (1 s delay so layout settles)
  useEffect(() => {
    const id = setTimeout(() => {
      if (!isTourDone()) startTour();
    }, 1000);
    return () => clearTimeout(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mark onboarding complete when all steps done
  useEffect(() => {
    if (hasUploadedFirstFile && hasAskedFirstQuestion && !hasCompletedOnboarding) {
      markOnboardingComplete();
      capture("onboarding_completed");
    }
  }, [hasUploadedFirstFile, hasAskedFirstQuestion, hasCompletedOnboarding, markOnboardingComplete]);

  // Clear in-session view state whenever the user switches to a different source dataset.
  // PipelineContext handles loading the correct steps for each dataset independently.
  // Skip clearing when agent.done triggered the switch (skipNextClearRef is set).
  useEffect(() => {
    if (skipNextClearRef.current) {
      skipNextClearRef.current = false;
      setShowingOriginal(false);
      return;
    }
    setSessionPreview(null);
    setLiveArtifact(null);
    setShowingOriginal(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDataset?.id]);

  // Clear session preview when the live artifact is cleared (step deleted or artifact saved).
  // When a NEW live artifact is set (user ran another step while viewing original),
  // snap back to showing the cleaned result automatically.
  useEffect(() => {
    if (!liveArtifact) {
      setSessionPreview(null);
      setShowingOriginal(false);
    } else {
      setShowingOriginal(false);
    }
  }, [liveArtifact]);

  useEffect(() => {
    if (!resizingExplorer) return;

    const handleMouseMove = (event: MouseEvent) => {
      const minWidth = 220;
      const maxWidth = 520;
      const activityBarWidth = 52;
      const nextWidth = Math.max(minWidth, Math.min(maxWidth, event.clientX - activityBarWidth));
      setExplorerWidth(nextWidth);
      localStorage.setItem("explorerWidth", String(nextWidth));
    };

    const stopResizing = () => setResizingExplorer(false);

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", stopResizing);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", stopResizing);
    };
  }, [resizingExplorer]);

  useEffect(() => {
    if (!resizingPipeline) return;
    const handleMouseMove = (e: MouseEvent) => {
      // Pipeline panel sits to the LEFT of AI panel; we track the cursor
      // relative to the right edge of the window minus AI panel width.
      const nextWidth = Math.max(240, Math.min(560, window.innerWidth - aiWidth - e.clientX));
      setPipelineWidth(nextWidth);
      localStorage.setItem("pipelineWidth", String(nextWidth));
    };
    const stop = () => setResizingPipeline(false);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", stop);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", stop);
    };
  }, [resizingPipeline, aiWidth]);

  useEffect(() => {
    if (!resizingAI) return;
    const handleMouseMove = (e: MouseEvent) => {
      const nextWidth = Math.max(280, Math.min(560, window.innerWidth - e.clientX));
      setAiWidth(nextWidth);
      localStorage.setItem("aiWidth", String(nextWidth));
    };
    const stop = () => setResizingAI(false);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", stop);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", stop);
    };
  }, [resizingAI]);

  const breadcrumbSegments = [
    { label: "Workspace", href: "/workspace" },
    ...(resolvedProject
      ? [{ label: resolvedProject.name, href: `/workspace/project/${resolvedProject.id}` }]
      : []),
    { label: activeDataset?.name ?? "Workspace" },
  ];

  return (
    <>
      <Breadcrumb segments={breadcrumbSegments} />
      {/* ── Dataset Lane HUD ───────────────────────────────────────── */}
      {activeLanes.length > 0 && (
        <div style={{ position: "fixed", bottom: 16, left: "50%", transform: "translateX(-50%)", zIndex: 100, display: "flex", gap: 6 }}>
          {activeLanes.map((lane) => {
            const isActive = lane.id === activeDataset?.id;
            return (
              <div key={lane.id} style={{ display: "flex", alignItems: "center", gap: 0, borderRadius: 8, border: `1px solid ${isActive ? "var(--acg)" : "var(--bd)"}`, background: isActive ? "var(--acl)" : "var(--bg2)", boxShadow: "0 4px 16px rgba(0,0,0,0.45)", overflow: "hidden" }}>
                <button
                  onClick={() => setActiveDataset(lane)}
                  style={{ padding: "6px 12px", background: "none", border: "none", cursor: "pointer", fontSize: 11, color: isActive ? "var(--ac)" : "var(--tx1)", display: "flex", alignItems: "center", gap: 6 }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: isActive ? "var(--ac)" : "var(--tx2)", flexShrink: 0 }} />
                  <span style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lane.name}</span>
                  {lane.rows > 0 && <span style={{ fontSize: 9, color: "var(--tx2)" }}>{lane.rows.toLocaleString()} rows</span>}
                </button>
                <button
                  onClick={() => removeLane(lane.id)}
                  title="Remove lane"
                  style={{ width: 22, height: "100%", background: "none", border: "none", borderLeft: "1px solid var(--bd)", cursor: "pointer", color: "var(--tx2)", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center" }}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}
      <main style={{ height: "calc(100% - var(--th) - 36px)", display: "flex", minWidth: 0, minHeight: 0 }}>
      <ActivityBar
        explorerOpen={explorerOpen}
        pipelineOpen={pipelineOpen}
        onToggleExplorer={() => setExplorerOpen((value) => !value)}
        onTogglePipeline={() => {
          setPipelineOpen((v) => {
            localStorage.setItem("pipelineOpen", String(!v));
            return !v;
          });
        }}
      />
      {explorerOpen ? (
        <>
          <ExplorerPanel
            workspaceId={workspaceId}
            refreshNonce={datasetRefreshNonce}
            searchFocusNonce={explorerSearchFocusNonce}
            width={explorerWidth}
          />
          <div
            role="separator"
            aria-orientation="vertical"
            title="Drag to resize"
            onMouseDown={() => setResizingExplorer(true)}
            style={{
              width: 6,
              cursor: "col-resize",
              background: resizingExplorer ? "var(--bd3)" : "transparent",
              borderRight: "1px solid var(--bd)",
              borderLeft: "1px solid var(--bd)",
              flexShrink: 0,
            }}
          />
        </>
      ) : null}
      <CanvasPanel
        workspaceId={workspaceId}
        projectId={resolvedProject?.id ?? ""}
        pipelineId={pipelineId}
        dataset={activeDataset}
        loading={loading}
        dataError={datasetError ?? undefined}
        columns={data?.columns ?? []}
        rows={data?.rows ?? []}
        lastAction={steps.length ? steps[steps.length - 1].operation : "Idle"}
        onSheetsExport={() => setSheetsExportOpen(true)}
        onImport={() => setImportOpen(true)}
        onArtifactSaved={() => setDatasetRefreshNonce((value) => value + 1)}
        sessionPreviewRows={showingOriginal ? undefined : sessionPreview?.rows}
        sessionPreviewColumns={showingOriginal ? undefined : sessionPreview?.columns}
        showingOriginal={showingOriginal && !!sessionPreview}
        onViewOriginal={() => setShowingOriginal(true)}
        onViewCleaned={() => setShowingOriginal(false)}
        onSave={liveArtifact && liveArtifact.sessionId !== "replayed" ? async () => {
          await api.post("/api/artifacts/save-checkpoint", {
            session_id: liveArtifact.sessionId,
            table_name: liveArtifact.tableName,
            artifact_name: liveArtifact.stepLabel,
            source_dataset_id: activeDataset?.id,
          });
          setDatasetRefreshNonce((v) => v + 1);
        } : undefined}
        onRunPipeline={handleRunPipeline}
        replayingPipeline={replayingPipeline}
        replayError={replayError}
        onClearReplayError={() => setReplayError(null)}
      />
      {/* Pipeline column — dedicated panel between canvas and AI */}
      {pipelineOpen ? (
        <>
          <div
            role="separator"
            aria-orientation="vertical"
            title="Drag to resize pipeline panel"
            onMouseDown={() => setResizingPipeline(true)}
            style={{
              width: 6,
              cursor: "col-resize",
              background: resizingPipeline ? "var(--bd3)" : "transparent",
              borderRight: "1px solid var(--bd)",
              borderLeft: "1px solid var(--bd)",
              flexShrink: 0,
            }}
          />
          <PipelinePanel
            width={pipelineWidth}
            onClose={() => {
              setPipelineOpen(false);
              localStorage.setItem("pipelineOpen", "false");
            }}
            onRunPipeline={handleRunPipeline}
          />
        </>
      ) : null}
      {/* AI panel drag handle */}
      <div
        role="separator"
        aria-orientation="vertical"
        title="Drag to resize AI panel"
        onMouseDown={() => setResizingAI(true)}
        style={{
          width: 6,
          cursor: "col-resize",
          background: resizingAI ? "var(--bd3)" : "transparent",
          borderRight: "1px solid var(--bd)",
          borderLeft: "1px solid var(--bd)",
          flexShrink: 0,
        }}
      />
      <AIPanel
        dataset={activeDataset}
        workspaceId={workspaceId}
        projectId={resolvedProject?.id ?? "default"}
        width={aiWidth}
        onStepApplied={() => {
          setDatasetRefreshNonce((value) => value + 1);
          void refetch();
        }}
        onDatasetMutated={() => {
          setDatasetRefreshNonce((value) => value + 1);
        }}
        onSessionPreview={(rows, columns) => {
          skipNextClearRef.current = true;
          setSessionPreview({ rows, columns });
        }}
        onUploadClick={() => setImportOpen(true)}
      />
      <ImportModal workspaceId={workspaceId} open={importOpen} onClose={() => { setImportOpen(false); setSampleUrl(undefined); }} onImported={() => void refetch()} preloadUrl={sampleUrl} />
      {sheetsExportOpen && activeDataset && (
        <SheetsExportModal
          datasetId={activeDataset.id}
          datasetName={activeDataset.name}
          onClose={() => setSheetsExportOpen(false)}
        />
      )}
      {welcomeOpen && (
        <WelcomeModal
          onClose={() => { setWelcomeOpen(false); }}
          onUploadSample={(url) => {
            setWelcomeOpen(false);
            setSampleUrl(url);
            setImportOpen(true);
          }}
        />
      )}
      {!onboardingDismissed && (
        <div style={{ position: "fixed", bottom: 16, right: 16, zIndex: 900, width: 260 }}>
          <OnboardingProgress
            hasUploadedFirstFile={hasUploadedFirstFile}
            hasCompletedOnboarding={hasCompletedOnboarding}
            hasAskedFirstQuestion={hasAskedFirstQuestion}
            onDismiss={() => {
              setOnboardingDismissed(true);
              capture("onboarding_progress_dismissed");
            }}
            onStartTour={!tourActive ? startTour : undefined}
          />
        </div>
      )}
      {tourActive && (
        <TourTooltip
          step={currentStep}
          onNext={() => nextStep(STEPS.length)}
          onSkip={skipTour}
        />
      )}
    </main>
    </>
  );
}
