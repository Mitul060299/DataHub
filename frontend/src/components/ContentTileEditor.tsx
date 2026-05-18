import { useState, type CSSProperties } from "react";

type ContentType = "heading" | "text" | "image" | "divider";

interface ContentTileEditorProps {
  onSave: (data: { title: string; tile_type: string; query_spec: Record<string, unknown> }) => void;
  onClose: () => void;
}

const TYPE_OPTIONS: { value: ContentType; label: string; icon: string; desc: string }[] = [
  { value: "heading", label: "Heading", icon: "H", desc: "A title or section header" },
  { value: "text", label: "Text", icon: "¶", desc: "A paragraph or description" },
  { value: "image", label: "Image", icon: "⊞", desc: "An image from a URL" },
  { value: "divider", label: "Divider", icon: "—", desc: "A horizontal separator" },
];

export function ContentTileEditor({ onSave, onClose }: ContentTileEditorProps) {
  const [type, setType] = useState<ContentType>("heading");
  const [text, setText] = useState("");
  const [level, setLevel] = useState<1 | 2 | 3>(1);
  const [url, setUrl] = useState("");

  const canSave =
    type === "divider" ||
    (type === "image" ? url.trim().length > 0 : text.trim().length > 0);

  const handleSave = () => {
    if (!canSave) return;
    if (type === "divider") {
      onSave({ title: "Divider", tile_type: "divider", query_spec: {} });
      return;
    }
    if (type === "heading") {
      onSave({ title: text.trim(), tile_type: "heading", query_spec: { text: text.trim(), level } });
      return;
    }
    if (type === "text") {
      onSave({ title: text.slice(0, 40) || "Text block", tile_type: "text", query_spec: { text: text.trim() } });
      return;
    }
    if (type === "image") {
      onSave({ title: text.trim() || "Image", tile_type: "image", query_spec: { url: url.trim(), caption: text.trim() } });
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 500,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.5)",
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: "#0F1117",
          border: "1px solid #1E293B",
          borderRadius: 14,
          padding: 28,
          width: 420,
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: "#E2E8F0" }}>Add content block</span>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "#64748B", cursor: "pointer", fontSize: 20, lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        {/* Type selector */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
          {TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setType(opt.value)}
              title={opt.desc}
              style={{
                border: `1px solid ${type === opt.value ? "#5B6AF0" : "#1E293B"}`,
                borderRadius: 8,
                background: type === opt.value ? "rgba(91,106,240,0.12)" : "#121827",
                color: type === opt.value ? "#818CF8" : "#64748B",
                padding: "10px 6px",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              <span style={{ fontSize: 18, lineHeight: 1 }}>{opt.icon}</span>
              {opt.label}
            </button>
          ))}
        </div>

        {/* Type-specific inputs */}
        {type === "heading" && (
          <>
            <label style={labelStyle}>
              <span style={labelTextStyle}>Heading text</span>
              <input
                autoFocus
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSave()}
                placeholder="Section title…"
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              <span style={labelTextStyle}>Level</span>
              <div style={{ display: "flex", gap: 8 }}>
                {([1, 2, 3] as const).map((l) => (
                  <button
                    key={l}
                    onClick={() => setLevel(l)}
                    style={{
                      border: `1px solid ${level === l ? "#5B6AF0" : "#1E293B"}`,
                      borderRadius: 6,
                      background: level === l ? "rgba(91,106,240,0.12)" : "#121827",
                      color: level === l ? "#818CF8" : "#64748B",
                      padding: "4px 16px",
                      cursor: "pointer",
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  >
                    H{l}
                  </button>
                ))}
              </div>
            </label>
          </>
        )}

        {type === "text" && (
          <label style={labelStyle}>
            <span style={labelTextStyle}>Text content</span>
            <textarea
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Enter your text or markdown…"
              rows={4}
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </label>
        )}

        {type === "image" && (
          <>
            <label style={labelStyle}>
              <span style={labelTextStyle}>Image URL</span>
              <input
                autoFocus
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/image.png"
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              <span style={labelTextStyle}>Caption (optional)</span>
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Image caption…"
                style={inputStyle}
              />
            </label>
          </>
        )}

        {type === "divider" && (
          <div style={{ padding: "8px 0" }}>
            <hr style={{ border: "none", borderTop: "1px solid #334155" }} />
            <p style={{ margin: "8px 0 0", fontSize: 12, color: "#475569", textAlign: "center" }}>
              A horizontal rule to separate sections
            </p>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <button onClick={onClose} style={cancelBtnStyle}>Cancel</button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            style={{ ...primaryBtnStyle, opacity: canSave ? 1 : 0.5, cursor: canSave ? "pointer" : "default" }}
          >
            Add to canvas
          </button>
        </div>
      </div>
    </div>
  );
}

const labelStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 6 };

const labelTextStyle: CSSProperties = { fontSize: 12, color: "#94A3B8", fontWeight: 600 };

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
  padding: "8px 0",
  fontSize: 13,
  cursor: "pointer",
};

const primaryBtnStyle: CSSProperties = {
  flex: 1,
  border: "none",
  borderRadius: 8,
  background: "#5B6AF0",
  color: "#fff",
  padding: "8px 0",
  fontSize: 13,
  fontWeight: 600,
};
