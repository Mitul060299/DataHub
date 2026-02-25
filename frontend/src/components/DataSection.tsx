import { useState } from "react";
import { IconDatabase, IconPlus } from "./Icons";
import type { Dataset } from "../contexts/WorkspaceContext";

interface DataSectionProps {
  datasets: Dataset[];
  activeDatasetId?: string;
  onSelect: (dataset: Dataset) => void;
  onImport: () => void;
}

export function DataSection({ datasets, activeDatasetId, onSelect, onImport }: DataSectionProps) {
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
            return (
              <button
                key={dataset.id}
                onClick={() => onSelect(dataset)}
                style={{
                  height: 30,
                  borderRadius: "var(--r6)",
                  border: "1px solid var(--bd)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0 8px",
                  background: active ? "var(--acl)" : "transparent",
                }}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <IconDatabase size={14} />
                  <span className="mono" style={{ fontSize: 12 }}>{dataset.name}</span>
                </span>
                <span className="mono" style={{ color: "var(--tx1)", fontSize: 11 }}>{dataset.rows}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
