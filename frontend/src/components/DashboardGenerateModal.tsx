import { useState, useRef, useCallback, type CSSProperties, type DragEvent } from "react";
import { api } from "../api";
import { applyDashboardTemplate } from "../api";
import type { DashboardV2 } from "../types";

interface DashboardGenerateModalProps {
  dashboardId: string;
  onGenerated: (dashboard: DashboardV2) => void;
  onClose: () => void;
}

type Tab = "describe" | "screenshot" | "template";

const TEMPLATES = [
  { id: "sales-overview",        icon: "📊", label: "Sales Overview",        desc: "Revenue, orders, top products & regional breakdown" },
  { id: "executive-report",      icon: "📋", label: "Executive Report",       desc: "KPIs, trend, department performance & commentary" },
  { id: "financial-dashboard",   icon: "💰", label: "Financial Dashboard",    desc: "P&L, expense breakdown, cash flow & EBITDA" },
  { id: "product-analytics",     icon: "🚀", label: "Product Analytics",      desc: "DAU, retention, feature usage & user growth" },
  { id: "marketing-performance", icon: "📣", label: "Marketing Performance",  desc: "Campaign metrics, channels, ROAS & funnel" },
];

export function DashboardGenerateModal({ dashboardId, onGenerated, onClose }: DashboardGenerateModalProps) {
  const [tab, setTab] = useState<Tab>("describe");
  const [description, setDescription] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draggingOver, setDraggingOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const acceptImage = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target?.result as string);
    reader.readAsDataURL(file);
  }, []);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDraggingOver(false);
    const file = e.dataTransfer.files[0];
    if (file) acceptImage(file);
  }, [acceptImage]);

  const canSubmit = () => {
    if (tab === "describe") return description.trim().length > 0;
    if (tab === "screenshot") return imageFile !== null;
    return selectedTemplate !== null;
  };

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      if (tab === "template" && selectedTemplate) {
        const dash = await applyDashboardTemplate(dashboardId, selectedTemplate);
        onGenerated(dash);
        return;
      }

      let screenshot_base64: string | undefined;
      if (tab === "screenshot" && imageFile) {
        screenshot_base64 = await toBase64(imageFile);
      }

      const resp = await api.post<DashboardV2>(`/dashboards/${dashboardId}/generate`, {
        description: description.trim(),
        screenshot_base64: screenshot_base64 ?? null,
      });
      onGenerated(resp.data);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      setError(e.response?.data?.detail ?? e.message ?? "Generation failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 600,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.55)",
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: "#0D1117",
          border: "1px solid #1E293B",
          borderRadius: 16,
          padding: 32,
          width: 560,
          display: "flex",
          flexDirection: "column",
          gap: 20,
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#E2E8F0" }}>✦ Generate with AI</div>
            <div style={{ fontSize: 12, color: "#475569", marginTop: 4 }}>
              Describe, upload a screenshot, or pick a template
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "#64748B", cursor: "pointer", fontSize: 22, lineHeight: 1, padding: 0 }}
          >
            ×
          </button>
        </div>

        {/* Tab bar */}
        <div style={{ display: "flex", gap: 4, background: "#0F1117", borderRadius: 10, padding: 4, border: "1px solid #1E293B" }}>
          {(["describe", "screenshot", "template"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1,
                border: "none",
                borderRadius: 7,
                padding: "7px 0",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                background: tab === t ? "#1E293B" : "transparent",
                color: tab === t ? "#E2E8F0" : "#64748B",
                transition: "background 0.15s, color 0.15s",
              }}
            >
              {t === "describe" ? "✏ Describe" : t === "screenshot" ? "🖼 Screenshot" : "⊞ Templates"}
            </button>
          ))}
        </div>

        {/* Tab: Describe */}
        {tab === "describe" && (
          <>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={labelStyle}>What should this dashboard show?</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={
                  "Example: \"Monthly sales overview with KPI cards at the top showing total revenue, " +
                  "orders, and AOV, followed by a revenue trend line chart and a bar chart of top 10 customers by spend.\""
                }
                rows={5}
                style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }}
              />
            </label>
            <div style={{ background: "rgba(91,106,240,0.07)", border: "1px solid rgba(91,106,240,0.2)", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#94A3B8", lineHeight: 1.6 }}>
              <strong style={{ color: "#818CF8" }}>Tip:</strong> After generating, use the AI chat
              on any dataset to create real charts and pin them to replace the placeholder tiles.
            </div>
          </>
        )}

        {/* Tab: Screenshot */}
        {tab === "screenshot" && (
          <>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={labelStyle}>Reference screenshot <span style={{ color: "#475569", fontWeight: 400 }}>(Power BI, Tableau, etc.)</span></span>
              <div
                onDrop={handleDrop}
                onDragOver={(e) => { e.preventDefault(); setDraggingOver(true); }}
                onDragLeave={() => setDraggingOver(false)}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: `2px dashed ${draggingOver ? "#5B6AF0" : "#1E293B"}`,
                  borderRadius: 10,
                  background: draggingOver ? "rgba(91,106,240,0.06)" : "#0F1117",
                  padding: imagePreview ? 8 : 28,
                  textAlign: "center",
                  cursor: "pointer",
                  transition: "border-color 0.15s",
                }}
              >
                {imagePreview ? (
                  <div style={{ position: "relative", display: "inline-block" }}>
                    <img src={imagePreview} alt="reference" style={{ maxWidth: "100%", maxHeight: 180, borderRadius: 6, display: "block" }} />
                    <button
                      onClick={(e) => { e.stopPropagation(); setImageFile(null); setImagePreview(null); }}
                      style={{ position: "absolute", top: 4, right: 4, background: "rgba(0,0,0,0.7)", border: "none", color: "#fff", borderRadius: 20, width: 24, height: 24, cursor: "pointer", fontSize: 14, lineHeight: "24px" }}
                    >×</button>
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>⊞</div>
                    <div style={{ fontSize: 13, color: "#64748B" }}>
                      Drop screenshot here, or <span style={{ color: "#818CF8" }}>browse</span>
                    </div>
                    <div style={{ fontSize: 11, color: "#334155", marginTop: 4 }}>PNG, JPG, WEBP — requires OpenAI or Anthropic vision key</div>
                  </>
                )}
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) acceptImage(f); }} />
            </label>
          </>
        )}

        {/* Tab: Templates */}
        {tab === "template" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {TEMPLATES.map((tmpl) => (
              <button
                key={tmpl.id}
                onClick={() => setSelectedTemplate(tmpl.id === selectedTemplate ? null : tmpl.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  border: `1px solid ${selectedTemplate === tmpl.id ? "#5B6AF0" : "#1E293B"}`,
                  borderRadius: 10,
                  background: selectedTemplate === tmpl.id ? "rgba(91,106,240,0.1)" : "#0F1117",
                  padding: "12px 16px",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "border-color 0.15s, background 0.15s",
                  width: "100%",
                }}
              >
                <span style={{ fontSize: 26, flexShrink: 0 }}>{tmpl.icon}</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#E2E8F0" }}>{tmpl.label}</div>
                  <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>{tmpl.desc}</div>
                </div>
                {selectedTemplate === tmpl.id && (
                  <span style={{ marginLeft: "auto", color: "#5B6AF0", fontSize: 16, flexShrink: 0 }}>✓</span>
                )}
              </button>
            ))}
            <div style={{ fontSize: 11, color: "#475569", textAlign: "center", marginTop: 4 }}>
              Templates create placeholder tiles — fill them using the AI chat on your dataset.
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ background: "#ef444415", border: "1px solid #ef444430", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#fca5a5" }}>
            {error}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={cancelBtnStyle} disabled={loading}>Cancel</button>
          <button
            onClick={() => void handleGenerate()}
            disabled={loading || !canSubmit()}
            style={{ ...primaryBtnStyle, opacity: loading || !canSubmit() ? 0.6 : 1, cursor: loading || !canSubmit() ? "default" : "pointer" }}
          >
            {loading ? (
              <span style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
                <span style={{ display: "inline-block", width: 14, height: 14, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                {tab === "template" ? "Applying…" : "Generating…"}
              </span>
            ) : (
              tab === "template" ? "⊞ Apply template" : "✦ Generate dashboard"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

async function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const labelStyle: CSSProperties = { fontSize: 12, color: "#94A3B8", fontWeight: 600 };

const inputStyle: CSSProperties = {
  border: "1px solid #1E293B",
  borderRadius: 8,
  background: "#121827",
  color: "#E2E8F0",
  padding: "8px 10px",
  fontSize: 13,
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

const cancelBtnStyle: CSSProperties = {
  flex: 1,
  border: "1px solid #1E293B",
  borderRadius: 8,
  background: "transparent",
  color: "#94A3B8",
  padding: "10px 0",
  fontSize: 13,
  cursor: "pointer",
};

const primaryBtnStyle: CSSProperties = {
  flex: 2,
  border: "none",
  borderRadius: 8,
  background: "linear-gradient(135deg, #5B6AF0, #818CF8)",
  color: "#fff",
  padding: "10px 0",
  fontSize: 13,
  fontWeight: 600,
};
