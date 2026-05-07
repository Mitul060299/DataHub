import { useRef, useState } from "react";
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
   * Receives the new full steps array plus the final dataset info.
   */
  onApplied: (
    updatedSteps: PipelineStep[],
    finalDatasetId: string | null,
    finalRowCount: number | null,
  ) => void;
}

// ── phase machine ───────────────────────────────────────────────────────────
// idle      → user typing their instruction
// rewriting → LLM is generating the new SQL (hidden from user)
// preview   → LLM returned a new description; user can Apply or Discard
// applying  → replay in progress
// trimming  → trim replay in progress
// conflict  → downstream step broke; offer Revert / Trim
type Phase = "idle" | "rewriting" | "preview" | "applying" | "trimming" | "conflict";

interface RewriteResult {
  new_sql: string;
  new_description: string;
}

interface ConflictInfo {
  failedReplayIdx: number;
  failedLabel: string;
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

// ── helpers ─────────────────────────────────────────────────────────────────

function patchSteps(
  baseSteps: PipelineStep[],
  editedStepIndex: number,
  newSql: string,
  newDescription: string,
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
            sql: newSql,
            description: newDescription,
            rawConfig: { ...(s.rawConfig ?? {}), sql: newSql, description: newDescription },
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

function extractErrorDetail(err: unknown): string {
  return (
    (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
    String(err)
  );
}

function parseConflict(detail: string, description: string, downstreamSteps: PipelineStep[], stepIndex: number): ConflictInfo | null {
  const match = detail.match(/^Step (\d+) failed: ([\s\S]+)$/);
  if (!match) return null;
  const failedReplayIdx = parseInt(match[1], 10);
  const failedLabel =
    failedReplayIdx === 0
      ? description
      : (downstreamSteps[failedReplayIdx - 1]?.description ?? `Step ${stepIndex + 1 + failedReplayIdx}`);
  return { failedReplayIdx, failedLabel, errorDetail: match[2].slice(0, 300) };
}

// ── component ────────────────────────────────────────────────────────────────

export function EditStepPanel({
  step,
  stepIndex,
  allSteps,
  activeDataset,
  onClose,
  onApplied,
}: EditStepPanelProps) {
  const [message, setMessage] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [preview, setPreview] = useState<RewriteResult | null>(null);
  const [conflict, setConflict] = useState<ConflictInfo | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // The pivot is the data state BEFORE the edited step.
  const pivotStep = stepIndex > 0 ? allSteps[stepIndex - 1] : null;
  const pivotDatasetId =
    pivotStep?.outputDataset?.id ??
    pivotStep?.inputDataset?.id ??
    step.inputDataset?.id ??
    activeDataset?.id ??
    null;

  const downstreamSteps = allSteps.slice(stepIndex + 1);
  const hasDownstream = downstreamSteps.length > 0;
  const isWorking = phase === "rewriting" || phase === "applying" || phase === "trimming";

  // Column names available at this step's input (best-effort from step metadata)
  const columnsAtStep: string[] = step.input_tables?.length
    ? [] // actual columns not available without querying; send empty, backend will infer from SQL
    : [];

  // ── Step 1: ask LLM to rewrite the SQL ─────────────────────────────────────
  const handleRewrite = async () => {
    if (!message.trim() || !pivotDatasetId) return;
    setPhase("rewriting");
    setErrorMsg(null);
    setPreview(null);
    try {
      const response = await api.post<RewriteResult>(
        `/cleaning/datasets/${pivotDatasetId}/rewrite-step`,
        {
          current_sql: step.sql ?? "",
          current_description: step.description,
          user_message: message.trim(),
          columns: columnsAtStep,
        },
      );
      setPreview(response.data);
      setPhase("preview");
    } catch (err) {
      setErrorMsg(extractErrorDetail(err));
      setPhase("idle");
    }
  };

  // ── Step 2a: apply preview (replay edited step + all downstream) ─────────────
  const handleApply = async () => {
    if (!preview || !pivotDatasetId) return;
    setPhase("applying");
    setErrorMsg(null);
    try {
      const editedConfig: Record<string, unknown> = {
        ...(step.rawConfig ?? {}),
        sql: preview.new_sql,
        description: preview.new_description,
        operation: step.operation,
      };
      const downstreamConfigs = downstreamSteps.map((s) =>
        s.rawConfig ? { ...s.rawConfig } : { sql: s.sql ?? "", operation: s.operation, description: s.description },
      );
      const replayPayload = [editedConfig, ...downstreamConfigs];

      const response = await api.post<ReplayResponse>(
        `/cleaning/datasets/${pivotDatasetId}/replay`,
        { steps: replayPayload },
      );
      const updated = patchSteps(allSteps, stepIndex, preview.new_sql, preview.new_description, response.data.replayed_steps);
      onApplied(updated, response.data.final_dataset_id, response.data.final_row_count);
    } catch (err) {
      const detail = extractErrorDetail(err);
      const info = parseConflict(detail, preview.new_description, downstreamSteps, stepIndex);
      if (info && info.failedReplayIdx > 0) {
        setConflict(info);
        setPhase("conflict");
      } else {
        setErrorMsg(info ? info.errorDetail : detail);
        setPhase("preview");
      }
    }
  };

  // ── Step 2b: discard preview → back to editing ────────────────────────────
  const handleDiscard = () => {
    setPreview(null);
    setPhase("idle");
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  // ── Trim: keep edited step, drop broken downstream ────────────────────────
  const handleTrim = async () => {
    if (!preview || !pivotDatasetId) return;
    setPhase("trimming");
    try {
      const editedConfig: Record<string, unknown> = {
        ...(step.rawConfig ?? {}),
        sql: preview.new_sql,
        description: preview.new_description,
        operation: step.operation,
      };
      const response = await api.post<ReplayResponse>(
        `/cleaning/datasets/${pivotDatasetId}/replay`,
        { steps: [editedConfig] },
      );
      const trimmedBase = allSteps.slice(0, stepIndex + 1);
      const patched = patchSteps(trimmedBase, stepIndex, preview.new_sql, preview.new_description, response.data.replayed_steps);
      onApplied(patched, response.data.final_dataset_id, response.data.final_row_count);
    } catch (err) {
      setErrorMsg(`Trim failed: ${extractErrorDetail(err)}`);
      setPhase("conflict");
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
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: "var(--ac)", textTransform: "uppercase" }}>
          Edit Step
        </span>
        <button
          onClick={onClose}
          disabled={isWorking}
          style={{ background: "none", border: "none", color: "var(--tx2)", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: "0 2px" }}
          title="Close"
        >
          ×
        </button>
      </div>

      {/* ── Current step chip ──────────────────────────────────────────────── */}
      <div style={{ fontSize: 11, color: "var(--tx2)" }}>
        Editing: <span style={{ color: "var(--tx0)", fontWeight: 500 }}>{step.description}</span>
      </div>

      {/* ── Phase: idle / rewriting — show NL input ───────────────────────── */}
      {(phase === "idle" || phase === "rewriting") && (
        <>
          <div>
            <label style={{ fontSize: 10, color: "var(--tx2)", display: "block", marginBottom: 3 }}>
              Describe what to change
            </label>
            <textarea
              ref={inputRef}
              autoFocus
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleRewrite();
                }
              }}
              disabled={phase === "rewriting"}
              placeholder={`e.g. "change the filter to age > 40" or "also group by region"`}
              rows={3}
              style={{
                width: "100%",
                resize: "vertical",
                fontSize: 12,
                background: "var(--bg3)",
                border: `1px solid ${errorMsg ? "var(--rd)" : "var(--bd)"}`,
                borderRadius: 4,
                color: "var(--tx0)",
                padding: "6px 8px",
                boxSizing: "border-box",
                lineHeight: 1.5,
              }}
            />
          </div>
          {hasDownstream && (
            <span style={{ fontSize: 10, color: "var(--tx2)" }}>
              After rewriting, {downstreamSteps.length} downstream {downstreamSteps.length === 1 ? "step" : "steps"} will be re-run automatically.
            </span>
          )}
          {errorMsg && (
            <div style={{ fontSize: 11, color: "var(--rd)", background: "rgba(239,68,68,0.08)", border: "1px solid var(--rd)", borderRadius: 4, padding: "6px 8px", display: "flex", gap: 6 }}>
              <span style={{ flex: 1, wordBreak: "break-word" }}>{errorMsg}</span>
              <button onClick={() => setErrorMsg(null)} style={{ background: "none", border: "none", color: "var(--tx2)", cursor: "pointer", fontSize: 14, lineHeight: 1 }}>×</button>
            </div>
          )}
          <div style={{ display: "flex", gap: 6 }}>
            <button
              className="btn"
              style={{
                fontSize: 11,
                padding: "4px 14px",
                ...(message.trim() && phase !== "rewriting"
                  ? { background: "var(--ac)", color: "#fff", border: "1px solid var(--ac)" }
                  : {}),
              }}
              onClick={() => void handleRewrite()}
              disabled={!message.trim() || phase === "rewriting"}
            >
              {phase === "rewriting" ? "Rewriting…" : "Rewrite with AI ✦"}
            </button>
            <button className="btn" style={{ fontSize: 11, padding: "4px 14px" }} onClick={onClose} disabled={phase === "rewriting"}>
              Cancel
            </button>
          </div>
        </>
      )}

      {/* ── Phase: preview — show new description, let user approve ─────────── */}
      {phase === "preview" && preview && (
        <>
          <div
            style={{
              fontSize: 11,
              background: "rgba(91,106,240,0.06)",
              border: "1px solid var(--acg)",
              borderRadius: 4,
              padding: "8px 10px",
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            <span style={{ fontSize: 10, color: "var(--ac)", fontWeight: 700, letterSpacing: "0.08em" }}>AI REWRITE PREVIEW</span>
            <span style={{ color: "var(--tx0)", fontWeight: 500 }}>{preview.new_description}</span>
            {hasDownstream && (
              <span style={{ fontSize: 10, color: "var(--tx2)", marginTop: 2 }}>
                Applying will re-run {downstreamSteps.length} downstream {downstreamSteps.length === 1 ? "step" : "steps"}.
              </span>
            )}
          </div>
          {errorMsg && (
            <div style={{ fontSize: 11, color: "var(--rd)", background: "rgba(239,68,68,0.08)", border: "1px solid var(--rd)", borderRadius: 4, padding: "6px 8px", display: "flex", gap: 6 }}>
              <span style={{ flex: 1, wordBreak: "break-word" }}>{errorMsg}</span>
              <button onClick={() => setErrorMsg(null)} style={{ background: "none", border: "none", color: "var(--tx2)", cursor: "pointer", fontSize: 14, lineHeight: 1 }}>×</button>
            </div>
          )}
          <div style={{ display: "flex", gap: 6 }}>
            <button
              className="btn"
              style={{ fontSize: 11, padding: "4px 14px", background: "var(--ac)", color: "#fff", border: "1px solid var(--ac)" }}
              onClick={() => void handleApply()}
              disabled={isWorking}
            >
              {isWorking ? "Applying\u2026" : "Apply"}
            </button>
            <button className="btn" style={{ fontSize: 11, padding: "4px 14px" }} onClick={handleDiscard} disabled={isWorking}>
              Try again
            </button>
          </div>
        </>
      )}

      {/* ── Phase: conflict — downstream step broke ───────────────────────── */}
      {phase === "conflict" && conflict && preview && (
        <div
          style={{
            fontSize: 11,
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
            step &quot;{conflict.failedLabel}&quot; broke after the rewrite.
          </div>
          <div style={{ fontSize: 10, color: "var(--tx2)", fontFamily: "var(--mono, monospace)", wordBreak: "break-word", background: "var(--bg0)", borderRadius: 3, padding: "4px 6px" }}>
            {conflict.errorDetail}
          </div>
          <div style={{ fontSize: 10, color: "var(--tx2)" }}>
            <strong>Revert</strong> — discard the rewrite, pipeline unchanged.&nbsp;|&nbsp;
            <strong>Trim</strong> — keep the rewrite and remove the broken steps.
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn" style={{ fontSize: 11, padding: "3px 10px" }} onClick={onClose}>
              Revert
            </button>
            <button
              className="btn"
              style={{ fontSize: 11, padding: "3px 10px", background: "rgba(245,158,11,0.15)", border: "1px solid #f59e0b", color: "#f59e0b" }}
              onClick={() => void handleTrim()}
              disabled={isWorking}
            >
              {isWorking ? "Trimming\u2026" : `Trim from "${conflict.failedLabel}"`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

