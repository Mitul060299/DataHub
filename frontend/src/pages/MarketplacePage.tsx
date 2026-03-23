import { useEffect, useState } from "react";

// ── Types ────────────────────────────────────────────────────────────────────

interface MarketplaceItem {
  source: "official" | "community";
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  steps_count: number;
  author: string;
}

interface UserPipeline {
  id: string;
  name: string;
  description?: string;
  is_public: boolean;
  steps_count: number;
  status: string;
}

// ── Category colours ─────────────────────────────────────────────────────────

const CAT_COLOR: Record<string, string> = {
  "Data Quality": "#5B6AF0",
  "Aggregation": "#22c55e",
  "Data Enrichment": "#f59e0b",
  "AI / NLP": "#a855f7",
  "AI / Analytics": "#ec4899",
  "Analytics": "#06b6d4",
  "General": "#71717a",
};

function catColor(cat: string) {
  return CAT_COLOR[cat] ?? "#71717a";
}

// ── Publish Modal ─────────────────────────────────────────────────────────────

function PublishModal({
  pipelines,
  onClose,
  onToggle,
  toggling,
}: {
  pipelines: UserPipeline[];
  onClose: () => void;
  onToggle: (p: UserPipeline, publish: boolean) => void;
  toggling: string | null;
}) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "#111113", border: "1px solid #27272a", borderRadius: 12,
        width: 540, maxHeight: "80vh", overflow: "auto", padding: 24,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <h3 style={{ margin: 0, color: "#e8e8f0", fontSize: 16 }}>Publish to Marketplace</h3>
            <p style={{ margin: "4px 0 0", color: "#71717a", fontSize: 12 }}>
              Public pipelines appear in the Community tab and can be cloned by any user.
            </p>
          </div>
          <button className="btn" onClick={onClose} style={{ width: 28, height: 28, padding: 0, fontSize: 18 }}>×</button>
        </div>

        {pipelines.length === 0 ? (
          <p style={{ color: "#71717a", fontSize: 13, textAlign: "center", padding: "24px 0" }}>
            No saved pipelines yet. Create a pipeline first via the Pipeline section.
          </p>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {pipelines.map((p) => (
              <div key={p.id} style={{
                border: "1px solid #27272a", borderRadius: 8, padding: "10px 14px",
                display: "flex", alignItems: "center", gap: 12,
                background: p.is_public ? "#0d1f0d" : "#18181b",
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: "#e8e8f0", fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {p.name}
                  </div>
                  <div style={{ color: "#71717a", fontSize: 11, marginTop: 2 }}>
                    {p.steps_count} step{p.steps_count !== 1 ? "s" : ""}
                    {p.is_public && <span style={{ color: "#22c55e", marginLeft: 8, fontWeight: 600 }}>● Public</span>}
                  </div>
                </div>
                <button
                  className="btn"
                  disabled={toggling === p.id}
                  onClick={() => onToggle(p, !p.is_public)}
                  style={{
                    fontSize: 11, padding: "4px 12px", flexShrink: 0,
                    background: p.is_public ? "#3f0000" : undefined,
                    color: p.is_public ? "#ef4444" : undefined,
                    borderColor: p.is_public ? "#7f1d1d" : undefined,
                  }}
                >
                  {toggling === p.id ? "…" : p.is_public ? "Unpublish" : "Publish"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────

function MarketplaceCard({
  item,
  onAction,
  actionLabel,
  acting,
}: {
  item: MarketplaceItem;
  onAction: () => void;
  actionLabel: string;
  acting: boolean;
}) {
  return (
    <article style={{
      border: "1px solid #27272a", borderRadius: 10, padding: 16,
      background: "#111113", display: "flex", flexDirection: "column", gap: 8,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <h3 style={{ margin: 0, color: "#e8e8f0", fontSize: 14, fontWeight: 600, lineHeight: 1.3 }}>
          {item.name}
        </h3>
        <span style={{
          fontSize: 10, padding: "2px 7px", borderRadius: 20, whiteSpace: "nowrap",
          background: catColor(item.category) + "26",
          color: catColor(item.category),
          border: `1px solid ${catColor(item.category)}50`,
          fontWeight: 600, letterSpacing: "0.04em",
        }}>
          {item.category}
        </span>
      </div>

      <p style={{ margin: 0, color: "#a1a1aa", fontSize: 12, lineHeight: 1.5, flex: 1 }}>
        {item.description || "No description provided."}
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 2 }}>
        {item.tags.slice(0, 4).map((tag) => (
          <span key={tag} style={{
            fontSize: 10, padding: "1px 6px", borderRadius: 4,
            background: "#27272a", color: "#71717a",
          }}>#{tag}</span>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
        <div style={{ color: "#52525b", fontSize: 11 }}>
          {item.steps_count} step{item.steps_count !== 1 ? "s" : ""} &nbsp;·&nbsp;
          <span style={{ color: item.source === "official" ? "#5B6AF0" : "#22c55e" }}>
            {item.source === "official" ? "⚡ Official" : `👤 ${item.author}`}
          </span>
        </div>
        <button
          className="btn"
          onClick={onAction}
          disabled={acting}
          style={{ fontSize: 11, padding: "4px 12px" }}
        >
          {acting ? "…" : actionLabel}
        </button>
      </div>
    </article>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function MarketplacePage() {
  const [tab, setTab] = useState<"official" | "community">("official");
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const [templates, setTemplates] = useState<MarketplaceItem[]>([]);
  const [community, setCommunity] = useState<MarketplaceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [actingId, setActingId] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const [publishOpen, setPublishOpen] = useState(false);
  const [myPipelines, setMyPipelines] = useState<UserPipeline[]>([]);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // ── Load marketplace data ─────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    setError(null);
    import("../api").then(({ api }) =>
      api
        .get("/api/pipelines/marketplace")
        .then((r) => {
          const d = (r.data as { data: { templates: MarketplaceItem[]; community: MarketplaceItem[] } }).data;
          setTemplates(d.templates ?? []);
          setCommunity(d.community ?? []);
        })
        .catch(() => setError("Failed to load marketplace."))
        .finally(() => setLoading(false))
    );
  }, []);

  // ── Load user's own pipelines when Publish modal opens ──────────────────
  useEffect(() => {
    if (!publishOpen) return;
    import("../api").then(({ api }) =>
      api
        .get("/api/pipelines", { params: { limit: 100 } })
        .then((r) => {
          const raw = r.data as { data?: { pipelines?: unknown[] } };
          const rows = raw?.data?.pipelines ?? [];
          setMyPipelines(
            (rows as Record<string, unknown>[]).map((p) => ({
              id: String(p.id ?? ""),
              name: String(p.name ?? "Untitled"),
              description: p.description as string | undefined,
              is_public: Boolean((p as { is_public?: boolean }).is_public),
              steps_count: Number(p.steps_count ?? 0),
              status: String(p.status ?? ""),
            }))
          );
        })
        .catch(() => setMyPipelines([]))
    );
  }, [publishOpen]);

  // ── Actions ──────────────────────────────────────────────────────────────
  const handleUseTemplate = async (item: MarketplaceItem) => {
    setActingId(item.id);
    setActionMsg(null);
    try {
      const { api } = await import("../api");
      await api.post(`/api/pipelines/templates/${item.id}/instantiate`, { workspace_id: "default" });
      setActionMsg(`"${item.name}" added to your pipelines. Open the Pipeline section to run it.`);
    } catch {
      setActionMsg("Failed to add template. Are you logged in?");
    } finally {
      setActingId(null);
    }
  };

  const handleClone = async (item: MarketplaceItem) => {
    setActingId(item.id);
    setActionMsg(null);
    try {
      const { api } = await import("../api");
      await api.post(`/api/pipelines/${item.id}/clone`, { name: `Copy of ${item.name}` });
      setActionMsg(`"${item.name}" cloned to your pipelines.`);
    } catch {
      setActionMsg("Failed to clone. Are you logged in?");
    } finally {
      setActingId(null);
    }
  };

  const handleTogglePublish = async (p: UserPipeline, publish: boolean) => {
    setTogglingId(p.id);
    try {
      const { api } = await import("../api");
      if (publish) {
        await api.post(`/api/pipelines/${p.id}/share`, { tags: [], description: p.description });
      } else {
        await api.delete(`/api/pipelines/${p.id}/share`);
      }
      setMyPipelines((prev) =>
        prev.map((x) => (x.id === p.id ? { ...x, is_public: publish } : x))
      );
      // Refresh community list
      const r = await api.get("/api/pipelines/marketplace");
      const d = (r.data as { data: { templates: MarketplaceItem[]; community: MarketplaceItem[] } }).data;
      setCommunity(d.community ?? []);
    } catch {
      /* ignore */
    } finally {
      setTogglingId(null);
    }
  };

  // ── Filter ───────────────────────────────────────────────────────────────
  const items = tab === "official" ? templates : community;
  const allCategories = Array.from(new Set(items.map((i) => i.category)));

  const filtered = items.filter((i) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      i.name.toLowerCase().includes(q) ||
      i.description.toLowerCase().includes(q) ||
      i.tags.some((t) => t.toLowerCase().includes(q));
    const matchCat = !selectedCategory || i.category === selectedCategory;
    return matchSearch && matchCat;
  });

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <main style={{ flex: 1, overflowY: "auto", width: "100%" }}>
      <div style={{ padding: "28px 32px", maxWidth: 1100, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, color: "#e8e8f0", fontWeight: 700 }}>Pipeline Marketplace</h1>
          <p style={{ margin: "6px 0 0", color: "#71717a", fontSize: 13 }}>
            Browse official templates and community-published pipelines. Use, clone, and share.
          </p>
        </div>
        <button
          className="btn"
          style={{ fontSize: 12, padding: "7px 16px", flexShrink: 0 }}
          onClick={() => setPublishOpen(true)}
        >
          + Publish My Pipeline
        </button>
      </div>

      {/* Action message */}
      {actionMsg && (
        <div style={{
          marginBottom: 16, padding: "10px 14px", borderRadius: 8,
          background: actionMsg.startsWith("Failed") ? "#3f0000" : "#0d1f0d",
          border: `1px solid ${actionMsg.startsWith("Failed") ? "#7f1d1d" : "#166534"}`,
          color: actionMsg.startsWith("Failed") ? "#ef4444" : "#4ade80",
          fontSize: 13, display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          {actionMsg}
          <button onClick={() => setActionMsg(null)} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: 16 }}>×</button>
        </div>
      )}

      {/* Tabs + search */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", border: "1px solid #27272a", borderRadius: 8, overflow: "hidden" }}>
          {(["official", "community"] as const).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setSelectedCategory(null); }}
              style={{
                padding: "7px 18px", border: "none", cursor: "pointer", fontSize: 13,
                background: tab === t ? "#5B6AF0" : "transparent",
                color: tab === t ? "#fff" : "#a1a1aa",
                fontWeight: tab === t ? 600 : 400,
              }}
            >
              {t === "official" ? "⚡ Official Templates" : `👥 Community (${community.length})`}
            </button>
          ))}
        </div>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search…"
          style={{
            flex: 1, minWidth: 180, height: 34, border: "1px solid #27272a", borderRadius: 8,
            background: "#18181b", color: "#e8e8f0", padding: "0 12px", fontSize: 13,
          }}
        />

        {allCategories.length > 1 && (
          <select
            value={selectedCategory ?? ""}
            onChange={(e) => setSelectedCategory(e.target.value || null)}
            style={{
              height: 34, border: "1px solid #27272a", borderRadius: 8,
              background: "#18181b", color: "#a1a1aa", padding: "0 10px", fontSize: 12,
            }}
          >
            <option value="">All categories</option>
            {allCategories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        )}
      </div>

      {/* Grid */}
      {loading ? (
        <p style={{ color: "#71717a", textAlign: "center", marginTop: 60 }}>Loading…</p>
      ) : error ? (
        <p style={{ color: "#ef4444", textAlign: "center", marginTop: 60 }}>{error}</p>
      ) : filtered.length === 0 ? (
        <p style={{ color: "#71717a", textAlign: "center", marginTop: 60 }}>
          {tab === "community"
            ? "No community pipelines yet. Be the first to publish one!"
            : "No templates match your search."}
        </p>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
          gap: 14,
        }}>
          {filtered.map((item) => (
            <MarketplaceCard
              key={item.source + item.id}
              item={item}
              acting={actingId === item.id}
              actionLabel={item.source === "official" ? "Use Template" : "Clone Pipeline"}
              onAction={() =>
                item.source === "official" ? handleUseTemplate(item) : handleClone(item)
              }
            />
          ))}
        </div>
      )}

      {/* Publish modal */}
      {publishOpen && (
        <PublishModal
          pipelines={myPipelines}
          onClose={() => setPublishOpen(false)}
          onToggle={handleTogglePublish}
          toggling={togglingId}
        />
      )}
      </div>
    </main>
  );
}

