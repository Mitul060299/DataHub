import { useEffect, useState } from "react";
import { ActivityBar } from "../components/ActivityBar";
import { AIPanel } from "../components/AIPanel";
import { CanvasPanel } from "../components/CanvasPanel";
import { ExplorerPanel } from "../components/ExplorerPanel";
import { ImportModal } from "../components/modals/ImportModal";
import { usePipelineContext } from "../contexts/PipelineContext";
import { useWorkspaceContext } from "../contexts/WorkspaceContext";
import { useDataset } from "../hooks/useDataset";
import { usePipeline } from "../hooks/usePipeline";

const workspaceId = "default";

export function WorkspacePage() {
  const { activeProject, activeDataset } = useWorkspaceContext();
  const { runPipeline, steps } = usePipelineContext();
  const { exportPipeline } = usePipeline();
  const { data, loading, refetch } = useDataset(activeDataset?.id);
  const [explorerOpen, setExplorerOpen] = useState(true);
  const [importOpen, setImportOpen] = useState(false);
  const [datasetRefreshNonce, setDatasetRefreshNonce] = useState(0);
  const [explorerSearchFocusNonce, setExplorerSearchFocusNonce] = useState(0);
  const [explorerWidth, setExplorerWidth] = useState(280);
  const [resizingExplorer, setResizingExplorer] = useState(false);

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

  return (
    <main style={{ height: "calc(100% - var(--th))", display: "flex", minWidth: 0, minHeight: 0 }}>
      <ActivityBar
        explorerOpen={explorerOpen}
        onToggleExplorer={() => setExplorerOpen((value) => !value)}
        onSearch={() => {
          setExplorerOpen(true);
          setExplorerSearchFocusNonce((value) => value + 1);
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
        dataset={activeDataset}
        loading={loading}
        columns={data?.columns ?? []}
        rows={data?.rows ?? []}
        lastAction={steps.length ? steps[steps.length - 1].operation : "Idle"}
        onImport={() => setImportOpen(true)}
        onExport={() => exportPipeline(steps)}
        onRun={() => void runPipeline()}
      />
      <AIPanel
        dataset={activeDataset}
        workspaceId={workspaceId}
        projectId={activeProject?.id ?? "default"}
        onStepApplied={() => {
          setDatasetRefreshNonce((value) => value + 1);
          void refetch();
        }}
      />
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onImported={() => void refetch()} />
    </main>
  );
}
