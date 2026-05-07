import { useState } from "react";
import type { PipelineStep } from "../contexts/PipelineContext";
import { api } from "../api";

interface EditStepPanelProps {
  step: PipelineStep;
  stepIndex: number;
  allSteps: PipelineStep[];
  activeDataset: { id: string; name: string; rows: number } | null | undefined;
  onClose: () => void;
  /**
   * Called after a successful edit (full apply or trim).
   * Receives the new full steps array plus the final dataset info so the
   * caller can update both the pipeline and the active dataset.
   */
  onApplied: (
    updatedSteps: PipelineStep[],
    finalDatasetId: string | null,
    finalRowCount: number | null,
  ) => void;
}

type Phase = "edit" | "applying" | "trimming" | "conflict";

interface ConflictInfo {
  /** 0-based index into the replay payload that failed. 0 = the edited step itself. */
  failedReplayIdx: number;
  /** Human-readable label of the failing step */
  failedLabel: string;
  /** Truncated error message from the backend */
  errorDetail: string;
}

interface ReplayResponse {
  replayed_steps: Array<{
    step_index: number;
    input_dataset_id: string;
    output_dataset_id: string;
    row_count: number | null;
    skipped: boolean;
  }>;
  final_dataset_id: string;
  final_row_count: number | null;
}

/**
 * Patch a slice of the steps array with replay results.
 *
 * replayedSteps[0] always corresponds to baseSteps[editedStepIndex].
 * For downstream steps, replayedSteps[k] corresponds to baseSteps[editedStepIndex + k].
 */
function patchSteps(
  baseSteps: PipelineStep[],
  editedStepIndex: number,
  editedSql: string,
  editedDescription: string,
  replayedSteps: ReplayResponse["replayed_steps"],
): PipelineStep[] {
  return baseSteps.map((s, i) => {
    const replayIdx = i - editedStepIndex;
    const replay = replayedSteps[replayIdx];
    if (replayIdx < 0 || !replay) return s;

    const isEditedStep = i === editedStepIndex;
    return {
      ...s,
      ...(isEditedStep
        ? {
            sql: editedSql,
            description: editedDescription,
            rawConfig: {
              ...(s.rawConfig ?? {}),
              sql: editedSql,
              description: editedDescription,
            },
          }
        : {}),
      inputDataset:
        replay.input_dataset_id && s.inputDataset
          ? { ...s.inputDataset, id: replay.input_dataset_id }
          : s.inputDataset,
      outputDataset:
        !replay.skipped && replay.output_dataset_id !== replay.input_dataset_id
          ? {
              id: replay.output_dataset_id,
              name: s.outputDataset?.name ?? s.description,
              rowCount: replay.row_count ?? 0,
              parentId: replay.input_dataset_id,
            }
          : s.outputDataset,
    };
  });
}

