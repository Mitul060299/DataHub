import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  api,
  fetchDatasetPipelineSteps,
  saveDatasetPipelineSteps,
  saveDatasetSession,
} from "../api";
import { useWorkspaceContext } from "./WorkspaceContext";

export interface ScheduleInfo {
  label: string;
  cron: string;
  autoRefreshOnUpload?: boolean;
}

export interface PipelineStep {
  id: string;
  stepNumber: number;
  operation: string;
  description: string;
  sql?: string;
  affectedRows?: string;
  appliedAt: Date;
  inputDataset?: {
    id: string;
    name: string;
    rows: number;
  };
  outputDataset?: {
    id: string;
    name: string;
    rowCount: number;
    parentId?: string | null;
  };
  // Extended fields populated by execute_step / pipeline_recorder
  input_tables?: string[];
  output_table?: string;
  row_count_before?: number | null;
  row_count_after?: number | null;
  execution_time_ms?: number | null;
  status?: "completed" | "failed" | "pending";
  error_message?: string | null;
  /** Storage path of the step's Parquet snapshot (e.g. s3://…/step_X.parquet) */
  snapshot_path?: string | null;
  /** Full raw config dict from the agent, used for surgical step replay */
  rawConfig?: Record<string, unknown>;
}

interface PipelineContextValue {
  steps: PipelineStep[];
  addStep: (step: PipelineStep) => void;
  removeStep: (stepId: string) => void;
  renameStep: (stepId: string, newLabel: string) => void;
  keepStepsThrough: (stepId: string) => void;
  clearSteps: () => void;
  replaceSteps: (newSteps: PipelineStep[]) => void;
  updateStep: (stepId: string, updates: Partial<PipelineStep>) => void;
  moveStep: (stepId: string, direction: "up" | "down") => void;
  runPipeline: () => Promise<void>;
  scheduleInfo: ScheduleInfo | null;
  setScheduleInfo: (info: ScheduleInfo | null) => void;
  /** The in-session DuckDB table representing the current pipeline leaf output */
  liveArtifact: { tableName: string; rowCount: number; stepLabel: string; sessionId: string; rowsChanged?: number | null } | null;
  setLiveArtifact: (artifact: { tableName: string; rowCount: number; stepLabel: string; sessionId: string; rowsChanged?: number | null } | null) => void;
  /** Pending join step awaiting user confirmation (null = no pending) */
  pendingJoinStep: PipelineStep | null;
  confirmJoin: () => void;
  cancelJoin: () => void;
}

const PipelineContext = createContext<PipelineContextValue | undefined>(undefined);

// Per-dataset key so different datasets never overwrite each other's steps.
// Falls back to the legacy global key on first load (one-time migration).
const PIPELINE_STEPS_LEGACY_KEY = "datahub_pipeline_steps_v1";
const stepsKey = (datasetId: string) => `datahub_steps_v2_${datasetId}`;
const liveArtifactKey = (datasetId: string) => `datahub_live_artifact_${datasetId}`;

type LiveArtifactState = { tableName: string; rowCount: number; stepLabel: string; sessionId: string; rowsChanged?: number | null } | null;

