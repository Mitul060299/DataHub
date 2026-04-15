import { useRef, useState } from "react";
import { useWorkspaceContext } from "../../contexts/WorkspaceContext";
import type { Project } from "../../contexts/WorkspaceContext";

const PRESET_COLOURS = ["#5b6af0", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#a855f7"];
const PRESET_ICONS = ["📁", "📊", "📈", "🗂️", "💼", "🔬"];

interface NewProjectModalProps {
  open: boolean;
  onClose: () => void;
  /** Called with the newly-created project after successful creation */
  onCreated?: (project: Project) => void;
}

export function NewProjectModal({ open, onClose, onCreated }: NewProjectModalProps) {
  const { createProject, activeWorkspaceId } = useWorkspaceContext();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [colour, setColour] = useState(PRESET_COLOURS[0]);
  const [icon, setIcon] = useState(PRESET_ICONS[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const customColorRef = useRef<HTMLInputElement | null>(null);

  if (!open) return null;

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Project name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const project = await createProject({ name: trimmed, description: description.trim() || undefined, colour, icon, workspace_id: activeWorkspaceId !== "default" ? activeWorkspaceId : undefined });
      // Reset form
      setName("");
      setDescription("");
      setColour(PRESET_COLOURS[0]);
      setIcon(PRESET_ICONS[0]);
      onCreated?.(project);
      onClose();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail ?? "Failed to create project.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="New Project"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(2px)",
      }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: "var(--bg2)",
          border: "1px solid var(--bd2)",
          borderRadius: 12,
          width: 420,
          padding: "28px 28px 24px",
          display: "flex",
          flexDirection: "column",
          gap: 20,
          boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "var(--tx0)" }}>New Project</h2>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--tx1)", fontSize: 18, lineHeight: 1, padding: "2px 6px", borderRadius: 6 }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Icon + Colour row */}
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
          {/* Icon picker */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 11, color: "var(--tx1)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>Icon</span>
            <div style={{ display: "flex", gap: 6 }}>
              {PRESET_ICONS.map((em) => (
                <button
                  key={em}
                  onClick={() => setIcon(em)}
                  title={em}
                  style={{
                    fontSize: 18,
                    width: 34,
                    height: 34,
                    borderRadius: 8,
                    border: icon === em ? `2px solid ${colour}` : "2px solid var(--bd)",
                    background: icon === em ? "var(--acl)" : "var(--bg3)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "border-color 0.15s",
                  }}
                >
                  {em}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Colour picker */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 11, color: "var(--tx1)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>Colour</span>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {PRESET_COLOURS.map((c) => (
              <button
                key={c}
                onClick={() => setColour(c)}
                title={c}
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  background: c,
                  border: colour === c ? "2px solid var(--tx0)" : "2px solid transparent",
                  cursor: "pointer",
                  outline: "none",
                  flexShrink: 0,
                  transition: "border-color 0.15s",
                }}
              />
            ))}
            {/* Custom colour input */}
            <div
              onClick={() => customColorRef.current?.click()}
              style={{
                width: 24,
                height: 24,
                borderRadius: "50%",
                background: PRESET_COLOURS.includes(colour) ? "var(--bg4)" : colour,
                border: !PRESET_COLOURS.includes(colour) ? "2px solid var(--tx0)" : "2px solid var(--bd)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                color: "var(--tx1)",
                flexShrink: 0,
              }}
              title="Custom colour"
            >
              +
              <input
                ref={customColorRef}
                type="color"
                value={colour}
                onChange={(e) => setColour(e.target.value)}
                style={{ position: "absolute", opacity: 0, width: 0, height: 0, pointerEvents: "none" }}
                tabIndex={-1}
              />
            </div>
          </div>
        </div>

        {/* Name */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 13, fontWeight: 500, color: "var(--tx1)" }}>
            Name <span style={{ color: "#ef4444" }}>*</span>
          </label>
          <div style={{ position: "relative" }}>
            <input
              autoFocus
              type="text"
              value={name}
              maxLength={50}
              onChange={(e) => { setName(e.target.value); setError(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") void handleCreate(); }}
              placeholder="e.g. Marketing Analytics"
              style={{
                width: "100%",
                boxSizing: "border-box",
                background: "var(--bg3)",
                border: `1px solid ${error ? "#ef4444" : "var(--bd2)"}`,
                borderRadius: 8,
                padding: "9px 44px 9px 12px",
                fontSize: 14,
                color: "var(--tx0)",
                outline: "none",
              }}
            />
            <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "var(--tx2, #666)", pointerEvents: "none" }}>
              {name.length}/50
            </span>
          </div>
          {error && <span style={{ fontSize: 12, color: "#ef4444" }}>{error}</span>}
        </div>

        {/* Description */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 13, fontWeight: 500, color: "var(--tx1)" }}>Description <span style={{ color: "var(--tx2, #666)", fontWeight: 400 }}>(optional)</span></label>
          <div style={{ position: "relative" }}>
            <textarea
              value={description}
              maxLength={200}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of this project…"
              rows={3}
              style={{
                width: "100%",
                boxSizing: "border-box",
                background: "var(--bg3)",
                border: "1px solid var(--bd2)",
                borderRadius: 8,
                padding: "9px 12px 24px",
                fontSize: 14,
                color: "var(--tx0)",
                outline: "none",
                resize: "none",
                fontFamily: "inherit",
              }}
            />
            <span style={{ position: "absolute", right: 10, bottom: 8, fontSize: 11, color: "var(--tx2, #666)", pointerEvents: "none" }}>
              {description.length}/200
            </span>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            disabled={saving}
            style={{ padding: "8px 18px", borderRadius: 8, border: "1px solid var(--bd2)", background: "var(--bg3)", color: "var(--tx1)", fontSize: 14, cursor: saving ? "not-allowed" : "pointer" }}
          >
            Cancel
          </button>
          <button
            onClick={() => void handleCreate()}
            disabled={saving || !name.trim()}
            style={{
              padding: "8px 20px",
              borderRadius: 8,
              border: "none",
              background: saving || !name.trim() ? "var(--bg4)" : "var(--ac)",
              color: saving || !name.trim() ? "var(--tx2, #666)" : "#fff",
              fontSize: 14,
              fontWeight: 500,
              cursor: saving || !name.trim() ? "not-allowed" : "pointer",
              transition: "background 0.15s",
            }}
          >
            {saving ? "Creating…" : "Create Project"}
          </button>
        </div>
      </div>
    </div>
  );
}