export function EditStepPanel({
  step,
  stepIndex,
  allSteps,
  activeDataset,
  onClose,
  onApplied,
}: EditStepPanelProps) {
  const [sql, setSql] = useState(step.sql ?? "");
  const [description, setDescription] = useState(step.description ?? "");
  const [phase, setPhase] = useState<Phase>("edit");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [conflict, setConflict] = useState<ConflictInfo | null>(null);

  // The pivot is the data state BEFORE the edited step.
  // Mirror the same pivot-resolution logic used in surgical remove.
  const pivotStep = stepIndex > 0 ? allSteps[stepIndex - 1] : null;
  const pivotDatasetId =
    pivotStep?.outputDataset?.id ??
    pivotStep?.inputDataset?.id ??
    step.inputDataset?.id ??
    activeDataset?.id ??
    null;

  const downstreamSteps = allSteps.slice(stepIndex + 1);
  const hasDownstream = downstreamSteps.length > 0;
  const isWorking = phase === "applying" || phase === "trimming";
  const hasChanges = sql !== (step.sql ?? "") || description !== (step.description ?? "");

  /**
   * Build the payload array for POST /cleaning/datasets/{id}/replay.
   * When includeDownstream=false only the edited step is replayed (used by Trim).
   */
  const buildReplayPayload = (includeDownstream: boolean): Record<string, unknown>[] => {
    const editedConfig: Record<string, unknown> = {
      ...(step.rawConfig ?? {}),
      sql,
      description,
      operation: step.operation,
    };
    if (!includeDownstream) return [editedConfig];
    const downstreamConfigs = downstreamSteps.map((s) =>
      s.rawConfig
        ? { ...s.rawConfig }
        : { sql: s.sql ?? "", operation: s.operation, description: s.description },
    );
    return [editedConfig, ...downstreamConfigs];
  };

  const runReplay = async (payload: Record<string, unknown>[]) => {
    const response = await api.post<ReplayResponse>(
      `/cleaning/datasets/${pivotDatasetId}/replay`,
      { steps: payload },
    );
    return response.data;
  };

  /**
   * Parse "Step N failed: <detail>" from a backend 422 error.
   * Returns null if the message doesn't match that pattern.
   */
  const parseConflict = (detail: string): ConflictInfo | null => {
    const match = detail.match(/^Step (\d+) failed: ([\s\S]+)$/);
    if (!match) return null;
    const failedReplayIdx = parseInt(match[1], 10);
    const failedLabel =
      failedReplayIdx === 0
        ? description
        : (downstreamSteps[failedReplayIdx - 1]?.description ??
          `Step ${stepIndex + 1 + failedReplayIdx}`);
    return {
      failedReplayIdx,
      failedLabel,
      errorDetail: match[2].slice(0, 300),
    };
  };

  const extractErrorDetail = (err: unknown): string => {
    const raw =
      (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
      String(err);
    return raw;
  };

  // ── Apply: run edited step + all downstream steps ──────────────────────────
  const handleApply = async () => {
    if (!pivotDatasetId) {
      setErrorMsg(
        "Cannot determine the input dataset for this step. Use 'Undo from this step' and re-describe the change in the chat instead.",
      );
      return;
    }
    setPhase("applying");
    setErrorMsg(null);
    setConflict(null);
    try {
      const data = await runReplay(buildReplayPayload(true));
      const updated = patchSteps(allSteps, stepIndex, sql, description, data.replayed_steps);
      onApplied(updated, data.final_dataset_id, data.final_row_count);
    } catch (err) {
      const detail = extractErrorDetail(err);
      const info = parseConflict(detail);
      if (info && info.failedReplayIdx > 0) {
        // A downstream step failed — offer conflict resolution
        setConflict(info);
        setPhase("conflict");
      } else {
        // The edited SQL itself failed — surface as an inline error
        setErrorMsg(info ? info.errorDetail : detail);
        setPhase("edit");
      }
    }
  };

  // ── Trim: keep only the edited step (drop all that follow) ─────────────────
  const handleTrim = async () => {
    if (!pivotDatasetId) return;
    setPhase("trimming");
    try {
      // Replay only the edited step to get its new output dataset
      const data = await runReplay(buildReplayPayload(false));
      // Keep steps 0..stepIndex only, with the edited step patched
      const trimmedBase = allSteps.slice(0, stepIndex + 1);
      const patched = patchSteps(trimmedBase, stepIndex, sql, description, data.replayed_steps);
      onApplied(patched, data.final_dataset_id, data.final_row_count);
    } catch (err) {
      setErrorMsg(`Trim failed: ${extractErrorDetail(err)}`);
      setPhase("edit");
      setConflict(null);
    }
  };

  return (
    <div
      style={{
        marginTop: 4,
        padding: "10px 12px",
        background: "var(--bg0)",
        border: "1px solid var(--ac)",
        borderRadius: "var(--r6)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.1em",
            color: "var(--ac)",
            textTransform: "uppercase",
          }}
        >
          Edit Step
        </span>
        <button
          onClick={onClose}
          disabled={isWorking}
          style={{
            background: "none",
            border: "none",
            color: "var(--tx2)",
            cursor: "pointer",
            fontSize: 16,
            lineHeight: 1,
            padding: "0 2px",
          }}
          title="Close editor"
        >
          ×
        </button>
      </div>

      {/* Label / description editor */}
      <div>
        <label
          style={{ fontSize: 10, color: "var(--tx2)", display: "block", marginBottom: 3 }}
          htmlFor="edit-step-desc"
        >
          Label
        </label>
        <input
          id="edit-step-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={isWorking}
          style={{
            width: "100%",
            fontSize: 12,
            background: "var(--bg3)",
            border: "1px solid var(--bd)",
            borderRadius: 4,
            color: "var(--tx0)",
            padding: "4px 8px",
            boxSizing: "border-box",
          }}
        />
      </div>

      {/* SQL editor */}
      <div>
        <label
          style={{ fontSize: 10, color: "var(--tx2)", display: "block", marginBottom: 3 }}
          htmlFor="edit-step-sql"
        >
          SQL
        </label>
        <textarea
          id="edit-step-sql"
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          disabled={isWorking}
          rows={7}
          spellCheck={false}
          style={{
            width: "100%",
            resize: "vertical",
            fontSize: 11,
            fontFamily: "var(--mono, 'Courier New', monospace)",
            background: "var(--bg0)",
            border: `1px solid ${errorMsg ? "var(--rd)" : "var(--bd)"}`,
            borderRadius: 4,
            color: "var(--tx0)",
            padding: "6px 8px",
            boxSizing: "border-box",
            lineHeight: 1.5,
          }}
        />
      </div>

      {/* Downstream notice */}
      {hasDownstream && phase !== "conflict" && (
        <span style={{ fontSize: 10, color: "var(--tx2)" }}>
          Applying will re-run {downstreamSteps.length} downstream{" "}
          {downstreamSteps.length === 1 ? "step" : "steps"}.
        </span>
      )}

      {/* SQL / non-conflict error banner */}
      {errorMsg && (
        <div
          style={{
            fontSize: 11,
            color: "var(--rd)",
            background: "rgba(239,68,68,0.08)",
            border: "1px solid var(--rd)",
            borderRadius: 4,
            padding: "6px 8px",
            display: "flex",
            alignItems: "flex-start",
            gap: 6,
          }}
        >
          <span style={{ flex: 1, wordBreak: "break-word" }}>{errorMsg}</span>
          <button
            onClick={() => setErrorMsg(null)}
            style={{
              background: "none",
              border: "none",
              color: "var(--tx2)",
              cursor: "pointer",
              fontSize: 14,
              lineHeight: 1,
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* ── Conflict resolution panel ── */}
      {phase === "conflict" && conflict && conflict.failedReplayIdx > 0 && (
        <div
          style={{
            fontSize: 11,
            color: "var(--tx0)",
            background: "rgba(245,158,11,0.08)",
            border: "1px solid #f59e0b",
            borderRadius: 4,
            padding: "8px 10px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div>
            <span style={{ fontWeight: 600 }}>Downstream conflict — </span>
            step &quot;{conflict.failedLabel}&quot; failed after your edit.
          </div>
          <div
            style={{
              fontSize: 10,
              color: "var(--tx2)",
              fontFamily: "var(--mono, monospace)",
              wordBreak: "break-word",
              background: "var(--bg0)",
              borderRadius: 3,
              padding: "4px 6px",
            }}
          >
            {conflict.errorDetail}
          </div>
          <div style={{ fontSize: 10, color: "var(--tx2)" }}>
            <strong>Revert</strong> — close without any changes.
            &nbsp;|&nbsp;
            <strong>Trim</strong> — keep your edit and remove all steps from &quot;
            {conflict.failedLabel}&quot; onward.
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              className="btn"
              style={{ fontSize: 11, padding: "3px 10px" }}
              onClick={onClose}
            >
              Revert
            </button>
            <button
              className="btn"
              style={{
                fontSize: 11,
                padding: "3px 10px",
                background: "rgba(245,158,11,0.15)",
                border: "1px solid #f59e0b",
                color: "#f59e0b",
              }}
              onClick={() => void handleTrim()}
              disabled={phase === "trimming"}
            >
              {phase === "trimming" ? "Trimming…" : `Trim from "${conflict.failedLabel}"`}
            </button>
          </div>
        </div>
      )}

      {/* ── Primary action buttons (hidden while in conflict resolution) ── */}
      {phase !== "conflict" && (
        <div style={{ display: "flex", gap: 6 }}>
          <button
            className="btn"
            style={{
              fontSize: 11,
              padding: "4px 14px",
              ...(hasChanges && !isWorking
                ? {
                    background: "var(--ac)",
                    color: "#fff",
                    border: "1px solid var(--ac)",
                  }
                : {}),
            }}
            onClick={() => void handleApply()}
            disabled={isWorking || !sql.trim()}
          >
            {phase === "applying" ? "Applying…" : "Apply"}
          </button>
          <button
            className="btn"
            style={{ fontSize: 11, padding: "4px 14px" }}
            onClick={onClose}
            disabled={isWorking}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
