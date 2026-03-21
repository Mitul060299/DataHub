import { useEffect, useState } from "react";
import { api } from "../../api";

interface Template {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  steps_count: number;
}

interface TemplatePickerModalProps {
  open: boolean;
  workspaceId?: string;
  onClose: () => void;
  onCreated: (pipelineId: string, pipelineName: string) => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  "Data Quality": "#5B6AF0",
  "Aggregation": "#22c55e",
  "Data Enrichment": "#f59e0b",
  "AI / NLP": "#a855f7",
  "AI / Analytics": "#ec4899",
  "Analytics": "#06b6d4",
};

export function TemplatePickerModal({
  open,
  workspaceId,
  onClose,
  onCreated,
}: TemplatePickerModalProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [creating, setCreating] = useState<string | null>(null); // template id being created
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    api
      .get<{ templates: Template[] }>("/api/pipelines/templates")
      .then((r) => setTemplates(r.data.templates))
      .catch(() => setError("Failed to load templates."))
      .finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;

  const categories = Array.from(new Set(templates.map((t) => t.category)));

  const filtered = templates.filter((t) => {
    const matchesSearch =
      !search ||
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.description.toLowerCase().includes(search.toLowerCase()) ||
      t.tags.some((tag) => tag.toLowerCase().includes(search.toLowerCase()));
    const matchesCategory = !selectedCategory || t.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const handleInstantiate = async (template: Template) => {
    setCreating(template.id);
    setError(null);
    try {
      const resp = await api.post<{ data: { id: string; name: string } }>(
        `/api/pipelines/templates/${template.id}/instantiate`,
        {
          workspace_id: workspaceId ?? "default",
        }
      );
      onCreated(resp.data.data.id, resp.data.data.name);
      onClose();
    } catch {
      setError(`Failed to create pipeline from template "${template.name}".`);
    } finally {
      setCreating(null);
    }
  };

  return (
    <div style={overlay}>
      <div style={modal}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <h3 style={{ margin: 0, color: "#e8e8f0", fontSize: 16 }}>Pipeline Templates</h3>
            <p style={{ margin: "4px 0 0", color: "#8888a0", fontSize: 12 }}>
              Start from a pre-built template — steps can be customised after creation.
            </p>
          </div>
          <button
            className="btn"
            onClick={onClose}
            style={{ width: 28, height: 28, padding: 0, fontSize: 16, lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        {/* Search */}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search templates…"
          style={{
            width: "100%",
            height: 34,
            border: "1px solid #2a2a38",
            borderRadius: 8,
            background: "#1a1a22",
            color: "#e8e8f0",
            padding: "0 10px",
            fontSize: 13,
            marginBottom: 12,
            boxSizing: "border-box",
          }}
        />

        {/* Category pills */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
          <CategoryPill
            label="All"
            active={selectedCategory === null}
            onClick={() => setSelectedCategory(null)}
            color="#5B6AF0"
          />
          {categories.map((cat) => (
            <CategoryPill
              key={cat}
              label={cat}
              active={selectedCategory === cat}
              onClick={() => setSelectedCategory(cat === selectedCategory ? null : cat)}
              color={CATEGORY_COLORS[cat] ?? "#5B6AF0"}
            />
          ))}
        </div>

        {/* Template grid */}
        {loading ? (
          <p style={{ color: "#8888a0", fontSize: 13, textAlign: "center", padding: "24px 0" }}>
            Loading templates…
          </p>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: 10,
              maxHeight: 380,
              overflowY: "auto",
              paddingRight: 4,
            }}
          >
            {filtered.length === 0 ? (
              <p style={{ color: "#8888a0", fontSize: 13, gridColumn: "1 / -1" }}>No templates match.</p>
            ) : null}
            {filtered.map((template) => (
              <div
                key={template.id}
                style={{
                  background: "#1a1a22",
                  border: "1px solid #2a2a38",
                  borderRadius: 10,
                  padding: "12px 14px",
                  display: "grid",
                  gap: 8,
                  transition: "border-color 0.15s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#5B6AF050")}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#2a2a38")}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: "0.07em",
                      textTransform: "uppercase",
                      color: CATEGORY_COLORS[template.category] ?? "#5B6AF0",
                    }}
                  >
                    {template.category}
                  </span>
                  <span style={{ fontSize: 10, color: "#55556a" }}>
                    {template.steps_count} step{template.steps_count !== 1 ? "s" : ""}
                  </span>
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#e8e8f0" }}>
                    {template.name}
                  </p>
                  <p style={{ margin: "4px 0 0", fontSize: 12, color: "#8888a0", lineHeight: 1.4 }}>
                    {template.description}
                  </p>
                </div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {template.tags.slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      style={{
                        fontSize: 10,
                        padding: "2px 6px",
                        borderRadius: 4,
                        background: "#22222e",
                        color: "#8888a0",
                        border: "1px solid #33333e",
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <button
                  className="btn btn-primary"
                  style={{ fontSize: 12, padding: "6px 0", width: "100%" }}
                  disabled={creating !== null}
                  onClick={() => void handleInstantiate(template)}
                >
                  {creating === template.id ? "Creating…" : "Use Template"}
                </button>
              </div>
            ))}
          </div>
        )}

        {error ? (
          <p style={{ marginTop: 10, color: "#c94040", fontSize: 12 }}>{error}</p>
        ) : null}
      </div>
    </div>
  );
}

function CategoryPill({
  label,
  active,
  onClick,
  color,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  color: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: 11,
        padding: "4px 10px",
        borderRadius: 20,
        border: active ? `1px solid ${color}` : "1px solid #2a2a38",
        background: active ? `${color}22` : "transparent",
        color: active ? color : "#8888a0",
        cursor: "pointer",
        fontWeight: active ? 600 : 400,
        transition: "all 0.12s",
      }}
    >
      {label}
    </button>
  );
}

const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "#00000080",
  display: "grid",
  placeItems: "center",
  zIndex: 40,
};

const modal: React.CSSProperties = {
  width: "min(760px, 94vw)",
  background: "#111115",
  border: "1px solid #22222a",
  borderRadius: 14,
  padding: "20px",
};
