import { useState } from "react";
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
}

export function DataSection({ datasets, activeDatasetId, onSelect, onImport, onRemove }: DataSectionProps) {
  const [open, setOpen] = useState(true);

  return (
    <section style={{ borderTop: "1px solid var(--bd)", paddingTop: 8 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <button onClick={() => setOpen((value) => !value)} style={{ color: "var(--tx1)", fontSize: 11, letterSpacing: "0.08em" }}>
          {open ? "▼" : "▶"} DATA
        </button>
        {open ? (
          <button className="btn" style={{ width: 26, padding: 0 }} onClick={onImport} aria-label="Import dataset">
            <IconPlus size={14} />
          </button>
        ) : null}
      </header>
      {open ? (
        <div style={{ display: "grid", gap: 4 }}>
          {datasets.map((dataset) => {
            const active = activeDatasetId === dataset.id;
            const normalizedFormat = normalizeFormat(dataset.format);
            const formatColor = normalizedFormat ? (formatAccent[normalizedFormat] ?? "var(--tx1)") : null;
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
                <button onClick={() => onSelect(dataset)} style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0, flex: 1, textAlign: "left" }}>
                  <IconDatabase size={14} />
                  <span className="mono" style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{dataset.name}</span>
                </button>
                {normalizedFormat ? (
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
                <span className="mono" style={{ color: "var(--tx1)", fontSize: 11, marginLeft: 8 }}>{dataset.rows}</span>
                <button
                  className="btn"
                  aria-label={`Remove ${dataset.name}`}
                  title="Remove dataset"
                  style={{ height: 22, width: 22, padding: 0, marginLeft: 6, borderColor: "transparent", background: "transparent", color: "var(--tx1)" }}
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
