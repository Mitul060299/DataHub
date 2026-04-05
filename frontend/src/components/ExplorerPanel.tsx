import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, deleteDataset, renameDataset } from "../api";
import { usePipeline } from "../hooks/usePipeline";
import { useWorkspaceContext, type Dataset } from "../contexts/WorkspaceContext";
import { IconChevronDown, IconTeam } from "./Icons";
import { ArtifactsSection, type ArtifactItem } from "./ArtifactsSection";
import { VisualizationsSection } from "./VisualizationsSection";
import { DataSection } from "./DataSection";

import { PipelineSection } from "./PipelineSection";
import { TeamPanel } from "./TeamPanel";
import { ProjectModal } from "./modals/ProjectModal";
import { ImportModal } from "./modals/ImportModal";
import { ScheduleModal } from "./modals/ScheduleModal";
import { ConnectorModal } from "./modals/ConnectorModal";
import { usePipelineContext } from "../contexts/PipelineContext";

interface ExplorerPanelProps {
  workspaceId: string;
  refreshNonce?: number;
  searchFocusNonce?: number;
  width?: number;
}

export function ExplorerPanel({ workspaceId, refreshNonce, searchFocusNonce, width }: ExplorerPanelProps) {
  const { activeProject, setActiveProject, activeDataset, setActiveDataset, members, workspaceMembers, refreshMembers, projectsLoading } = useWorkspaceContext();
  const { steps, setScheduleInfo } = usePipelineContext();
  const { exportPipeline, schedule } = usePipeline();

  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [teamPanelOpen, setTeamPanelOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [connectorModalOpen, setConnectorModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [datasetLoadError, setDatasetLoadError] = useState<string | null>(null);
  const [datasetsLoading, setDatasetsLoading] = useState(true);
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

  const workflowLeafOutputIds = useMemo(() => {
    const outputIds = new Set<string>();
    const consumedIds = new Set<string>();

    for (const step of steps) {
      if (step.outputDataset?.id) {
        outputIds.add(step.outputDataset.id);
      }
      if (step.inputDataset?.id) {
        consumedIds.add(step.inputDataset.id);
      }
    }

    const leafIds = new Set<string>();
    for (const outputId of outputIds) {
      if (!consumedIds.has(outputId)) {
        leafIds.add(outputId);
      }
    }
    return leafIds;
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

    // Show all leaf datasets that have a known parent — i.e. outputs the agent
    // (or any pipeline step) produced from an uploaded dataset.  We deliberately
    // do NOT restrict by workflowLeafOutputIds here: that set is only populated
    // when the frontend has seen the agent.done event in this session.  Relying
    // on it causes artifacts to disappear on page reload or when the pipeline
    // recorder fails to persist steps cleanly.
    const parentIds = new Set(
      datasets
        .map((dataset) => dataset.parentId)
        .filter((parentId): parentId is string => Boolean(parentId))
    );

    const derived = datasets
      .filter((dataset) => Boolean(
        dataset.parentId
        && datasetsById.has(dataset.parentId)
        && !parentIds.has(dataset.id)
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

  const loadDatasets = useCallback(async (attempt = 0) => {
    const cacheKey = `dh_ds_${workspaceId}_${activeProject?.id ?? "all"}`;
    // Hydrate immediately from session cache so the list paints before the
    // network round-trip completes (especially useful on Render cold-starts).
    if (attempt === 0) {
      try {
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) {
          setDatasets(JSON.parse(cached) as Dataset[]);
          setDatasetsLoading(false);
        }
      } catch { /* ignore parse/quota errors */ }
    }
    setDatasetsLoading(true);
    const requestConfig = {
      params: activeProject?.id ? { project_id: activeProject.id } : undefined,
      headers: workspaceId ? { "X-Workspace-Id": workspaceId } : undefined,
      // 90s covers Render cold-start (can take 50-60s on free tier)
      timeout: 90000,
    };
    try {
      const response = await api.get("/datasets", requestConfig);
      const mapped = (response.data ?? []).map((item: Record<string, unknown>) => ({
        id: String(item.id ?? item.dataset_id ?? ""),
        name: String(item.name ?? item.filename ?? item.table_name ?? "dataset"),
        rows: Number(item.row_count ?? item.rows ?? 0),
        format: item.file_format ? String(item.file_format) : null,
        parentId: item.parent_id ? String(item.parent_id) : null,
      }));
      setDatasets(mapped);
      setDatasetLoadError(null);
      // Persist for instant hydration on next open
      try { sessionStorage.setItem(cacheKey, JSON.stringify(mapped)); } catch { /* ignore */ }
    } catch (error: unknown) {
      const maybeError = error as {
        response?: { status?: number; data?: { detail?: string; message?: string } };
        message?: string;
        code?: string;
      };
      const isTimeout = maybeError.code === "ECONNABORTED" || (maybeError.message ?? "").toLowerCase().includes("timeout");
      // Auto-retry once on timeout (backend cold-start wakeup)
      if (isTimeout && attempt === 0) {
        setDatasetLoadError("Backend is waking up, retrying…");
        await new Promise((resolve) => setTimeout(resolve, 2000));
        return loadDatasets(1);
      }
      const status = maybeError.response?.status;
      const detail = maybeError.response?.data?.detail
        ?? maybeError.response?.data?.message
        ?? maybeError.message
        ?? "Failed to load datasets";
      const message = detail.toLowerCase().includes("network error")
        ? "Network Error: Unable to reach backend API. Verify deployment health and /api routing."
        : isTimeout
          ? "Backend is taking too long to respond. Please click retry or wait and refresh."
          : status
            ? `${detail} (HTTP ${status})`
            : detail;
      setDatasetLoadError(message);
      setDatasets([]);
    } finally {
      setDatasetsLoading(false);
    }
  }, [activeProject?.id, workspaceId]);  // eslint-disable-line react-hooks/exhaustive-deps

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

  // Wait for the project list to resolve so loadDatasets runs exactly once
  // with the correct project_id, eliminating the wasted blank-project-id request
  // that fires on every cold mount (Render cold-start double-fetch).
  useEffect(() => {
    if (projectsLoading) return;
    void loadDatasets();
  }, [loadDatasets, refreshNonce, projectsLoading]);

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
          {(() => {
            const active = workspaceMembers.filter((m) => m.status === "active");
            const legacy = members;
            const displayList = active.length > 0 ? active : legacy;
            const shown = displayList.slice(0, 4);
            const overflow = displayList.length - shown.length;
            return (
              <>
                {shown.map((member, index) => (
                  <div
                    key={"id" in member ? member.id : member.id}
                    title={"email" in member ? member.email : member.name}
                    style={{ width: 22, height: 22, borderRadius: 999, border: "1px solid var(--bg1)", background: "var(--acg)", display: "grid", placeItems: "center", marginLeft: index ? -5 : 0, fontSize: 11 }}
                  >
                    {("email" in member ? member.email : member.name).slice(0, 1).toUpperCase()}
                  </div>
                ))}
                {overflow > 0 && (
                  <div style={{ width: 22, height: 22, borderRadius: 999, border: "1px solid var(--bg1)", background: "var(--bg3)", display: "grid", placeItems: "center", marginLeft: -5, fontSize: 10, color: "var(--tx1)" }}>
                    +{overflow}
                  </div>
                )}
              </>
            );
          })()}
        </div>
        <button className="btn" onClick={() => { setTeamPanelOpen(true); void refreshMembers(workspaceId); }} style={{ height: 24, fontSize: 11 }}>
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
        <div style={{ margin: "0 0 10px", display: "flex", alignItems: "flex-start", gap: 6 }}>
          <p style={{ margin: 0, color: datasetLoadError.includes("waking up") ? "var(--yl)" : "var(--rd)", fontSize: 11, flex: 1 }}>
            {datasetLoadError}
          </p>
          {!datasetLoadError.includes("waking up") ? (
            <button
              className="btn"
              style={{ height: 20, fontSize: 10, padding: "0 6px", flexShrink: 0 }}
              onClick={() => void loadDatasets()}
            >
              Retry
            </button>
          ) : null}
        </div>
      ) : null}

      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        {datasetsLoading && datasets.length === 0 ? (
          // Skeleton shimmer — shown only on first load before any cache exists
          <div style={{ borderTop: "1px solid var(--bd)", paddingTop: 8 }}>
            <div style={{ color: "var(--tx1)", fontSize: 11, letterSpacing: "0.08em", marginBottom: 8 }}>▼ DATA</div>
            {[70, 88, 55].map((w, i) => (
              <div key={i} style={{
                height: 30, borderRadius: 6, marginBottom: 4,
                background: "linear-gradient(90deg, var(--bg2) 25%, var(--bg3,#1e1e28) 50%, var(--bg2) 75%)",
                backgroundSize: "200% 100%",
                animation: "dh-shimmer 1.4s infinite",
                width: `${w}%`,
                opacity: 0.7,
              }} />
            ))}
            <style>{`@keyframes dh-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
          </div>
        ) : (
        <div data-tour="data-section">
        <DataSection
          datasets={sourceDatasets}
          activeDatasetId={activeDataset?.id}
          onSelect={setActiveDataset}
          onImport={() => setImportModalOpen(true)}
          onAddConnection={() => setConnectorModalOpen(true)}
          onRemove={(dataset) => void removeDataset(dataset)}
          onRename={async (dataset, name) => {
            await renameDataset(dataset.id, name);
            void loadDatasets();
          }}
        />
        </div>
        )}
        <div data-tour="pipeline-section">
        <PipelineSection
          onSchedule={() => setScheduleModalOpen(true)}
          onExport={() => exportPipeline(steps)}
        />
        </div>
        <ArtifactsSection
          artifacts={artifacts}
          activeDatasetId={activeDataset?.id}
          refreshNonce={refreshNonce}
          onSelect={setActiveDataset}
          onRemove={(dataset) => void removeDataset(dataset)}
          onRename={async (dataset, name) => {
            await renameDataset(dataset.id, name);
            void loadDatasets();
          }}
        />

        <div data-tour="viz-section">
        <VisualizationsSection />
        </div>

      </div>

      {teamPanelOpen && (
        <TeamPanel workspaceId={workspaceId} onClose={() => setTeamPanelOpen(false)} />
      )}
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
          void schedule("default", payload.cron, payload.autoRefreshOnUpload);
        }}
      />
      <ConnectorModal
        open={connectorModalOpen}
        onClose={() => setConnectorModalOpen(false)}
        onImported={() => void loadDatasets()}
      />
    </aside>
  );
}
