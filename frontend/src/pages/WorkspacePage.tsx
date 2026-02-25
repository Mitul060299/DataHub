import { useState } from "react";
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

  return (
    <main style={{ height: "calc(100% - var(--th))", display: "flex", minWidth: 0, minHeight: 0 }}>
      <ActivityBar explorerOpen={explorerOpen} onToggleExplorer={() => setExplorerOpen((value) => !value)} />
      {explorerOpen ? <ExplorerPanel workspaceId={workspaceId} /> : null}
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
        onStepApplied={() => void refetch()}
      />
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onImported={() => void refetch()} />
    </main>
  );
}
