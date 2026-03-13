import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  searchFocusNonce?: number;
  width?: number;
}

export function ExplorerPanel({ workspaceId, refreshNonce, searchFocusNonce, width }: ExplorerPanelProps) {
  const { activeProject, setActiveProject, activeDataset, setActiveDataset, members } = useWorkspaceContext();
  const { steps, setScheduleInfo } = usePipelineContext();
  const { exportPipeline, schedule } = usePipeline();

  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [membersModalOpen, setMembersModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [datasetLoadError, setDatasetLoadError] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

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

  const sourceDatasets = useMemo(() => {
    const lowered = searchQuery.trim().toLowerCase();
    const base = datasets.filter((dataset) => !dataset.parentId || !datasetsById.has(dataset.parentId));
    if (!lowered) return base;
    return base.filter((dataset) => dataset.name.toLowerCase().includes(lowered));
  }, [datasets, datasetsById, searchQuery]);

  const artifacts = useMemo<ArtifactItem[]>(() => {
    const tableOps = new Set(["group_by", "pivot", "unpivot", "join", "union", "distinct", "sample", "filter_rows", "sort"]);
    const metricOps = new Set(["aggregate", "bin_values"]);
    const variableOps = new Set(["create_column", "split_column", "merge_columns", "change_type", "rename_columns", "replace_values"]);

    const parentIds = new Set(
      datasets
        .map((dataset) => dataset.parentId)
        .filter((parentId): parentId is string => Boolean(parentId))
    );
    const hasTrackedOutputs = operationByOutputDataset.size > 0;

    const derived = datasets
      .filter((dataset) => Boolean(
        dataset.parentId
        && datasetsById.has(dataset.parentId)
        && !parentIds.has(dataset.id)
        && (!hasTrackedOutputs || operationByOutputDataset.has(dataset.id))
      ))
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

    const lowered = searchQuery.trim().toLowerCase();
    if (!lowered) return derived;
    return derived.filter((dataset) => dataset.name.toLowerCase().includes(lowered));
  }, [datasets, datasetsById, operationByOutputDataset, searchQuery]);

  const loadDatasets = useCallback(async () => {
    if (!activeProject?.id) {
      setDatasets([]);
      setDatasetLoadError(null);
      return;
    }
    try {
      const response = await api.get("/datasets", {
        params: { project_id: activeProject.id },
        headers: workspaceId ? { "X-Workspace-Id": workspaceId } : undefined,
        timeout: 120000,
      });
      const mapped = (response.data ?? []).map((item: Record<string, unknown>) => ({
        id: String(item.id ?? item.dataset_id ?? ""),
        name: String(item.name ?? item.filename ?? item.table_name ?? "dataset"),
        rows: Number(item.row_count ?? item.rows ?? 0),
        format: item.file_format ? String(item.file_format) : null,
        parentId: item.parent_id ? String(item.parent_id) : null,
      }));
      setDatasets(mapped);
      setDatasetLoadError(null);
    } catch (error: unknown) {
      const maybeError = error as {
        response?: { status?: number; data?: { detail?: string; message?: string } };
        message?: string;
      };
      const status = maybeError.response?.status;
      const detail = maybeError.response?.data?.detail
        ?? maybeError.response?.data?.message
        ?? maybeError.message
        ?? "Failed to load datasets";
      const message = detail.toLowerCase().includes("network error")
        ? "Network Error: Unable to reach backend API. Verify deployment health and /api routing."
        : status
          ? `${detail} (HTTP ${status})`
          : detail;
      setDatasetLoadError(message);
      setDatasets([]);
    }
  }, [activeProject?.id, workspaceId]);

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

  useEffect(() => {
    if (typeof searchFocusNonce !== "number") return;
    searchInputRef.current?.focus();
    searchInputRef.current?.select();
  }, [searchFocusNonce]);

  return (
    <aside style={{ width: width ?? 228, minWidth: width ?? 228, borderRight: "1px solid var(--bd)", background: "var(--bg1)", padding: 10, display: "flex", flexDirection: "column", minHeight: 0 }}>
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

      <input
        ref={searchInputRef}
        value={searchQuery}
        onChange={(event) => setSearchQuery(event.target.value)}
        placeholder="Search datasets and artifacts..."
        style={{
          width: "100%",
          height: 30,
          border: "1px solid var(--bd2)",
          borderRadius: "var(--r8)",
          background: "var(--bg2)",
          color: "var(--tx0)",
          padding: "0 10px",
          marginBottom: 10,
        }}
      />
      {datasetLoadError ? (
        <p style={{ margin: "0 0 10px", color: "var(--rd)", fontSize: 11 }}>
          {datasetLoadError}
        </p>
      ) : null}

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
        workspaceId={workspaceId}
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
