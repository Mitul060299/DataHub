import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ActivityBar } from "../components/ActivityBar";
import { Breadcrumb } from "../components/Breadcrumb";
import { AIPanel } from "../components/AIPanel";
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
  const { runPipeline, steps } = usePipelineContext();
  const { data, loading, refetch } = useDataset(activeDataset?.id);
  const { hasCompletedOnboarding, hasUploadedFirstFile, markOnboardingComplete } = useUser();
  const [explorerOpen, setExplorerOpen] = useState(true);
  const [importOpen, setImportOpen] = useState(false);
  const [datasetRefreshNonce, setDatasetRefreshNonce] = useState(0);
  const [explorerSearchFocusNonce, setExplorerSearchFocusNonce] = useState(0);
  const [explorerWidth, setExplorerWidth] = useState(280);
  const [resizingExplorer, setResizingExplorer] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const [hasAskedFirstQuestion, setHasAskedFirstQuestion] = useState(false);
  const [sheetsExportOpen, setSheetsExportOpen] = useState(false);
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

  useEffect(() => {
    if (!resizingExplorer) return;

    const handleMouseMove = (event: MouseEvent) => {
      const minWidth = 220;
      const maxWidth = 520;
      const activityBarWidth = 52;
      const nextWidth = Math.max(minWidth, Math.min(maxWidth, event.clientX - activityBarWidth));
      setExplorerWidth(nextWidth);
    };

    const stopResizing = () => setResizingExplorer(false);

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", stopResizing);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", stopResizing);
    };
  }, [resizingExplorer]);

  const breadcrumbSegments = [
    { label: "Workspace", href: "/workspace" },
    ...(resolvedProject
      ? [{ label: resolvedProject.name, href: `/workspace/project/${resolvedProject.id}` }]
      : []),
    { label: "Pipeline Editor" },
  ];

  return (
    <>
      <Breadcrumb segments={breadcrumbSegments} />
      <main style={{ height: "calc(100% - var(--th) - 36px)", display: "flex", minWidth: 0, minHeight: 0 }}>
      <ActivityBar
        explorerOpen={explorerOpen}
        onToggleExplorer={() => setExplorerOpen((value) => !value)}
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
      />
      <AIPanel
        dataset={activeDataset}
        workspaceId={workspaceId}
        projectId={resolvedProject?.id ?? "default"}
        onStepApplied={() => {
          setDatasetRefreshNonce((value) => value + 1);
          void refetch();
        }}
        onDatasetMutated={() => {
          // Refresh the sidebar dataset list. Do NOT call refetch() here —
          // when activeDataset.id changes (new artifact created), useDataset
          // reloads automatically via useEffect. Calling refetch() with the
          // stale source-dataset id would race against and overwrite the new
          // artifact data.
          setDatasetRefreshNonce((value) => value + 1);
        }}
      />
      <ImportModal workspaceId={workspaceId} open={importOpen} onClose={() => setImportOpen(false)} onImported={() => void refetch()} />
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
          onUploadSample={(_url) => {
            setWelcomeOpen(false);
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
          />
          {!tourActive && (
            <button
              className="btn"
              style={{ marginTop: 6, width: "100%", fontSize: 12 }}
              onClick={() => { startTour(); }}
            >
              🗺 Take a tour
            </button>
          )}
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
