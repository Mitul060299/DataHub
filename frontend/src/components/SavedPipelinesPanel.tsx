/**
 * SavedPipelinesPanel.tsx
 * Lists saved V2 pipeline workflows with Load / Run / Edit / Delete actions.
 */
import { useEffect, useState } from "react";
import { usePipeline } from "../hooks/usePipeline";
import { useWorkspaceContext } from "../contexts/WorkspaceContext";
import { usePipelineContext, type PipelineStep } from "../contexts/PipelineContext";
import { api } from "../api";

interface SavedPipeline {
  id: string;
  name: string;
  description: string | null;
  status: string;
  version: number;
  steps_count: number;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

interface Props {
  /** Called after a pipeline's steps are loaded into the editor */
  onLoaded: (pipelineId: string, pipelineName: string) => void;
}

export function SavedPipelinesPanel({ onLoaded }: Props) {
  const [pipelines, setPipelines] = useState<SavedPipeline[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [nlEditId, setNlEditId] = useState<string | null>(null);
  const [nlEditPrompt, setNlEditPrompt] = useState("");
  const [nlEditing, setNlEditing] = useState(false);

  const { replaceSteps } = usePipelineContext();
  const { activeDataset } = useWorkspaceContext();
  const { listPipelineWorkflows, getPipelineWorkflow, runPipelineWorkflow, deletePipelineWorkflow } = usePipeline();

  const fetchPipelines = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listPipelineWorkflows();
      setPipelines(res.data.pipelines);
    } catch {
      setError("Failed to load pipelines.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void fetchPipelines(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLoad = async (p: SavedPipeline) => {
    setLoadingId(p.id);
    try {
      const res = await getPipelineWorkflow(p.id);
      const rawSteps = res.data.steps ?? [];
      const mapped: PipelineStep[] = rawSteps.map((s, i) => ({
        id: crypto.randomUUID(),
        stepNumber: i + 1,
        operation: String(s.action_type ?? s.operation ?? "custom_sql"),
        description: String(s.description ?? `Step ${i + 1}`),
        sql: typeof s.sql === "string" ? s.sql : typeof s.query === "string" ? s.query : undefined,
        parameters: s.parameters as Record<string, unknown> | undefined,
        appliedAt: new Date(),
        rawConfig: s,
      } as PipelineStep));
      replaceSteps(mapped);
      onLoaded(p.id, p.name);
      window.dispatchEvent(new CustomEvent("datahub:toast", { detail: { message: `"${p.name}" loaded into editor`, type: "success" } }));
    } catch {
      window.dispatchEvent(new CustomEvent("datahub:toast", { detail: { message: "Failed to load pipeline", type: "error" } }));
    } finally {
      setLoadingId(null);
    }
  };

  const handleRun = async (p: SavedPipeline) => {
    if (!activeDataset?.id) {
      window.dispatchEvent(new CustomEvent("datahub:toast", { detail: { message: "Select a dataset first", type: "error" } }));
      return;
    }
    setRunningId(p.id);
    try {
      await runPipelineWorkflow(p.id, { input_dataset_id: activeDataset.id, triggered_by: "manual" });
      window.dispatchEvent(new CustomEvent("datahub:toast", { detail: { message: `Pipeline "${p.name}" started`, type: "success" } }));
    } catch {
      window.dispatchEvent(new CustomEvent("datahub:toast", { detail: { message: "Pipeline run failed", type: "error" } }));
    } finally {
      setRunningId(null);
    }
  };

  const handleDelete = async (p: SavedPipeline) => {
    if (!window.confirm(`Delete pipeline "${p.name}"? This cannot be undone.`)) return;
    setDeletingId(p.id);
    try {
      await deletePipelineWorkflow(p.id);
      setPipelines((prev) => prev.filter((x) => x.id !== p.id));
      window.dispatchEvent(new CustomEvent("datahub:toast", { detail: { message: `Deleted "${p.name}"`, type: "success" } }));
    } catch {
      window.dispatchEvent(new CustomEvent("datahub:toast", { detail: { message: "Delete failed", type: "error" } }));
    } finally {
      setDeletingId(null);
    }
  };

  const handleNlEdit = async (p: SavedPipeline) => {
    const prompt = nlEditPrompt.trim();
    if (!prompt || nlEditing) return;
    setNlEditing(true);
    try {
      await api.post(`/api/pipelines/${p.id}/nl-edit`, { prompt });
      setNlEditId(null);
      setNlEditPrompt("");
      await fetchPipelines();
      window.dispatchEvent(new CustomEvent("datahub:toast", { detail: { message: `"${p.name}" updated`, type: "success" } }));
    } catch {
      window.dispatchEvent(new CustomEvent("datahub:toast", { detail: { message: "Edit failed", type: "error" } }));
    } finally {
      setNlEditing(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: "20px 0", textAlign: "center", color: "var(--tx2)", fontSize: 12 }}>
        Loading…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 8 }}>
        <div style={{ color: "var(--rd)", fontSize: 12, marginBottom: 8 }}>{error}</div>
        <button className="btn" style={{ fontSize: 11 }} onClick={() => void fetchPipelines()}>
          Retry
        </button>
      </div>
    );
  }

  if (!pipelines.length) {
    return (
      <div style={{ padding: "24px 8px", textAlign: "center", color: "var(--tx2)", fontSize: 12, lineHeight: 1.6 }}>
        No saved pipelines yet.<br />
        Build steps in the <strong>Current</strong> tab and click <strong>💾 Save</strong>.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {pipelines.map((p) => (
        <div
          key={p.id}
          style={{
            border: "1px solid var(--bd2)",
            borderRadius: "var(--r8)",
            background: "var(--bg2)",
            padding: "8px 10px",
          }}
        >
          {/* Name + meta */}
          <div style={{ fontWeight: 600, fontSize: 12, color: "var(--tx0)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {p.name}
          </div>
          <div style={{ fontSize: 11, color: "var(--tx2)", marginTop: 2 }}>
            {p.steps_count} step{p.steps_count !== 1 ? "s" : ""} · v{p.version} · {new Date(p.created_at).toLocaleDateString()}
          </div>

          {/* Action buttons */}
          <div style={{ display: "flex", gap: 4, marginTop: 8, flexWrap: "wrap" }}>
            <button
              className="btn"
              style={{ fontSize: 11, padding: "3px 8px" }}
              disabled={loadingId === p.id}
              onClick={() => void handleLoad(p)}
              title="Load steps into pipeline editor"
            >
              {loadingId === p.id ? "Loading…" : "✏ Load"}
            </button>

            <button
              className="btn"
              style={{
                fontSize: 11,
                padding: "3px 8px",
                color: activeDataset ? "var(--gr)" : undefined,
                borderColor: activeDataset ? "var(--gr)" : undefined,
                opacity: activeDataset ? 1 : 0.45,
              }}
              disabled={!activeDataset || runningId === p.id}
              onClick={() => void handleRun(p)}
              title={!activeDataset ? "Select a dataset first" : "Run pipeline on active dataset"}
            >
              {runningId === p.id ? "Starting…" : "▶ Run"}
            </button>

            <button
              className="btn"
              style={{ fontSize: 11, padding: "3px 8px" }}
              onClick={() => {
                setNlEditId(nlEditId === p.id ? null : p.id);
                setNlEditPrompt("");
              }}
              title="Edit pipeline steps with a natural-language instruction"
            >
              ✦ Edit
            </button>

            <button
              className="btn"
              style={{
                fontSize: 11,
                padding: "3px 8px",
                color: "var(--rd)",
                borderColor: "var(--rd)",
                opacity: deletingId === p.id ? 0.5 : 1,
              }}
              disabled={deletingId === p.id}
              onClick={() => void handleDelete(p)}
              title="Delete pipeline"
            >
              {deletingId === p.id ? "…" : "🗑"}
            </button>
          </div>

          {/* NL Edit inline form */}
          {nlEditId === p.id && (
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
              <textarea
                autoFocus
                placeholder='e.g. "Change all date format steps to YYYY-MM-DD"'
                value={nlEditPrompt}
                onChange={(e) => setNlEditPrompt(e.target.value)}
                rows={2}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleNlEdit(p); }
                  if (e.key === "Escape") setNlEditId(null);
                }}
                style={{
                  width: "100%",
                  resize: "none",
                  border: "1px solid var(--bd2)",
                  borderRadius: 6,
                  background: "var(--bg1)",
                  color: "var(--tx)",
                  padding: "6px 8px",
                  fontSize: 12,
                  boxSizing: "border-box",
                }}
              />
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  className="btn"
                  style={{
                    fontSize: 11,
                    flex: 1,
                    background: nlEditPrompt.trim() ? "#5B6AF0" : undefined,
                    color: nlEditPrompt.trim() ? "#fff" : undefined,
                  }}
                  disabled={!nlEditPrompt.trim() || nlEditing}
                  onClick={() => void handleNlEdit(p)}
                >
                  {nlEditing ? "Applying…" : "Apply Edit"}
                </button>
                <button className="btn" style={{ fontSize: 11 }} onClick={() => setNlEditId(null)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      ))}

      <button
        className="btn"
        style={{ fontSize: 11, width: "100%", marginTop: 4 }}
        onClick={() => void fetchPipelines()}
      >
        ↺ Refresh
      </button>
    </div>
  );
}
