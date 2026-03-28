/**
 * CanvasToolbar
 * ──────────────
 * Top bar for an open canvas: editable name, add-block buttons, share, save.
 */
import { useEffect, useRef, useState } from "react";
import type { CanvasLayout, CanvasTileItem } from "../api";
import { saveCanvasLayout } from "../api";

interface CanvasToolbarProps {
  canvas: CanvasLayout;
  tiles: CanvasTileItem[];
  onBack: () => void;
  onSaved: (updated: CanvasLayout) => void;
  onAddText: () => void;
  onAddKpi: () => void;
  onAddSlicer: () => void;
  onShare: () => void;
}

export function CanvasToolbar({ canvas, tiles, onBack, onSaved, onAddText, onAddKpi, onAddSlicer, onShare }: CanvasToolbarProps) {
  const [name, setName] = useState(canvas.name);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // sync name if canvas changes
  useEffect(() => { setName(canvas.name); }, [canvas.name]);

  const handleSave = async (overrideTiles?: CanvasTileItem[]) => {
    setSaving(true);
    setSaved(false);
    try {
      const updated = await saveCanvasLayout(canvas.id, {
        name,
        layout: overrideTiles ?? tiles,
      });
      onSaved(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  // auto-save name changes with debounce
  const handleNameChange = (value: string) => {
    setName(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void handleSave(), 1200);
  };

  return (
    <div
      style={{
        height: 40,
        borderBottom: "1px solid var(--bd)",
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "0 10px",
        background: "var(--bg1)",
        flexShrink: 0,
      }}
    >
      {/* back */}
      <button
        className="btn"
        style={{ padding: "0 10px", fontSize: 11 }}
        onClick={onBack}
      >
        ← Canvases
      </button>

      {/* editable name */}
      <input
        value={name}
        onChange={(e) => handleNameChange(e.target.value)}
        onBlur={() => void handleSave()}
        style={{
          flex: 1,
          maxWidth: 260,
          fontSize: 13,
          fontWeight: 600,
          padding: "2px 8px",
          border: "1px solid transparent",
          borderRadius: 4,
          background: "transparent",
          color: "var(--tx)",
          outline: "none",
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = "var(--ac)";
          e.currentTarget.style.background = "var(--bg2)";
        }}
        onBlurCapture={(e) => {
          e.currentTarget.style.borderColor = "transparent";
          e.currentTarget.style.background = "transparent";
        }}
      />

      <span style={{ flex: 1 }} />

      {/* insert block buttons */}
      <button className="btn" style={{ fontSize: 11 }} onClick={onAddText}>
        + Text
      </button>
      <button className="btn" style={{ fontSize: 11 }} onClick={onAddKpi}>
        + KPI
      </button>
      <button className="btn" style={{ fontSize: 11 }} onClick={onAddSlicer}>
        + Slicer
      </button>

      {/* share button */}
      <button className="btn" style={{ fontSize: 11 }} onClick={onShare}>
        Share
      </button>

      {/* save layout */}
      <button
        className="btn"
        disabled={saving}
        onClick={() => void handleSave()}
        style={{
          background: saved ? "#22c55e" : "var(--ac)",
          color: "#fff",
          borderColor: saved ? "#22c55e" : "var(--ac)",
          fontSize: 11,
          padding: "0 14px",
        }}
      >
        {saved ? "✓ Saved" : saving ? "Saving…" : "Save Layout"}
      </button>
    </div>
  );
}
