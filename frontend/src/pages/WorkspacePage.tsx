import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { api, fetchStepPreview } from "../api";
import { Breadcrumb } from "../components/Breadcrumb";
import { AIPanel } from "../components/AIPanel";
import { CanvasPanel } from "../components/CanvasPanel";
import { ExplorerPanel } from "../components/ExplorerPanel";
import type { PipelineStep } from "../contexts/PipelineContext";

export type WorkspaceMode = "data" | "pipeline" | "dashboard";
import { ImportModal } from "../components/modals/ImportModal";
import { SheetsExportModal } from "../components/SheetsExportModal";
import { usePipelineContext } from "../contexts/PipelineContext";
import { useWorkspaceContext } from "../contexts/WorkspaceContext";
import { useAuth } from "../contexts/AuthContext";
import { useUser } from "../contexts/UserContext";
import { useDataset } from "../hooks/useDataset";
import { capture, markAsRealUser } from "../lib/posthog";
import { recordMilestone } from "../lib/activation";


export function WorkspacePage() {
  const { projectId, pipelineId } = useParams<{ projectId?: string; pipelineId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isAnonymous } = useAuth();
  const { activeProject, activeDataset, setActiveDataset, activeLanes, removeLane, projects } = useWorkspaceContext();

  // Resolve project from URL param or fall back to activeProject
  const resolvedProject = projectId
    ? (projects.find((p) => p.id === projectId) ?? activeProject)
    : activeProject;
  const { steps, liveArtifact, setLiveArtifact, clearSteps } = usePipelineContext();
  const { data, loading, error: datasetError, refetch } = useDataset(activeDataset?.id);
  const { hasUploadedFirstFile, firstAiAnswerAt, recordMilestone: ctxRecordMilestone } = useUser();
  const [importOpen, setImportOpen] = useState(false);
  const [sampleUrl, setSampleUrl] = useState<string | undefined>(undefined);
  const [datasetRefreshNonce, setDatasetRefreshNonce] = useState(0);
  const [explorerSearchFocusNonce, setExplorerSearchFocusNonce] = useState(0);
  const [explorerWidth, setExplorerWidth] = useState(() => Number(localStorage.getItem("explorerWidth") ?? 280));
  const [resizingExplorer, setResizingExplorer] = useState(false);
  const [aiWidth, setAiWidth] = useState(() => Number(localStorage.getItem("aiWidth") ?? 320));
  const [resizingAI, setResizingAI] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("data");
  const [selectedPipelineStep, setSelectedPipelineStep] = useState<PipelineStep | null>(null);
  const [demoBannerDismissed, setDemoBannerDismissed] = useState(
    () => sessionStorage.getItem("datahub_demo_banner_dismissed") === "1",
  );
  const [hasAskedFirstQuestion, setHasAskedFirstQuestion] = useState(false);
  const [sheetsExportOpen, setSheetsExportOpen] = useState(false);
  const [sessionPreview, setSessionPreview] = useState<{ rows: Record<string, unknown>[]; columns: string[] } | null>(null);
  const [showingOriginal, setShowingOriginal] = useState(false);
  const [replayingPipeline, setReplayingPipeline] = useState(false);
  const [replayError, setReplayError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: "success" | "info" | "error" } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // When agent.done sets sessionPreview/liveArtifact AND switches the active
  // dataset in the same React batch, the clearing useEffect on activeDataset?.id
  // would destroy that freshly-set state. This ref tells the effect to skip one
  // clearing cycle so the agent-provided preview survives the dataset switch.
  const skipNextClearRef = useRef(false);

  // Re-execute all pipeline steps in the LIVE DuckDB session and restore the
  // session preview.  Called from the green banner / pipeline panel when the
  // user refreshes and `liveArtifact` is gone.
  //
  // CRITICAL: this used to call `/cleaning/datasets/.../replay`, which has the
  // side-effect of CREATING NEW PERSISTED `DatasetMetaDB` rows named
  // "X (transformed)" for every step.  Those rows then showed up under
  // ARTIFACTS, the active dataset could end up switched to one of them, and
  // the live banner / pipeline steps would disappear.  Replay must be a
  // session-only operation: it rebuilds the in-memory views and previews them.
  const handleRunPipeline = async () => {
    if (!activeDataset?.id || !steps.length || replayingPipeline) return;
    setReplayingPipeline(true);
    try {
      // Pick / generate a session id.  Order:
      //   1. The current liveArtifact's session (most likely fresh)
      //   2. The chat session for this dataset (persisted in localStorage)
      //   3. A brand new UUID — backend will create the session on first use
      let sessionIdToUse: string =
        (liveArtifact?.sessionId || "")
        || localStorage.getItem(`datahub_chat_session_${activeDataset.id}`)
        || "";
      if (!sessionIdToUse) {
        sessionIdToUse = crypto.randomUUID();
        localStorage.setItem(`datahub_chat_session_${activeDataset.id}`, sessionIdToUse);
      }

      // Build the client-supplied pipeline_steps payload that the backend
      // (`_replay_session_views`) uses to re-create views.  Each entry needs
      // step_number, output_table and sql.
      const replayPipelineSteps = steps
        .map((s, idx) => {
          const raw = s.rawConfig as Record<string, unknown> | undefined;
          const outputTable = String(
            s.output_table
            ?? raw?.output_table
            ?? raw?.session_table_name
            ?? "",
          );
          const sql = String(s.sql ?? raw?.sql ?? "");
          if (!outputTable || !sql) return null;
          return {
            step_number: Number(s.stepNumber ?? idx + 1),
            operation: s.operation,
            description: s.description,
            sql,
            output_table: outputTable,
            rows_affected: s.affectedRows ?? null,
          };
        })
        .filter((s): s is NonNullable<typeof s> => s !== null);

      if (!replayPipelineSteps.length) {
        setReplayError("No replayable steps — none of your pipeline steps have a stored SQL + output table.");
        return;
      }

      // The leaf table to preview is the LAST step's output_table.
      const leafTableName = replayPipelineSteps[replayPipelineSteps.length - 1].output_table;

      // step-preview re-creates views via _replay_session_views(client_steps=...)
      // and returns the LIMIT 500 preview rows in one round-trip.
      const previewResult = await fetchStepPreview(
        activeDataset.id,
        sessionIdToUse,
        leafTableName,
        500,
        0,
        replayPipelineSteps,
      );

      setSessionPreview({ rows: previewResult.rows ?? [], columns: previewResult.columns ?? [] });
      setLiveArtifact({
        tableName: leafTableName,
        rowCount: previewResult.count ?? previewResult.rows?.length ?? 0,
        stepLabel: steps[steps.length - 1].description,
        sessionId: sessionIdToUse,
      });
      window.dispatchEvent(new CustomEvent("datahub:toast", { detail: { message: `Pipeline ran \u2014 ${(previewResult.count ?? previewResult.rows?.length ?? 0).toLocaleString()} rows ready`, tone: "success" } }));
      recordMilestone("pipeline_replayed", {
        step_count: replayPipelineSteps.length,
        $add: { total_pipeline_runs: 1 },
        $set: { last_pipeline_run_at: new Date().toISOString() },
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

  // Record workspace_first_visit milestone on first open.
  useEffect(() => {
    const visitedKey = "datahub_workspace_first_visit_recorded";
    if (!localStorage.getItem(visitedKey)) {
      localStorage.setItem(visitedKey, "1");
      recordMilestone("workspace_first_visit");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-import a sample CSV when the user lands here with `?sample=<url>` in
  // the URL. Used by the Welcome flow on WorkspaceHomePage and by the
  // post-demo signup landing so visitors keep their context.
  const sampleAutoImportRef = useRef(false);
  useEffect(() => {
    if (sampleAutoImportRef.current) return;
    const sample = searchParams.get("sample");
    if (!sample) return;
    sampleAutoImportRef.current = true;
    setSampleUrl(sample);
    setImportOpen(true);
    capture("sample_auto_import", { url: sample, source: searchParams.get("from") ?? "workspace_home" });
    // Strip the query params so a refresh doesn't re-trigger the import.
    const next = new URLSearchParams(searchParams);
    next.delete("sample");
    next.delete("from");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  // Clear in-session view state whenever the user switches to a different source dataset.
  // PipelineContext handles loading the correct steps for each dataset independently.
  // Skip clearing when agent.done triggered the switch (skipNextClearRef is set).
  // Switch to cleaned view when user clicks LIVE artifact in sidebar
  useEffect(() => {
    function handleViewLive() { setShowingOriginal(false); }
    window.addEventListener("datahub:view:live", handleViewLive);
    return () => window.removeEventListener("datahub:view:live", handleViewLive);
  }, []);

  // Auto-replay the pipeline when the user clicks the LIVE artifact and the
  // session preview is gone (e.g. after page refresh).  Without this the
  // "View" button just toggles a flag but the canvas still shows raw data
  // because there is nothing to display.
  useEffect(() => {
    function handleRunPipelineEvent() {
      if (sessionPreview) return; // already have live data, nothing to do
      if (replayingPipeline) return;
      if (!steps.length) return;
      void handleRunPipeline();
    }
    window.addEventListener("datahub:run:pipeline", handleRunPipelineEvent);
    return () => window.removeEventListener("datahub:run:pipeline", handleRunPipelineEvent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionPreview, replayingPipeline, steps.length]);

  // Clear selected step when leaving pipeline mode
  useEffect(() => {
    if (workspaceMode !== "pipeline") {
      setSelectedPipelineStep(null);
    }
  }, [workspaceMode]);

  // Listen for step selection from PipelineGraphTab / ExplorerPanel step list
  useEffect(() => {
    function handleStepSelected(e: Event) {
      const detail = (e as CustomEvent<PipelineStep | null>).detail;
      setSelectedPipelineStep(detail);
    }
    window.addEventListener("datahub:pipeline:step-selected", handleStepSelected);
    return () => window.removeEventListener("datahub:pipeline:step-selected", handleStepSelected);
  }, []);

  // ── Sample loader shortcut from panel empty state ──
  useEffect(() => {
    function handleSampleLoad(e: Event) {
      const detail = (e as CustomEvent<{ url: string }>).detail;
      setSampleUrl(detail?.url);
      setImportOpen(true);
    }
    window.addEventListener("datahub:sample:load", handleSampleLoad);
    return () => {
      window.removeEventListener("datahub:sample:load", handleSampleLoad);
    };
  }, []);

  // ── Global keyboard shortcuts ────────────────────────────────────────────
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const meta = e.ctrlKey || e.metaKey;
      if (!meta) return;
      const target = e.target as HTMLElement | null;
      const inEditable = !!target && (
        target.tagName === "INPUT"
        || target.tagName === "TEXTAREA"
        || target.isContentEditable
      );
      // Cmd/Ctrl+R : run pipeline (only when not in an editable field)
      if (!inEditable && e.key.toLowerCase() === "r") {
        if (steps.length && !replayingPipeline) {
          e.preventDefault();
          void handleRunPipeline();
        }
      }
      // Cmd/Ctrl+I : open import
      if (!inEditable && e.key.toLowerCase() === "i") {
        e.preventDefault();
        setImportOpen(true);
      }
      // Cmd/Ctrl+/ : focus search
      if (e.key === "/") {
        e.preventDefault();
        setExplorerSearchFocusNonce((n) => n + 1);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps.length, replayingPipeline]);

  // ── Workspace toast listener ──────────────────────────────────────────────
  useEffect(() => {
    function showToast(e: Event) {
      const detail = (e as CustomEvent<{ message: string; tone?: "success" | "info" | "error"; duration?: number }>).detail;
      if (!detail?.message) return;
      setToast({ message: detail.message, tone: detail.tone ?? "info" });
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => setToast(null), detail.duration ?? 3200);
    }
    window.addEventListener("datahub:toast", showToast);
    return () => {
      window.removeEventListener("datahub:toast", showToast);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    function handleNavDashboard(e: Event) {
      const { dashboardId } = (e as CustomEvent<{ dashboardId: string }>).detail ?? {};
      if (dashboardId) navigate(`/dashboard/${dashboardId}`);
    }
    window.addEventListener("datahub:navigate:dashboard", handleNavDashboard);
    return () => window.removeEventListener("datahub:navigate:dashboard", handleNavDashboard);
  }, [navigate]);

  const prevActiveDatasetRef = useRef<string | null>(activeDataset?.id ?? null);
  useEffect(() => {
    const prev = prevActiveDatasetRef.current;
    prevActiveDatasetRef.current = activeDataset?.id ?? null;
    if (skipNextClearRef.current) {
      skipNextClearRef.current = false;
      setShowingOriginal(false);
      return;
    }
    // On initial mount (prev === null) don't clear — PipelineContext may have
    // already restored liveArtifact from persisted steps.
    if (prev === null) return;
    setSessionPreview(null);
    setLiveArtifact(null);
    setShowingOriginal(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDataset?.id]);

  // NOTE: We no longer auto-fetch the session preview on page load.
  // After refresh, the raw dataset is shown. Users click a pipeline step's
  // preview (👁) button to see that step's snapshot, or "Run Pipeline"
  // to replay and see the latest transformed data.

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
      const nextWidth = Math.max(minWidth, Math.min(maxWidth, event.clientX));
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
      {/* ── Demo-mode banner (anon users only) ──────────────────────────── */}
      {isAnonymous && !demoBannerDismissed && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            padding: "7px 16px",
            background: "linear-gradient(90deg,rgba(99,102,241,0.15),rgba(139,92,246,0.12))",
            borderBottom: "1px solid rgba(99,102,241,0.3)",
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 13, color: "#c7d2fe" }}>
            <span
              style={{
                display: "inline-block",
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#f59e0b",
                marginRight: 6,
                verticalAlign: "middle",
              }}
            />
            Guest mode — your pipeline won't be saved when you leave.
          </span>
          <button
            className="btn btn-primary"
            type="button"
            style={{
              height: 26,
              fontSize: 11,
              padding: "0 12px",
              background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
              border: "none",
            }}
            onClick={() => {
              capture("demo_banner_signup_clicked");
              navigate("/signup");
            }}
          >
            Sign up free →
          </button>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => {
              sessionStorage.setItem("datahub_demo_banner_dismissed", "1");
              setDemoBannerDismissed(true);
              capture("demo_banner_dismissed");
            }}
            style={{
              background: "none",
              border: "none",
              color: "var(--tx2, #888)",
              fontSize: 16,
              cursor: "pointer",
              padding: "0 4px",
              lineHeight: 1,
              marginLeft: 2,
            }}
          >
            ×
          </button>
        </div>
      )}
      {/* ── Dataset Lane HUD ───────────────────────────────────────── */}
      {activeLanes.length > 0 && (
        <div style={{ position: "fixed", bottom: 16, left: "50%", transform: "translateX(-50%)", zIndex: 100, display: "flex", gap: 6, backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", background: "rgba(13,13,17,0.7)", borderRadius: 10, padding: 4, border: "1px solid var(--bd)" }}>
          {activeLanes.map((lane) => {
            const isActive = lane.id === activeDataset?.id;
            return (
              <div key={lane.id} style={{ display: "flex", alignItems: "center", gap: 0, borderRadius: 8, border: `1px solid ${isActive ? "var(--acg)" : "transparent"}`, background: isActive ? "var(--acl)" : "transparent", overflow: "hidden", transition: "all 0.15s ease" }}>
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
      <ExplorerPanel
        refreshNonce={datasetRefreshNonce}
        searchFocusNonce={explorerSearchFocusNonce}
        width={explorerWidth}
        mode={workspaceMode}
        pipelineId={pipelineId}
        selectedStepId={selectedPipelineStep?.id}
        onStepSelect={(step) => {
          setSelectedPipelineStep(step);
        }}
      />
      <div
        role="separator"
        aria-orientation="vertical"
        title="Drag to resize"
        className="resize-handle"
        onMouseDown={() => setResizingExplorer(true)}
        style={{
          background: resizingExplorer ? "var(--acl)" : undefined,
        }}
      />
      <CanvasPanel
        projectId={resolvedProject?.id ?? ""}
        pipelineId={pipelineId}
        mode={workspaceMode}
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
        onSave={liveArtifact ? async () => {
          await api.post("/artifacts/save-checkpoint", {
            session_id: liveArtifact.sessionId,
            table_name: liveArtifact.tableName,
            artifact_name: liveArtifact.stepLabel,
            source_dataset_id: activeDataset?.id,
          });
          setDatasetRefreshNonce((v) => v + 1);
          window.dispatchEvent(new CustomEvent("datahub:toast", { detail: { message: `Saved checkpoint \u201c${liveArtifact.stepLabel}\u201d`, tone: "success" } }));
        } : undefined}
        onRunPipeline={handleRunPipeline}
        replayingPipeline={replayingPipeline}
        replayError={replayError}
        onClearReplayError={() => setReplayError(null)}
        onModeChange={(mode) => {
          setWorkspaceMode(mode as WorkspaceMode);
        }}
        onClearPipeline={() => {
          if (window.confirm("Clear all pipeline steps? This cannot be undone.")) {
            clearSteps();
          }
        }}
        selectedStepId={selectedPipelineStep?.id}
      />
      {/* AI panel drag handle */}
      <div
        role="separator"
        aria-orientation="vertical"
        title="Drag to resize AI panel"
        className="resize-handle"
        onMouseDown={() => setResizingAI(true)}
        style={{
          background: resizingAI ? "var(--acl)" : undefined,
        }}
      />
      <AIPanel
        dataset={activeDataset}
        projectId={resolvedProject?.id ?? "default"}
        width={aiWidth}
        selectedPipelineStep={selectedPipelineStep}
        onStepDeselect={() => setSelectedPipelineStep(null)}
        mode={workspaceMode}
            onStepApplied={() => {
              setDatasetRefreshNonce((value) => value + 1);
              void refetch();
              if (isAnonymous) {
                window.dispatchEvent(new CustomEvent("datahub:toast", {
                  detail: { message: "✅ Transform saved to your pipeline! Sign up to keep it →", tone: "success", duration: 5000 },
                }));
              }
            }}
            onDatasetMutated={() => {
              setDatasetRefreshNonce((value) => value + 1);
            }}
            onSessionPreview={(rows, columns) => {
              skipNextClearRef.current = true;
              setSessionPreview({ rows, columns });
            }}
            onUploadClick={() => setImportOpen(true)}
            onFirstPrompt={() => {
              setHasAskedFirstQuestion(true);
              ctxRecordMilestone("ai_prompt_submitted");
              markAsRealUser();
              if (isAnonymous) {
                window.dispatchEvent(new CustomEvent("datahub:toast", {
                  detail: { message: "🤖 AI is working on your question…", tone: "info", duration: 3500 },
                }));
              }
            }}
            onFirstAiAnswer={(meta) => {
              const now = new Date().toISOString();
              ctxRecordMilestone("aha_first_ai_answer", {
                $set: { is_activated_user: true },
                $set_once: { first_ai_transform_at: now },
              });
            }}
          />
      <ImportModal projectId={resolvedProject?.id} open={importOpen} onClose={() => { setImportOpen(false); setSampleUrl(undefined); }} onImported={(datasetId) => { setDatasetRefreshNonce((value) => value + 1); void refetch(); if (datasetId) { window.dispatchEvent(new CustomEvent("datahub:activate-dataset", { detail: datasetId })); } if (isAnonymous) { try { localStorage.setItem("datahub_anon_starter_provisioned", "1"); } catch { /* ignore */ } } recordMilestone("dataset_uploaded", { $add: { total_datasets_uploaded: 1 }, $set_once: { first_dataset_at: new Date().toISOString() }, $set: { last_dataset_at: new Date().toISOString() } }); }} preloadUrl={sampleUrl} autoImport={isAnonymous && !!sampleUrl} />
      {sheetsExportOpen && activeDataset && (
        <SheetsExportModal
          datasetId={activeDataset.id}
          datasetName={activeDataset.name}
          onClose={() => setSheetsExportOpen(false)}
        />
      )}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 1100,
            padding: "10px 16px",
            borderRadius: 10,
            background: toast.tone === "success"
              ? "linear-gradient(135deg, rgba(34,197,94,0.2), rgba(16,185,129,0.18))"
              : toast.tone === "error"
                ? "linear-gradient(135deg, rgba(248,113,113,0.22), rgba(239,68,68,0.18))"
                : "linear-gradient(135deg, rgba(91,106,240,0.22), rgba(124,58,237,0.18))",
            border: `1px solid ${toast.tone === "success" ? "rgba(34,197,94,0.5)" : toast.tone === "error" ? "rgba(248,113,113,0.5)" : "rgba(91,106,240,0.5)"}`,
            color: toast.tone === "success" ? "#86efac" : toast.tone === "error" ? "#fca5a5" : "#c7d2fe",
            fontSize: 12.5,
            fontWeight: 500,
            boxShadow: "0 12px 34px rgba(0,0,0,0.45)",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            animation: "ws-toast-in 0.26s cubic-bezier(0.16,1,0.3,1)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
          }}
        >
          <style>{`@keyframes ws-toast-in { from { opacity: 0; transform: translate(-50%, 10px) } to { opacity: 1; transform: translate(-50%, 0) } }`}</style>
          <span>{toast.tone === "success" ? "\u2713" : toast.tone === "error" ? "!" : "\u2022"}</span>
          <span>{toast.message}</span>
        </div>
      )}
    </main>
    </>
  );
}
