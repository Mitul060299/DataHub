import { useEffect, useRef, useState } from "react";
import { usePipeline } from "../../hooks/usePipeline";

interface Pipeline {
  id: string;
  name: string;
  steps_count?: number;
  step_count?: number;
  description?: string;
}

interface ImportPipelineModalProps {
  open: boolean;
  workspaceId?: string;
  onClose: () => void;
  onCloned: (pipelineId: string, pipelineName: string) => void;
}

// Normalise the varied shapes the /api/pipelines endpoint may return
function normalizePipeline(item: Record<string, unknown>): Pipeline {
  const id = String(item.id ?? "").trim();
  const name = String(item.name ?? item.title ?? `Pipeline ${id}`);
  const steps_count = Number(item.steps_count ?? item.step_count ?? 0);
  const description = item.description ? String(item.description) : undefined;
  return { id, name, steps_count, description };
}

export function ImportPipelineModal({
  open,
  workspaceId,
  onClose,
  onCloned,
}: ImportPipelineModalProps) {
  const { clonePipelineWorkflow } = usePipeline();

  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [cloning, setCloning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    setSelectedId(null);
    setSearch("");

    import("../../api").then(({ api }) =>
      api
        .get("/api/pipelines", { params: { limit: 100 } })
        .then((r) => {
          // API returns { success, data: { total, pipelines: [...] } }
          const raw = r.data as {
            data?: { pipelines?: unknown[] };
            pipelines?: unknown[];
          } | unknown[];
          let source: unknown[];
          if (Array.isArray(raw)) {
            source = raw;
          } else if (Array.isArray((raw as { data?: { pipelines?: unknown[] } }).data?.pipelines)) {
            source = (raw as { data: { pipelines: unknown[] } }).data.pipelines;
          } else if (Array.isArray((raw as { pipelines?: unknown[] }).pipelines)) {
            source = (raw as { pipelines: unknown[] }).pipelines;
          } else {
            source = [];
          }
          setPipelines(
            source
              .map((i) => normalizePipeline(i as Record<string, unknown>))
              .filter((p) => p.id),
          );
        })
        .catch(() => setError("Failed to load pipelines."))
        .finally(() => setLoading(false)),
    );
  }, [open]);

  const selectedPipeline = pipelines.find((p) => p.id === selectedId) ?? null;

  const handleSelect = (p: Pipeline) => {
    setSelectedId(p.id);
    setNewName(`Copy of ${p.name}`);
    setTimeout(() => nameRef.current?.select(), 0);
  };

  const handleClone = async () => {
    if (!selectedId || cloning) return;
    setCloning(true);
    setError(null);
    try {
      const res = await clonePipelineWorkflow(selectedId, {
        name: newName.trim() || `Copy of ${selectedPipeline?.name ?? "Pipeline"}`,
      });
      onCloned(res.data.id, res.data.name);
      onClose();
    } catch {
      setError("Failed to clone pipeline. Please try again.");
    } finally {
      setCloning(false);
    }
  };

  if (!open) return null;

  const filtered = pipelines.filter(
    (p) =>
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.description ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.6)",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          width: 480,
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          background: "#13131a",
          border: "1px solid #2a2a38",
          borderRadius: 12,
          overflow: "hidden",
          boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            padding: "18px 18px 12px",
            borderBottom: "1px solid #2a2a38",
            flexShrink: 0,
          }}
        >
          <div>
            <h3 style={{ margin: 0, color: "#e8e8f0", fontSize: 15, fontWeight: 600 }}>
              Import Pipeline
            </h3>
            <p style={{ margin: "4px 0 0", color: "#8888a0", fontSize: 12 }}>
              Clone a saved pipeline into this project.
            </p>
          </div>
          <button
            className="btn"
            onClick={onClose}
            style={{ width: 28, height: 28, padding: 0, fontSize: 16, lineHeight: 1, flexShrink: 0, marginLeft: 12 }}
          >
            ×
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: "10px 18px 0", flexShrink: 0 }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search pipelines…"
            style={{
              width: "100%",
              height: 34,
              border: "1px solid #2a2a38",
              borderRadius: 8,
              background: "#1a1a22",
              color: "#e8e8f0",
              padding: "0 10px",
              fontSize: 13,
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 18px" }}>
          {loading ? (
            <div style={{ color: "#8888a0", fontSize: 13, padding: "20px 0", textAlign: "center" }}>
              Loading pipelines…
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ color: "#8888a0", fontSize: 13, padding: "20px 0", textAlign: "center" }}>
              {pipelines.length === 0 ? "No saved pipelines found." : "No pipelines match your search."}
            </div>
          ) : (
            filtered.map((p) => {
              const selected = p.id === selectedId;
              return (
                <div
                  key={p.id}
                  onClick={() => handleSelect(p)}
                  style={{
                    padding: "9px 12px",
                    borderRadius: 8,
                    border: `1px solid ${selected ? "#5B6AF0" : "#2a2a38"}`,
                    background: selected ? "rgba(91,106,240,0.12)" : "#1a1a22",
                    marginBottom: 6,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                  }}
                  onMouseEnter={(e) => {
                    if (!selected) (e.currentTarget as HTMLDivElement).style.borderColor = "#3a3a50";
                  }}
                  onMouseLeave={(e) => {
                    if (!selected) (e.currentTarget as HTMLDivElement).style.borderColor = "#2a2a38";
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        color: selected ? "#a5b4fc" : "#e8e8f0",
                        fontWeight: selected ? 600 : 400,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {p.name}
                    </div>
                    {p.description ? (
                      <div
                        style={{
                          fontSize: 11,
                          color: "#8888a0",
                          marginTop: 2,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {p.description}
                      </div>
                    ) : null}
                  </div>
                  <span
                    style={{
                      fontSize: 10,
                      color: "#8888a0",
                      background: "#27272a",
                      borderRadius: 10,
                      padding: "2px 7px",
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                    }}
                  >
                    {p.steps_count ?? 0} steps
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        {selectedPipeline ? (
          <div
            style={{
              padding: "12px 18px 16px",
              borderTop: "1px solid #2a2a38",
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <label style={{ fontSize: 11, color: "#8888a0", marginBottom: 2 }}>
              Name for cloned pipeline
            </label>
            <input
              ref={nameRef}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void handleClone(); }}
              style={{
                height: 34,
                border: "1px solid #2a2a38",
                borderRadius: 8,
                background: "#1a1a22",
                color: "#e8e8f0",
                padding: "0 10px",
                fontSize: 13,
                boxSizing: "border-box",
                width: "100%",
              }}
            />
            {error ? (
              <div style={{ fontSize: 12, color: "#f87171" }}>{error}</div>
            ) : null}
            <button
              className="btn"
              onClick={() => void handleClone()}
              disabled={cloning || !newName.trim()}
              style={{
                height: 34,
                fontSize: 13,
                background: cloning ? undefined : "#5B6AF0",
                color: "#fff",
                fontWeight: 500,
              }}
            >
              {cloning ? "Cloning…" : "Clone Pipeline"}
            </button>
          </div>
        ) : (
          error ? (
            <div style={{ padding: "10px 18px 14px", fontSize: 12, color: "#f87171", flexShrink: 0 }}>
              {error}
            </div>
          ) : null
        )}
      </div>
    </div>
  );
}
