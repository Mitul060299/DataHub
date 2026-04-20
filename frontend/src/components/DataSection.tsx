import React, { useRef, useState } from "react";
import { IconDatabase, IconPlus } from "./Icons";
import type { Dataset } from "../contexts/WorkspaceContext";

const normalizeFormat = (value?: string | null) => {
  if (!value) return null;
  const lowered = value.toLowerCase();
  if (["xlsx", "xls", "excel"].includes(lowered)) return "excel";
  if (["csv", "txt", "tsv"].includes(lowered)) return "csv";
  if (lowered === "json") return "json";
  if (lowered === "parquet") return "parquet";
  return lowered;
};

const formatAccent: Record<string, string> = {
  csv: "var(--ac)",
  excel: "var(--gr)",
  json: "var(--or)",
  parquet: "var(--pu)",
};

interface DataSectionProps {
  datasets: Dataset[];
  activeDatasetId?: string;
  onSelect: (dataset: Dataset) => void;
  onImport: () => void;
  onRemove: (dataset: Dataset) => void;
  onRename?: (dataset: Dataset, newName: string) => void;
  onAddConnection?: () => void;
}

export function DataSection({ datasets, activeDatasetId, onSelect, onImport, onRemove, onRename, onAddConnection }: DataSectionProps) {
  const [open, setOpen] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const commitRename = (dataset: Dataset) => {
    const trimmed = editingName.trim();
    if (trimmed && trimmed !== dataset.name) onRename?.(dataset, trimmed);
    setEditingId(null);
  };

  const startEdit = (dataset: Dataset) => {
    setEditingName(dataset.name);
    setEditingId(dataset.id);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  return (
    <section style={{ borderTop: "1px solid var(--bd)", marginTop: 8 }}>
      <div style={{ display: "flex", alignItems: "center" }}>
        <button
          onClick={() => setOpen((value) => !value)}
          style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, padding: "6px 0", color: "var(--tx1)", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", background: "none", border: "none", cursor: "pointer" }}
        >
          <IconDatabase size={13} color="var(--tx2)" />
          DATA
          {datasets.length > 0 && (
            <span style={{ background: "var(--bg3)", borderRadius: 99, padding: "1px 6px", fontSize: 10, fontWeight: 400, color: "var(--tx2)", letterSpacing: "normal", lineHeight: "16px" }}>
              {datasets.length}
            </span>
          )}
          <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--tx2)" }}>{open ? "▾" : "▸"}</span>
        </button>
        <div style={{ position: "relative" }}>
          <button
            className="btn"
            style={{ width: 24, height: 24, padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Add data"
            title="Add data"
          >
            <IconPlus size={14} />
          </button>
          {menuOpen && (
            <div
              onMouseLeave={() => setMenuOpen(false)}
              style={{
                position: "absolute",
                right: 0,
                top: "calc(100% + 4px)",
                zIndex: 200,
                background: "var(--bg2)",
                border: "1px solid var(--bd)",
                borderRadius: "var(--r6)",
                minWidth: 164,
                boxShadow: "0 4px 12px rgba(0,0,0,.25)",
                overflow: "hidden",
              }}
            >
              {([
                { label: "Upload file", icon: <IconPlus size={13} />, action: () => { setMenuOpen(false); onImport(); } },
                { label: "Connect database", icon: <IconDatabase size={13} />, action: () => { setMenuOpen(false); onAddConnection?.(); } },
              ] as { label: string; icon: React.ReactNode; action: () => void }[]).map(({ label, icon, action }) => (
                <button
                  key={label}
                  onClick={action}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    width: "100%",
                    padding: "7px 12px",
                    fontSize: 12,
                    color: "var(--tx1)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg3)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                >
                  {icon}
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {open ? (
        <div style={{ display: "grid", gap: 4 }}>
          {datasets.map((dataset) => {
            const active = activeDatasetId === dataset.id;
            const normalizedFormat = normalizeFormat(dataset.format);
            const formatColor = normalizedFormat ? (formatAccent[normalizedFormat] ?? "var(--tx1)") : undefined;
            return (
              <div
                key={dataset.id}
                style={{
                  height: 30,
                  borderRadius: "var(--r6)",
                  border: "1px solid var(--bd)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0 6px 0 8px",
                  background: active ? "var(--acl)" : "transparent",
                }}
              >
                {editingId === dataset.id ? (
                  <>
                    <span style={{ flexShrink: 0, display: "inline-flex" }}><IconDatabase size={14} /></span>
                    <input
                      ref={inputRef}
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onBlur={() => commitRename(dataset)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename(dataset);
                        else if (e.key === "Escape") setEditingId(null);
                      }}
                      style={{
                        flex: 1,
                        marginLeft: 6,
                        height: 22,
                        fontSize: 12,
                        background: "var(--bg3)",
                        border: "1px solid var(--ac)",
                        borderRadius: 4,
                        color: "var(--tx0)",
                        padding: "0 6px",
                        fontFamily: "DM Mono, monospace",
                      }}
                    />
                  </>
                ) : (
                  <button onClick={() => onSelect(dataset)} style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0, flex: 1, textAlign: "left" }}>
                    <IconDatabase size={14} />
                    <span className="mono" style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{dataset.name}</span>
                  </button>
                )}
                {editingId !== dataset.id && normalizedFormat ? (
                  <span
                    className="mono"
                    style={{
                      height: 18,
                      borderRadius: "var(--r4)",
                      border: `1px solid ${formatColor}`,
                      color: formatColor,
                      padding: "0 5px",
                      display: "inline-flex",
                      alignItems: "center",
                      fontSize: 10,
                      textTransform: "uppercase",
                    }}
                  >
                    {normalizedFormat}
                  </span>
                ) : null}
                {editingId !== dataset.id ? (
                  <span className="mono" style={{ color: "var(--tx1)", fontSize: 11, marginLeft: 8 }}>{dataset.rows}</span>
                ) : null}
                {onRename ? (
                  <button
                    className="btn"
                    aria-label={`Rename ${dataset.name}`}
                    title="Rename"
                    style={{ height: 22, width: 22, padding: 0, marginLeft: 6, borderColor: "transparent", background: "transparent", color: "var(--tx1)", fontSize: 12 }}
                    onClick={() => startEdit(dataset)}
                  >
                    ✏
                  </button>
                ) : null}
                <button
                  className="btn"
                  aria-label={`Remove ${dataset.name}`}
                  title="Remove dataset"
                  style={{ height: 22, width: 22, padding: 0, marginLeft: 4, borderColor: "transparent", background: "transparent", color: "var(--tx1)" }}
                  onClick={() => onRemove(dataset)}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
