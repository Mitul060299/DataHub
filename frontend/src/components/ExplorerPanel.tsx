import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, deleteDataset, renameDataset, promoteToRoot } from "../api";
import { useWorkspaceContext, type Dataset } from "../contexts/WorkspaceContext";
import { IconChevronDown, IconDatabase } from "./Icons";
import { DataSection } from "./DataSection";
import { PipelineScheduleTab } from "./PipelineScheduleTab";
import { ProjectModal } from "./modals/ProjectModal";
import { ImportModal } from "./modals/ImportModal";
import { ConnectorModal } from "./modals/ConnectorModal";
import { usePipelineContext } from "../contexts/PipelineContext";
import { listVisualizations, type SavedVisualization } from "../api";
import { recordMilestone } from "../lib/activation";
import type { WorkspaceMode } from "../pages/WorkspacePage";

interface ExplorerPanelProps {
  refreshNonce?: number;
  searchFocusNonce?: number;
  width?: number;
  mode?: WorkspaceMode;
  pipelineId?: string;
  selectedStepId?: string;
  onStepSelect?: (step: import("../contexts/PipelineContext").PipelineStep | null) => void;
}

export function ExplorerPanel({ refreshNonce, searchFocusNonce, width, mode, pipelineId, selectedStepId, onStepSelect }: ExplorerPanelProps) {
  const { activeProject, setActiveProject, activeDataset, setActiveDataset, projectsLoading } = useWorkspaceContext();
  const { steps } = usePipelineContext();

  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [connectorModalOpen, setConnectorModalOpen] = useState(false);
  const [importMenuOpen, setImportMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [datasetLoadError, setDatasetLoadError] = useState<string | null>(null);
  const [datasetsLoading, setDatasetsLoading] = useState(true);
  const [pendingActivateId, setPendingActivateId] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Visualizations list (dashboard mode)
  const [vizList, setVizList] = useState<SavedVisualization[]>([]);
  const [vizLoading, setVizLoading] = useState(false);

  // Allow other components (e.g. CanvasPanel empty state) to open the connector modal.
  useEffect(() => {
    function handleConnectDatabase() {
      setConnectorModalOpen(true);
    }
    window.addEventListener("datahub:connect:database", handleConnectDatabase);
    return () => window.removeEventListener("datahub:connect:database", handleConnectDatabase);
  }, []);

  // Allow WorkspacePage (and others) to trigger auto-activation of a dataset
  // by ID after an import without needing to prop-drill setPendingActivateId.
  useEffect(() => {
    function handleActivate(e: Event) {
      const id = (e as CustomEvent<string>).detail;
      if (id) setPendingActivateId(id);
    }
    window.addEventListener("datahub:activate-dataset", handleActivate);
    return () => window.removeEventListener("datahub:activate-dataset", handleActivate);
  }, []);

  const datasetsById = useMemo(() => {
    const datasetMap = new Map<string, Dataset>();
    for (const dataset of datasets) {
      datasetMap.set(dataset.id, dataset);
    }
    return datasetMap;
  }, [datasets]);

  const sourceDatasets = useMemo(() => {
    const lowered = searchQuery.trim().toLowerCase();
    if (!lowered) return datasets;
    return datasets.filter((dataset) => (dataset.name ?? "").toLowerCase().includes(lowered));
  }, [datasets, searchQuery]);

  const loadDatasets = useCallback(async (attempt = 0) => {
    const cacheKey = `dh_ds_${activeProject?.id ?? "all"}`;
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
      // 90s covers Render cold-start (can take 50-60s on free tier)
      timeout: 90000,
    };
    try {
      const response = await api.get("/datasets", requestConfig);
      const mapped = (response.data ?? []).map((item: Record<string, unknown>) => ({
        id: String(item.id ?? item.dataset_id ?? ""),
        name: String(item.name ?? item.filename ?? item.table_name ?? "dataset"),
        rows: Number(item.row_count ?? item.rows ?? 0),
        // Live-connected datasets get a distinct badge instead of 'parquet'
        format: item.import_mode === "live"
          ? "live"
          : item.file_format ? String(item.file_format) : null,
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
      const isNetworkError = !maybeError.response && (maybeError.message ?? "").toLowerCase().includes("network error");
      const status = maybeError.response?.status;
      const isRetriable = isTimeout || isNetworkError || status === 502 || status === 503 || status === 504;
      // Auto-retry once on network error / timeout / gateway error (Render deploy window or cold-start)
      if (isRetriable && attempt === 0) {
        setDatasetLoadError("Backend is waking up, retrying…");
        await new Promise((resolve) => setTimeout(resolve, 3000));
        return loadDatasets(1);
      }
      const detail = maybeError.response?.data?.detail
        ?? maybeError.response?.data?.message
        ?? maybeError.message
        ?? "Failed to load datasets";
      const message = isNetworkError || isTimeout
        ? "Backend is taking too long to respond. Please click retry or wait and refresh."
        : status
          ? `${detail} (HTTP ${status})`
          : detail;
      setDatasetLoadError(message);
      setDatasets([]);
    } finally {
      setDatasetsLoading(false);
    }
  }, [activeProject?.id]);  // eslint-disable-line react-hooks/exhaustive-deps

  const removeDataset = async (dataset: Dataset) => {
    if (!dataset.id) return;
    // Optimistic removal — instantly reflects in the UI
    setDatasets((prev) => prev.filter((d) => d.id !== dataset.id));
    if (activeDataset?.id === dataset.id) setActiveDataset(null);
    try {
      await deleteDataset(dataset.id);
    } catch {
      // Restore the item and surface a brief error message
      setDatasets((prev) =>
        prev.find((d) => d.id === dataset.id) ? prev : [...prev, dataset]
      );
      setDatasetLoadError("Failed to delete — please try again.");
      setTimeout(() => setDatasetLoadError(null), 4000);
    }
  };

  const handlePromoteToRoot = async (dataset: Dataset) => {
    if (!dataset.id) return;
    try {
      await promoteToRoot(dataset.id);
      // Clear any inherited steps stored under this dataset's ID.
      localStorage.removeItem(`datahub_steps_v2_${dataset.id}`);
      // Update the active dataset record in context so UI reflects no parentId.
      if (activeDataset?.id === dataset.id) {
        setActiveDataset({ ...dataset, parentId: null });
      }
      window.dispatchEvent(new CustomEvent("datahub:dataset:promoted", { detail: dataset.id }));
      void loadDatasets();
    } catch {
      setDatasetLoadError("Failed to promote dataset — please try again.");
      setTimeout(() => setDatasetLoadError(null), 4000);
    }
  };

  // Wait for the project list to resolve so loadDatasets runs exactly once
  // with the correct project_id, eliminating the wasted blank-project-id request
  // that fires on every cold mount (Render cold-start double-fetch).
  useEffect(() => {
    if (projectsLoading) return;
    void loadDatasets();
  }, [loadDatasets, refreshNonce, projectsLoading]);

  // After datasets load, auto-restore the last selected dataset from localStorage
  // so chat history and pipeline context survive page reloads.
  useEffect(() => {
    if (datasetsLoading || datasets.length === 0 || activeDataset) return;
    const lastId = localStorage.getItem("activeDatasetId");
    if (!lastId) return;
    const match = datasets.find((d) => d.id === lastId);
    if (match) setActiveDataset(match);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetsLoading, datasets]);

  // Auto-activate a newly uploaded dataset when its id arrives via pendingActivateId.
  useEffect(() => {
    if (!pendingActivateId || datasetsLoading) return;
    const match = datasets.find((d) => d.id === pendingActivateId);
    if (match) {
      setActiveDataset(match);
      setPendingActivateId(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingActivateId, datasetsLoading, datasets]);

  useEffect(() => {
    if (typeof searchFocusNonce !== "number") return;
    searchInputRef.current?.focus();
    searchInputRef.current?.select();
  }, [searchFocusNonce]);

  // Load visualizations when in dashboard mode
  const loadVizList = useCallback(async () => {
    setVizLoading(true);
    try {
      const data = await listVisualizations(activeProject?.id);
      setVizList(data);
    } catch {
      setVizList([]);
    } finally {
      setVizLoading(false);
    }
  }, [activeProject?.id]);

  useEffect(() => {
    if (mode !== "dashboard") return;
    void loadVizList();
    function handleVizRefresh() { void loadVizList(); }
    window.addEventListener("datahub:visualizations:refresh", handleVizRefresh);
    return () => window.removeEventListener("datahub:visualizations:refresh", handleVizRefresh);
  }, [mode, loadVizList]);

  return (
    <aside style={{ width: width ?? 228, minWidth: width ?? 228, borderRight: "1px solid var(--bd3)", background: "var(--bg2)", padding: 12, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div className="proj-selector" onClick={() => setProjectModalOpen(true)} style={{ border: "1px solid var(--bd3)", background: "var(--bg3)", borderRadius: "var(--r8)", height: 36, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 8px", marginBottom: 10 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 20, height: 20, borderRadius: 5, background: activeProject?.color ?? "var(--ac)", display: "grid", placeItems: "center", fontSize: 11 }}>
            {activeProject?.initial ?? "D"}
          </div>
          <span>{activeProject?.name ?? "Select Project"}</span>
        </div>
        <IconChevronDown size={14} />
      </div>

      {mode === "data" || !mode ? (
        <input
          ref={searchInputRef}
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search datasets..."
          style={{
            width: "100%",
            height: 32,
            border: "1px solid var(--bd2)",
            borderRadius: "var(--r8)",
            background: "var(--bg2)",
            color: "var(--tx0)",
            padding: "0 10px",
            marginBottom: 10,
            fontSize: 12,
            transition: "border-color 0.15s ease, box-shadow 0.15s ease",
          }}
        />
      ) : null}
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
          <div style={{ borderTop: "1px solid var(--bd)", marginTop: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 0", color: "var(--tx1)", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em" }}>DATA</div>
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
        <div>
          {mode === "pipeline" ? (
            /* Pipeline mode: hint + schedule/run controls */
            <div>
              <div style={{ fontSize: 11, color: "var(--tx2)", padding: "6px 2px 10px", fontStyle: "italic" }}>
                {steps.length === 0
                  ? "No steps yet — build your pipeline in the Data tab"
                  : `${steps.length} step${steps.length === 1 ? "" : "s"} · see the pipeline graph →`}
              </div>
              {pipelineId && <PipelineScheduleTab pipelineId={pipelineId} />}
            </div>
          ) : mode === "dashboard" ? (
            /* Dashboard mode: datasets list + visualizations list */
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              <DataSection
                datasets={sourceDatasets}
                activeDatasetId={activeDataset?.id}
                onSelect={setActiveDataset}
                onImport={() => setImportModalOpen(true)}
                onAddConnection={() => setConnectorModalOpen(true)}
                onRemove={(dataset) => void removeDataset(dataset)}
                onPromoteToRoot={(dataset) => void handlePromoteToRoot(dataset)}
                onRename={async (dataset, name) => {
                  await renameDataset(dataset.id, name);
                  void loadDatasets();
                }}
              />
              {/* Visualizations section */}
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "var(--tx2)", padding: "6px 0", borderTop: "1px solid var(--bd)" }}>VISUALIZATIONS</div>
                {vizLoading ? (
                  <>
                    {[80, 65, 72].map((w, i) => (
                      <div key={i} style={{
                        height: 28, borderRadius: 6, marginBottom: 4,
                        background: "linear-gradient(90deg, var(--bg2) 25%, var(--bg3,#1e1e28) 50%, var(--bg2) 75%)",
                        backgroundSize: "200% 100%", animation: "dh-shimmer 1.4s infinite",
                        width: `${w}%`, opacity: 0.7,
                      }} />
                    ))}
                  </>
                ) : vizList.length === 0 ? (
                  <div style={{ fontSize: 11, color: "var(--tx2)", padding: "6px 2px", fontStyle: "italic" }}>No charts yet — ask AI to create one</div>
                ) : (
                  vizList.map((viz) => (
                    <button
                      key={viz.id}
                      onClick={() => window.dispatchEvent(new CustomEvent("datahub:dashboard:focus-viz", { detail: viz.id }))}
                      style={{
                        display: "flex", alignItems: "center", gap: 7, width: "100%",
                        padding: "5px 6px", marginBottom: 3, borderRadius: 6,
                        border: "1px solid var(--bd)", background: "var(--bg3)",
                        cursor: "pointer", textAlign: "left",
                      }}
                    >
                      <span style={{ flex: 1, fontSize: 11, color: "var(--tx0)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{viz.name}</span>
                      <span style={{ fontSize: 9, fontWeight: 700, color: "var(--tx2)", background: "var(--bg2)", border: "1px solid var(--bd2)", borderRadius: 4, padding: "1px 5px", flexShrink: 0, letterSpacing: "0.04em" }}>{viz.chart_type}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          ) : (
          /* Data mode (default) */
          <DataSection
            datasets={sourceDatasets}
            activeDatasetId={activeDataset?.id}
            onSelect={setActiveDataset}
            onImport={() => setImportModalOpen(true)}
            onAddConnection={() => setConnectorModalOpen(true)}
            onRemove={(dataset) => void removeDataset(dataset)}
            onPromoteToRoot={(dataset) => void handlePromoteToRoot(dataset)}
            onRename={async (dataset, name) => {
              await renameDataset(dataset.id, name);
              void loadDatasets();
            }}
          />
          )}
        </div>
        )}
      </div>

      {(mode === "data" || !mode) && (
        <div style={{ position: "relative", marginTop: 10 }}>
          <button
            onClick={() => setImportMenuOpen((v) => !v)}
            style={{
              width: "100%", height: 34, border: "none", borderRadius: 8,
              background: "var(--ac)", color: "#fff", fontSize: 12, fontWeight: 600,
              cursor: "pointer", letterSpacing: "0.01em",
            }}
          >
            + Import data
          </button>
          {importMenuOpen && (
            <div
              onMouseLeave={() => setImportMenuOpen(false)}
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: "calc(100% + 4px)",
                zIndex: 200,
                background: "var(--bg2)",
                border: "1px solid var(--bd)",
                borderRadius: "var(--r6)",
                boxShadow: "0 4px 12px rgba(0,0,0,.25)",
                overflow: "hidden",
              }}
            >
              {([
                { label: "Upload file", icon: <span style={{ fontSize: 13, lineHeight: 1 }}>+</span>, action: () => { setImportMenuOpen(false); setImportModalOpen(true); } },
                { label: "Connect database", icon: <IconDatabase size={13} />, action: () => { setImportMenuOpen(false); setConnectorModalOpen(true); } },
              ] as { label: string; icon: React.ReactNode; action: () => void }[]).map(({ label, icon, action }) => (
                <button
                  key={label}
                  onClick={action}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    width: "100%",
                    padding: "7px 12px",
                    fontSize: 12,
                    color: "var(--tx1)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg3)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                >
                  {icon}
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <ProjectModal
        open={projectModalOpen}
        onClose={() => setProjectModalOpen(false)}
        onSelect={setActiveProject}
      />
      <ImportModal
        open={importModalOpen}
        projectId={activeProject?.id}
        onClose={() => setImportModalOpen(false)}
        onImported={(datasetId) => {
          setImportModalOpen(false);
          if (datasetId) setPendingActivateId(datasetId);
          recordMilestone("dataset_uploaded", {
            $add: { total_datasets_uploaded: 1 },
            $set_once: { first_dataset_at: new Date().toISOString() },
            $set: { last_dataset_at: new Date().toISOString() },
          });
          void loadDatasets();
        }}
      />
      <ConnectorModal
        open={connectorModalOpen}
        onClose={() => setConnectorModalOpen(false)}
        onImported={() => void loadDatasets()}
        projectId={activeProject?.id}
      />
    </aside>
  );
}