const loadPersistedLiveArtifact = (datasetId?: string | null): LiveArtifactState => {
  if (!datasetId) return null;
  try {
    const raw = localStorage.getItem(liveArtifactKey(datasetId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.tableName !== "string" || typeof parsed.sessionId !== "string") return null;
    // Defensive: drop legacy "replayed" sentinel that older builds wrote into
    // localStorage.  With the v3 fix handleRunPipeline always stores a real
    // session id, so any persisted entry containing "replayed" is stale.
    if (parsed.sessionId === "replayed") {
      try { localStorage.removeItem(liveArtifactKey(datasetId)); } catch { /* ignore */ }
      return null;
    }
    return {
      tableName: parsed.tableName,
      rowCount: Number(parsed.rowCount) || 0,
      stepLabel: typeof parsed.stepLabel === "string" ? parsed.stepLabel : "",
      sessionId: parsed.sessionId,
      rowsChanged: typeof parsed.rowsChanged === "number" ? parsed.rowsChanged : null,
    };
  } catch {
    return null;
  }
};

const loadPersistedSteps = (datasetId?: string | null): PipelineStep[] => {
  try {
    // If we know the dataset, try the per-dataset key first, then fall back to legacy.
    const key = datasetId ? stepsKey(datasetId) : null;
    const raw = (key ? localStorage.getItem(key) : null)
      ?? localStorage.getItem(PIPELINE_STEPS_LEGACY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<Omit<PipelineStep, "appliedAt"> & { appliedAt: string }>;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((step) => ({
      ...step,
      appliedAt: new Date(step.appliedAt),
    }));
  } catch {
    return [];
  }
};

export function PipelineProvider({ children }: { children: ReactNode }) {
  const { activeDataset } = useWorkspaceContext();
  const datasetId = activeDataset?.id ?? null;
  // On initial mount, peek at the stored activeDatasetId so we load the right
  // per-dataset key before the React context has settled its first value.
  const initialDatasetId = (() => {
    if (activeDataset?.id) return activeDataset.id;
    return localStorage.getItem("activeDatasetId") ?? null;
  })();
  const initialLocalSteps = loadPersistedSteps(initialDatasetId);
  const [steps, setSteps] = useState<PipelineStep[]>(() => initialLocalSteps);
  const [scheduleInfo, setScheduleInfo] = useState<ScheduleInfo | null>(null);
  const [liveArtifact, setLiveArtifactRaw] = useState<LiveArtifactState>(() => loadPersistedLiveArtifact(initialDatasetId));
  // Stable wrapper that mirrors writes into localStorage so liveArtifact
  // survives a page refresh even if the chat-session localStorage key is missing.
  const setLiveArtifact = (artifact: LiveArtifactState) => {
    setLiveArtifactRaw(artifact);
    if (!datasetId) return;
    try {
      if (artifact) {
        localStorage.setItem(liveArtifactKey(datasetId), JSON.stringify(artifact));
      } else {
        localStorage.removeItem(liveArtifactKey(datasetId));
      }
    } catch { /* quota */ }
    // Mirror to server so other tabs / a refresh / another device sees it (arch #2).
    scheduleServerSessionSync(datasetId, artifact);
  };
  const [pendingJoinStep, setPendingJoinStep] = useState<PipelineStep | null>(null);
  const dbSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Persist only the chat session binding to the server.  Live preview
  // state (table name, row count, label) is no longer stored server-side
  // because the server cannot reliably tell when an in-memory DuckDB table
  // still exists.  We derive the live artifact from the latest pipeline
  // step's output_table on the next refresh instead.
  const scheduleServerSessionSync = (
    dsId: string,
    artifact: LiveArtifactState,
  ) => {
    if (sessionSyncTimerRef.current) clearTimeout(sessionSyncTimerRef.current);
    sessionSyncTimerRef.current = setTimeout(() => {
      void saveDatasetSession(dsId, {
        chat_session_id: artifact?.sessionId ?? null,
      }).catch(() => { /* best-effort; localStorage still has it */ });
    }, 800);
  };

  // Restore liveArtifact from localStorage (synchronous, race-immune) or
  // from the latest pipeline step that has output_table.  We no longer
  // consult the server for the live table name -- the server only stores
  // the chat session binding now.
  const restoreLiveArtifact = (loadedSteps: PipelineStep[], dsId: string) => {

    // 1. Prefer the directly-persisted liveArtifact (race-immune across refreshes)
    const persisted = loadPersistedLiveArtifact(dsId);
    if (persisted) {
      setLiveArtifactRaw(persisted);
      return;
    }
    // 2. Fall back to reconstructing from the latest pipeline step that has output_table
    const getOutputTable = (s: PipelineStep): string | undefined =>
      s.output_table
      || (typeof s.rawConfig?.output_table === "string" ? s.rawConfig.output_table : undefined)
      || (typeof s.rawConfig?.session_table_name === "string" ? s.rawConfig.session_table_name : undefined);
    const lastWithOutput = [...loadedSteps].reverse().find((s) => getOutputTable(s));
    if (!lastWithOutput) return;
    const tableName = getOutputTable(lastWithOutput)!;
    // sessionId may live in localStorage (from chat) OR in the step's rawConfig
    const sid = localStorage.getItem(`datahub_chat_session_${dsId}`)
      || (typeof lastWithOutput.rawConfig?.session_id === "string" ? (lastWithOutput.rawConfig.session_id as string) : null);
    if (!sid) return;
    const reconstructed: LiveArtifactState = {
      tableName,
      rowCount: lastWithOutput.row_count_after ?? (Number(lastWithOutput.affectedRows) || 0),
      stepLabel: lastWithOutput.description || lastWithOutput.operation,
      sessionId: sid,
    };
    setLiveArtifactRaw(reconstructed);
    try { localStorage.setItem(liveArtifactKey(dsId), JSON.stringify(reconstructed)); } catch { /* quota */ }
  };
  // Tracks which dataset ID was already hydrated by useState on mount.
  // Only skip DB fetch when localStorage actually had steps; otherwise
  // fall through to DB so steps saved by prior sessions are recovered.
  const hydratedForRef = useRef<string | null>(initialLocalSteps.length > 0 ? initialDatasetId : null);
  // Counter that increments on every structural change (add/remove/clear).
  // The write-through effect uses this to decide between immediate vs debounced save.
  const structuralChangeRef = useRef(0);
  // Tracks which dataset the current `steps` state actually belongs to.
  // CRITICAL: Without this, switching datasets while a previous fetch is in
  // flight causes the write-through effect to persist OLD-dataset steps
  // under the NEW datasetId, permanently corrupting `pipeline_steps_json`
  // in the DB. We refuse any persistence when datasetId !== stepsOwnerRef.
  const stepsOwnerRef = useRef<string | null>(initialDatasetId);

  // Immediately persist to localStorage + DB. Used for structural changes
  // (step add/remove) where a 1.5s debounce would risk data loss.
  const flushStepsToDb = (dsId: string, stepsToSave: PipelineStep[]) => {
    // Cancel any pending debounced write — we're saving now.
    if (dbSyncTimerRef.current) { clearTimeout(dbSyncTimerRef.current); dbSyncTimerRef.current = null; }
    try { localStorage.setItem(stepsKey(dsId), JSON.stringify(stepsToSave)); } catch { /* quota */ }
    void saveDatasetPipelineSteps(dsId, stepsToSave).catch(() => { /* best-effort */ });
  };

  // ── Write-through: per-dataset localStorage (always) + DB (debounced 1.5s for cosmetic changes) ───
  useEffect(() => {
    if (!datasetId) return;
    // Guard: if `steps` belongs to a different dataset (we're mid-switch and
    // the corrective fetch hasn't yet called setSteps for the new dataset),
    // do NOT persist. Persisting here would write OLD steps under NEW datasetId
    // and corrupt the DB row irrecoverably (especially on slow Render cold
    // starts where the fetch can take 30-60s, longer than the 1.5s debounce).
    if (stepsOwnerRef.current !== datasetId) return;
    try {
      localStorage.setItem(stepsKey(datasetId), JSON.stringify(steps));
    } catch {
      // ignore quota errors
    }
    // Structural changes (add/remove/clear) flush immediately via flushStepsToDb.
    // This effect only runs the debounced path for cosmetic edits (rename, etc.).
    if (structuralChangeRef.current > 0) {
      structuralChangeRef.current = 0;
      // Always flush to DB — commitStep's immediate flush may have been
      // skipped when React 18 deferred the setSteps updater in batch mode.
      void saveDatasetPipelineSteps(datasetId, steps).catch(() => { /* best-effort */ });
      return;
    }
    // Debounce DB writes for cosmetic changes (renames, etc.)
    if (dbSyncTimerRef.current) clearTimeout(dbSyncTimerRef.current);
    const ownerAtSchedule = datasetId;
    dbSyncTimerRef.current = setTimeout(() => {
      // Final guard at fire-time: the dataset may have switched again in the
      // 1.5s window. Only write if the currently-owned dataset still matches.
      if (stepsOwnerRef.current !== ownerAtSchedule) return;
      void saveDatasetPipelineSteps(ownerAtSchedule, steps).catch(() => { /* best-effort */ });
    }, 1500);
    return () => {
      if (dbSyncTimerRef.current) clearTimeout(dbSyncTimerRef.current);
    };
  }, [steps, datasetId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── On dataset switch: flush pending save, then load steps from DB ─
  // Initialised to `undefined` (not null) so the first-run check below can
  // distinguish "never run" from "last run was for null dataset". This is
  // what lets the mount-time effect actually clear stale-hydrated state when
  // the user lands on a project that has no datasets — without this, both
  // values are null on first run and the effect early-returns, leaving the
  // localStorage-hydrated steps + liveArtifact from a previous (deleted)
  // project visible on the canvas.
  const prevDatasetIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (prevDatasetIdRef.current !== undefined && datasetId === prevDatasetIdRef.current) return;
    const prevId = prevDatasetIdRef.current ?? null;
    prevDatasetIdRef.current = datasetId;

    // Flush any pending debounced save for the PREVIOUS dataset before switching.
    if (prevId && dbSyncTimerRef.current) {
      clearTimeout(dbSyncTimerRef.current);
      dbSyncTimerRef.current = null;
      // Read current localStorage (most recent) and save it to DB immediately.
      const prevSteps = loadPersistedSteps(prevId);
      if (prevSteps.length > 0) {
        void saveDatasetPipelineSteps(prevId, prevSteps).catch(() => { /* best-effort */ });
      }
    }

    if (!datasetId) {
      // No dataset selected — reset BOTH steps and liveArtifact. The
      // liveArtifact reset is critical when this branch fires on first mount
      // after a project-delete-and-recreate: useState() hydrated
      // liveArtifact from the stale `datahub_live_artifact_<oldId>` key, and
      // without this clear it would render as a ghost "clean · LIVE" entry
      // in the new (empty) project's ARTIFACTS sidebar.
      stepsOwnerRef.current = null;
      setSteps([]);
      setLiveArtifactRaw(null);
      return;
    }
    // If this is the same dataset that useState already hydrated from localStorage,
    // skip the DB fetch entirely — the correct steps are already in state.
    if (datasetId === hydratedForRef.current) {
      hydratedForRef.current = null; // allow normal DB reload on subsequent switches
      stepsOwnerRef.current = datasetId;
      // Guard: the !datasetId branch above fires first on mount while datasets
      // are still loading from the API, which calls setSteps([]) before we
      // reach here.  If that cleared the steps React state, re-read from
      // localStorage to restore the steps that useState() originally hydrated.
      const stepsToUse = steps.length > 0 ? steps : loadPersistedSteps(datasetId);
      if (steps.length === 0 && stepsToUse.length > 0) {
        setSteps(stepsToUse);
      }
      restoreLiveArtifact(stepsToUse, datasetId);
      return;
    }
    fetchDatasetPipelineSteps(datasetId)
      .then((loaded) => {
        // The dataset may have switched again while the fetch was in flight
        // (very common on Render cold starts). Discard the stale response so
        // it can't overwrite the in-flight switch's steps.
        if (datasetId !== prevDatasetIdRef.current) return;
        const parsed = (loaded as Array<Omit<PipelineStep, "appliedAt"> & { appliedAt: string }>)
          .map((s) => ({ ...s, appliedAt: new Date(s.appliedAt) }));
        const resolved = parsed.length > 0 ? parsed : loadPersistedSteps(datasetId);
        stepsOwnerRef.current = datasetId;
        setSteps(resolved);
        restoreLiveArtifact(resolved, datasetId);
      })
      .catch(() => {
        if (datasetId !== prevDatasetIdRef.current) return;
        const fallback = loadPersistedSteps(datasetId);
        stepsOwnerRef.current = datasetId;
        setSteps(fallback);
        restoreLiveArtifact(fallback, datasetId);
      });
  }, [datasetId]); // eslint-disable-line react-hooks/exhaustive-deps

  const addStep = (step: PipelineStep) => {
    // Intercept join operations with multiple inputs for confirmation
    if (step.operation === "join" && (step.input_tables?.length ?? 0) > 1 && !pendingJoinStep) {
      setPendingJoinStep(step);
      return;
    }
    commitStep(step);
  };

  const commitStep = (step: PipelineStep) => {
    let resolved: PipelineStep[] = [];
    setSteps((current) => {
      // Dedup strategy (ordered by specificity):
      // 1. By outputDataset.id (when backend creates derived datasets)
      if (step.outputDataset?.id) {
        const existingIdx = current.findIndex((s) => s.outputDataset?.id === step.outputDataset?.id);
        if (existingIdx >= 0) {
          const next = [...current];
          next[existingIdx] = step;
          resolved = next;
          return next;
        }
      }
      // 2. By run_id + stepNumber (stable backend identity for session transforms)
      const stepRunId = step.rawConfig?.run_id ?? step.rawConfig?.agent_run_id;
      if (stepRunId && step.stepNumber) {
        const existingIdx = current.findIndex((s) => {
          const sRunId = s.rawConfig?.run_id ?? s.rawConfig?.agent_run_id;
          return sRunId === stepRunId && s.stepNumber === step.stepNumber;
        });
        if (existingIdx >= 0) {
          const next = [...current];
          next[existingIdx] = step;
          resolved = next;
          return next;
        }
      }
      // 3. Defensive: if stepNumber already exists (different run), renumber to avoid
      //    visual collision — continue from the highest existing stepNumber.
      let incoming = step;
      if (incoming.stepNumber && current.some((s) => s.stepNumber === incoming.stepNumber)) {
        const maxNum = Math.max(0, ...current.map((s) => s.stepNumber));
        incoming = { ...incoming, stepNumber: maxNum + 1 };
      }
      resolved = [...current, incoming];
      return resolved;
    });
    // Structural change — flush to DB immediately using the resolved array
    // (don't read from localStorage which may not have been updated yet).
    structuralChangeRef.current += 1;
    if (datasetId && resolved.length > 0) {
      flushStepsToDb(datasetId, resolved);
    }
  };

  const confirmJoin = () => {
    if (pendingJoinStep) { commitStep(pendingJoinStep); setPendingJoinStep(null); }
  };

  const cancelJoin = () => { setPendingJoinStep(null); };

  const removeStep = (stepId: string) => {
    let resolved: PipelineStep[] = [];
    setSteps((current) => {
      resolved = current.filter((step) => step.id !== stepId);
      return resolved;
    });
    structuralChangeRef.current += 1;
    if (datasetId) flushStepsToDb(datasetId, resolved);
  };

  const renameStep = (stepId: string, newLabel: string) => {
    const trimmed = newLabel.trim();
    if (!trimmed) return;
    setSteps((current) =>
      current.map((step) =>
        step.id === stepId ? { ...step, description: trimmed } : step
      )
    );
  };

  const keepStepsThrough = (stepId: string) => {
    let resolved: PipelineStep[] = [];
    setSteps((current) => {
      const index = current.findIndex((step) => step.id === stepId);
      if (index < 0) { resolved = current; return current; }
      resolved = current.slice(0, index + 1);
      return resolved;
    });
    structuralChangeRef.current += 1;
    if (datasetId) flushStepsToDb(datasetId, resolved);
  };

  const clearSteps = () => {
    // Also clear the per-dataset localStorage key so old steps don't resurrect on switch
    if (datasetId) {
      try { localStorage.removeItem(stepsKey(datasetId)); } catch { /* ignore */ }
      try { localStorage.removeItem(liveArtifactKey(datasetId)); } catch { /* ignore */ }
    }
    setSteps([]);
    setLiveArtifactRaw(null);
    structuralChangeRef.current += 1;
    if (datasetId) flushStepsToDb(datasetId, []);
  };

  const replaceSteps = (newSteps: PipelineStep[]) => {
    setSteps(newSteps);
    structuralChangeRef.current += 1;
    if (datasetId) flushStepsToDb(datasetId, newSteps);
  };

  const updateStep = (stepId: string, updates: Partial<PipelineStep>) => {
    setSteps((current) =>
      current.map((step) => (step.id === stepId ? { ...step, ...updates } : step))
    );
  };

  const moveStep = (stepId: string, direction: "up" | "down") => {
    let resolved: PipelineStep[] = [];
    setSteps((current) => {
      const idx = current.findIndex((s) => s.id === stepId);
      if (idx < 0) { resolved = current; return current; }
      const targetIdx = direction === "up" ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= current.length) { resolved = current; return current; }
      const next = [...current];
      [next[idx], next[targetIdx]] = [next[targetIdx], next[idx]];
      // Re-number stepNumber to keep them sequential
      resolved = next.map((s, i) => ({ ...s, stepNumber: i + 1 }));
      return resolved;
    });
    structuralChangeRef.current += 1;
    if (datasetId && resolved.length > 0) flushStepsToDb(datasetId, resolved);
  };

  const runPipeline = async () => {
    if (!steps.length) return;
    try {
      await api.post("/pipelines/default/run");
    } catch {
      await Promise.resolve();
    }
  };

  const value = useMemo(
    () => ({ steps, addStep, removeStep, renameStep, keepStepsThrough, clearSteps, replaceSteps, updateStep, moveStep, runPipeline, scheduleInfo, setScheduleInfo, liveArtifact, setLiveArtifact, pendingJoinStep, confirmJoin, cancelJoin }),
    [steps, scheduleInfo, liveArtifact, pendingJoinStep],  // eslint-disable-line react-hooks/exhaustive-deps
  );

  return (
    <PipelineContext.Provider value={value}>
      {children}
      {/* Join confirmation modal */}
      {pendingJoinStep && (
        <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={cancelJoin}>
          <div style={{ background: "var(--bg2)", border: "1px solid var(--bd)", borderRadius: 10, padding: "24px 28px", minWidth: 360, maxWidth: 440, boxShadow: "0 16px 48px rgba(0,0,0,0.6)" }}
            onClick={(e) => e.stopPropagation()}>
            <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 700, color: "var(--tx0)" }}>Confirm multi-dataset join</p>
            <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--tx2)" }}>
              {pendingJoinStep.description || pendingJoinStep.operation}
            </p>
            <div style={{ background: "var(--bg3)", borderRadius: 6, padding: "10px 12px", marginBottom: 16, fontSize: 11, color: "var(--tx1)" }}>
              <div style={{ marginBottom: 6 }}>
                <span style={{ color: "var(--tx2)" }}>Joining tables:&nbsp;</span>
                {(pendingJoinStep.input_tables ?? []).join(" + ")}
              </div>
              {pendingJoinStep.rawConfig?.join_key != null && (
                <div style={{ marginBottom: 6 }}>
                  <span style={{ color: "var(--tx2)" }}>Key:&nbsp;</span>
                  <span className="mono">{String(pendingJoinStep.rawConfig.join_key)}</span>
                </div>
              )}
              {pendingJoinStep.row_count_after != null && (
                <div>
                  <span style={{ color: "var(--tx2)" }}>Result rows:&nbsp;</span>
                  {pendingJoinStep.row_count_after.toLocaleString()}
                </div>
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button className="btn" onClick={cancelJoin}>Cancel</button>
              <button className="btn" style={{ background: "var(--acl)", borderColor: "var(--acg)", color: "var(--ac)" }}
                onClick={confirmJoin}>
                Confirm Join
              </button>
            </div>
          </div>
        </div>
      )}
    </PipelineContext.Provider>
  );
}

export function usePipelineContext() {
  const context = useContext(PipelineContext);
  if (!context) {
    throw new Error("usePipelineContext must be used inside PipelineProvider");
  }
  return context;
}
