import { useState } from "react";
import { IconBarChart, IconCode, IconTable } from "./Icons";
import type { Dataset } from "../contexts/WorkspaceContext";

export type ArtifactKind = "table" | "metric" | "variable";

export interface ArtifactItem extends Dataset {
  kind: ArtifactKind;
}

interface ArtifactsSectionProps {
  artifacts: ArtifactItem[];
  activeDatasetId?: string;
  onSelect: (dataset: Dataset) => void;
  onRemove: (dataset: Dataset) => void;
}

const kindLabel: Record<ArtifactKind, string> = {
  table: "Table",
  metric: "Metric",
  variable: "Variable",
};

const kindIcon: Record<ArtifactKind, typeof IconTable> = {
  table: IconTable,
  metric: IconBarChart,
  variable: IconCode,
};

export function ArtifactsSection({ artifacts, activeDatasetId, onSelect, onRemove }: ArtifactsSectionProps) {
  const [open, setOpen] = useState(true);

  return (
    <section style={{ borderTop: "1px solid var(--bd)", paddingTop: 8, marginTop: 10 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <button onClick={() => setOpen((value) => !value)} style={{ color: "var(--tx1)", fontSize: 11, letterSpacing: "0.08em" }}>
          {open ? "▼" : "▶"} ARTIFACTS
        </button>
      </header>
      {open ? (
        <div style={{ display: "grid", gap: 4 }}>
          {!artifacts.length ? <p style={{ color: "var(--tx2)", fontSize: 12 }}>No artifacts yet. Run transformations to create them.</p> : null}
          {artifacts.map((artifact) => {
            const active = activeDatasetId === artifact.id;
            const KindIcon = kindIcon[artifact.kind];
            return (
              <div
                key={artifact.id}
                style={{
                  minHeight: 34,
                  borderRadius: "var(--r6)",
                  border: "1px solid var(--bd)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0 6px 0 8px",
                  background: active ? "var(--acl)" : "transparent",
                }}
              >
                <button onClick={() => onSelect(artifact)} style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0, flex: 1, textAlign: "left" }}>
                  <KindIcon size={14} />
                  <span className="mono" style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{artifact.name}</span>
                </button>
                <span className="mono" style={{ color: "var(--tx1)", fontSize: 10, marginLeft: 8 }}>{kindLabel[artifact.kind]}</span>
                <button
                  className="btn"
                  style={{ height: 22, padding: "0 6px", marginLeft: 6, fontSize: 10 }}
                  onClick={() => onSelect(artifact)}
                >
                  Use
                </button>
                <button
                  className="btn"
                  aria-label={`Remove ${artifact.name}`}
                  title="Remove artifact"
                  style={{ height: 22, width: 22, padding: 0, marginLeft: 6, borderColor: "transparent", background: "transparent", color: "var(--tx1)" }}
                  onClick={() => onRemove(artifact)}
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
