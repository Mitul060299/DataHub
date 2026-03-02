import { useCallback, useEffect, useMemo, useState } from "react";
import { api, deleteDataset } from "../api";
import { usePipeline } from "../hooks/usePipeline";
import { useWorkspaceContext, type Dataset } from "../contexts/WorkspaceContext";
import { IconChevronDown, IconTeam } from "./Icons";
import { ArtifactsSection, type ArtifactItem } from "./ArtifactsSection";
import { DataSection } from "./DataSection";
import { PipelineSection } from "./PipelineSection";
import { MembersModal } from "./modals/MembersModal";
import { ProjectModal } from "./modals/ProjectModal";
import { ImportModal } from "./modals/ImportModal";
import { ScheduleModal } from "./modals/ScheduleModal";
import { usePipelineContext } from "../contexts/PipelineContext";

interface ExplorerPanelProps {
  workspaceId: string;
  refreshNonce?: number;
}

export function ExplorerPanel({ workspaceId, refreshNonce }: ExplorerPanelProps) {
  const { activeProject, setActiveProject, activeDataset, setActiveDataset, members } = useWorkspaceContext();
  const { steps, setScheduleInfo } = usePipelineContext();
  const { exportPipeline, schedule } = usePipeline();

  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [membersModalOpen, setMembersModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);

  const operationByOutputDataset = useMemo(() => {
    const outputMap = new Map<string, string>();
    for (const step of steps) {
      if (step.outputDataset?.id) {
        outputMap.set(step.outputDataset.id, step.operation);
      }
    }
    return outputMap;
  }, [steps]);

  const datasetsById = useMemo(() => {
    const datasetMap = new Map<string, Dataset>();
    for (const dataset of datasets) {
      datasetMap.set(dataset.id, dataset);
    }
    return datasetMap;
  }, [datasets]);

  const sourceDatasets = useMemo(
    () => datasets.filter((dataset) => !dataset.parentId || !datasetsById.has(dataset.parentId)),
    [datasets, datasetsById],
  );

  const artifacts = useMemo<ArtifactItem[]>(() => {
    const tableOps = new Set(["group_by", "pivot", "unpivot", "join", "union", "distinct", "sample", "filter_rows", "sort"]);
    const metricOps = new Set(["aggregate", "bin_values"]);
    const variableOps = new Set(["create_column", "split_column", "merge_columns", "change_type", "rename_columns", "replace_values"]);

    return datasets
      .filter((dataset) => Boolean(dataset.parentId && datasetsById.has(dataset.parentId)))
      .map((dataset) => {
        const operation = (operationByOutputDataset.get(dataset.id) || "").toLowerCase();
        let kind: ArtifactItem["kind"] = "table";
        if (metricOps.has(operation)) {
          kind = "metric";
        } else if (variableOps.has(operation)) {
          kind = "variable";
        } else if (tableOps.has(operation)) {
          kind = "table";
        }
        return { ...dataset, kind };
      });
  }, [datasets, datasetsById, operationByOutputDataset]);

  const loadDatasets = useCallback(async () => {
    if (!activeProject?.id) {
      setDatasets([]);
      return;
    }
    try {
      const response = await api.get("/datasets", { params: { project_id: activeProject.id } });
      const mapped = (response.data ?? []).map((item: Record<string, unknown>) => ({
        id: String(item.id ?? item.dataset_id ?? ""),
        name: String(item.name ?? item.filename ?? item.table_name ?? "dataset"),
        rows: Number(item.row_count ?? item.rows ?? 0),
        parentId: item.parent_id ? String(item.parent_id) : null,
      }));
      setDatasets(mapped);
    } catch {
      setDatasets([]);
    }
  }, [activeProject?.id]);

  const removeDataset = async (dataset: Dataset) => {
    if (!dataset.id) return;
    try {
      await deleteDataset(dataset.id);
      if (activeDataset?.id === dataset.id) {
        setActiveDataset(null);
      }
    } catch {
      await Promise.resolve();
    } finally {
      await loadDatasets();
    }
  };

  useEffect(() => {
    void loadDatasets();
  }, [loadDatasets, refreshNonce]);

  return (
    <aside style={{ width: "var(--sw)", minWidth: "var(--sw)", borderRight: "1px solid var(--bd)", background: "var(--bg1)", padding: 10, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div className="proj-selector" onClick={() => setProjectModalOpen(true)} style={{ border: "1px solid var(--bd2)", background: "var(--bg2)", borderRadius: "var(--r8)", height: 36, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 8px", marginBottom: 10 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 20, height: 20, borderRadius: 5, background: activeProject?.color ?? "var(--ac)", display: "grid", placeItems: "center", fontSize: 11 }}>
            {activeProject?.initial ?? "D"}
          </div>
          <span>{activeProject?.name ?? "Select Project"}</span>
        </div>
        <IconChevronDown size={14} />
      </div>

      <div className="members-strip" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "inline-flex", alignItems: "center" }}>
          {members.map((member, index) => (
            <div key={member.id} title={member.name} style={{ width: 22, height: 22, borderRadius: 999, border: "1px solid var(--bg1)", background: "var(--acg)", display: "grid", placeItems: "center", marginLeft: index ? -5 : 0, fontSize: 11 }}>
              {member.name.slice(0, 1).toUpperCase()}
            </div>
          ))}
        </div>
        <button className="btn" onClick={() => setMembersModalOpen(true)} style={{ height: 24, fontSize: 11 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><IconTeam size={13} />+ Invite</span>
        </button>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        <DataSection
          datasets={sourceDatasets}
          activeDatasetId={activeDataset?.id}
          onSelect={setActiveDataset}
          onImport={() => setImportModalOpen(true)}
          onRemove={(dataset) => void removeDataset(dataset)}
        />
        <PipelineSection
          onSchedule={() => setScheduleModalOpen(true)}
          onExport={() => exportPipeline(steps)}
        />
        <ArtifactsSection
          artifacts={artifacts}
          activeDatasetId={activeDataset?.id}
          onSelect={setActiveDataset}
          onRemove={(dataset) => void removeDataset(dataset)}
        />
      </div>

      <MembersModal open={membersModalOpen} workspaceId={workspaceId} onClose={() => setMembersModalOpen(false)} />
      <ProjectModal
        open={projectModalOpen}
        workspaceId={workspaceId}
        onClose={() => setProjectModalOpen(false)}
        onSelect={setActiveProject}
      />
      <ImportModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onImported={() => {
          setImportModalOpen(false);
          void loadDatasets();
        }}
      />
      <ScheduleModal
        open={scheduleModalOpen}
        onClose={() => setScheduleModalOpen(false)}
        onConfirm={(payload) => {
          setScheduleInfo(payload);
          void schedule("default", payload.cron);
        }}
      />
    </aside>
  );
}
