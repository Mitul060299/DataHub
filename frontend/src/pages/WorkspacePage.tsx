import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
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

const workspaceId = "default";

export function WorkspacePage() {
  const { projectId } = useParams<{ projectId?: string }>();
  const { activeProject, activeDataset, projects } = useWorkspaceContext();

  // Resolve project from URL param or fall back to activeProject
  const resolvedProject = projectId
    ? (projects.find((p) => p.id === projectId) ?? activeProject)
    : activeProject;
  const { runPipeline, steps, liveArtifact } = usePipelineContext();
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
  const { tourActive, currentStep, startTour, nextStep, skipTour, isTourDone } = useTour();

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

  // Clear session preview whenever the user switches to a different source dataset
  useEffect(() => {
    setSessionPreview(null);
  }, [activeDataset?.id]);

  // Clear session preview when the live artifact is cleared (step deleted or artifact saved)
  useEffect(() => {
    if (!liveArtifact) setSessionPreview(null);
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
        dataset={activeDataset}
        loading={loading}
        dataError={datasetError ?? undefined}
        columns={data?.columns ?? []}
        rows={data?.rows ?? []}
        calculatedColumns={data?.calculatedColumns ?? []}
        lastAction={steps.length ? steps[steps.length - 1].operation : "Idle"}
        onSheetsExport={() => setSheetsExportOpen(true)}
        onImport={() => setImportOpen(true)}
        onColumnsChanged={() => {
          setDatasetRefreshNonce((value) => value + 1);
          void refetch();
        }}
        onArtifactSaved={() => setDatasetRefreshNonce((value) => value + 1)}
        sessionPreviewRows={sessionPreview?.rows}
        sessionPreviewColumns={sessionPreview?.columns}
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
        onSessionPreview={(rows, columns) => setSessionPreview({ rows, columns })}
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
