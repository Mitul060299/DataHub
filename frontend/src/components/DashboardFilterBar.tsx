/**
 * DashboardFilterBar
 *
 * A compact row of filter chips rendered above the dashboard grid.
 * Each filter targets a dimension value and dims non-matching data in all chart tiles.
 */

import { useRef, useState, type CSSProperties } from "react";

export interface ActiveFilter {
  id: string;
  /** The x_col / dimension column name (e.g. "region", "category") */
  column: string;
  operator: "=" | "!=" | "contains" | ">" | "<";
  value: string;
}

interface DashboardFilterBarProps {
  /** Unique x_col names from all chart tiles — shown in the column selector */
  columns: string[];
  filters: ActiveFilter[];
  onChange: (filters: ActiveFilter[]) => void;
}

const OP_LABELS: Record<ActiveFilter["operator"], string> = {
  "=": "=",
  "!=": "≠",
  contains: "~",
  ">": ">",
  "<": "<",
};

export function DashboardFilterBar({ columns, filters, onChange }: DashboardFilterBarProps) {
  const [showForm, setShowForm] = useState(false);
  const [draftCol, setDraftCol] = useState(columns[0] ?? "");
  const [draftOp, setDraftOp] = useState<ActiveFilter["operator"]>("=");
  const [draftVal, setDraftVal] = useState("");
  const valInputRef = useRef<HTMLInputElement>(null);

  const openForm = () => {
    setDraftCol(columns[0] ?? "");
    setDraftOp("=");
    setDraftVal("");
    setShowForm(true);
    // focus the value input on next tick
    setTimeout(() => valInputRef.current?.focus(), 40);
  };

  const applyFilter = () => {
    if (!draftVal.trim()) return;
    const col = draftCol || columns[0] || "value";
    onChange([
      ...filters,
      { id: crypto.randomUUID(), column: col, operator: draftOp, value: draftVal.trim() },
    ]);
    setDraftVal("");
    setShowForm(false);
  };

  const removeFilter = (id: string) => onChange(filters.filter((f) => f.id !== id));

  return (
    <div
      className="no-print"
      style={{
        padding: "5px 16px",
        borderBottom: "1px solid #1E293B",
        display: "flex",
        alignItems: "center",
        gap: 6,
        flexWrap: "wrap",
        background: "rgba(0,0,0,0.18)",
        minHeight: 36,
      }}
    >
      <span style={labelStyle}>Filters</span>

      {/* Active filter chips */}
      {filters.map((f) => (
        <div key={f.id} style={chipStyle}>
          <span style={{ color: "#818CF8", fontSize: 11 }}>
            {f.column}&nbsp;
            <span style={{ opacity: 0.7 }}>{OP_LABELS[f.operator]}</span>
            &nbsp;<strong style={{ color: "#E2E8F0" }}>{f.value}</strong>
          </span>
          <button
            onClick={() => removeFilter(f.id)}
            title="Remove filter"
            style={chipRemoveBtn}
          >
            ×
          </button>
        </div>
      ))}

      {/* Inline add-filter form */}
      {showForm && (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          {columns.length > 0 && (
            <select
              value={draftCol}
              onChange={(e) => setDraftCol(e.target.value)}
              style={selectStyle}
            >
              {columns.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}
          <select
            value={draftOp}
            onChange={(e) => setDraftOp(e.target.value as ActiveFilter["operator"])}
            style={selectStyle}
          >
            <option value="=">=</option>
            <option value="!=">≠</option>
            <option value="contains">contains</option>
            <option value=">">&gt;</option>
            <option value="<">&lt;</option>
          </select>
          <input
            ref={valInputRef}
            value={draftVal}
            onChange={(e) => setDraftVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") applyFilter();
              if (e.key === "Escape") setShowForm(false);
            }}
            placeholder="value"
            style={valInputStyle}
          />
          <button onClick={applyFilter} style={applyBtnStyle}>
            Apply
          </button>
          <button
            onClick={() => setShowForm(false)}
            style={discardBtnStyle}
            title="Cancel"
          >
            ✕
          </button>
        </div>
      )}

      {/* Add filter button */}
      {!showForm && (
        <button onClick={openForm} style={addBtnStyle}>
          + Add filter
        </button>
      )}

      {/* Clear all */}
      {filters.length > 0 && (
        <button
          onClick={() => onChange([])}
          style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 11, padding: "2px 4px", marginLeft: 2 }}
        >
          Clear all
        </button>
      )}
    </div>
  );
}

// ── styles ────────────────────────────────────────────────────────────────────

const labelStyle: CSSProperties = {
  fontSize: 10,
  color: "#475569",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.07em",
  flexShrink: 0,
  marginRight: 2,
};

const chipStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  background: "rgba(91,106,240,0.12)",
  border: "1px solid rgba(91,106,240,0.3)",
  borderRadius: 6,
  padding: "2px 4px 2px 8px",
};

const chipRemoveBtn: CSSProperties = {
  background: "none",
  border: "none",
  color: "#475569",
  cursor: "pointer",
  fontSize: 14,
  lineHeight: 1,
  padding: "0 2px",
};

const selectStyle: CSSProperties = {
  background: "#121827",
  border: "1px solid #1E293B",
  borderRadius: 6,
  color: "#94A3B8",
  fontSize: 11,
  padding: "3px 6px",
  outline: "none",
};

const valInputStyle: CSSProperties = {
  background: "#121827",
  border: "1px solid #1E293B",
  borderRadius: 6,
  color: "#E2E8F0",
  fontSize: 11,
  padding: "3px 8px",
  outline: "none",
  width: 130,
};

const addBtnStyle: CSSProperties = {
  background: "none",
  border: "1px solid #1E293B",
  borderRadius: 6,
  color: "#64748B",
  cursor: "pointer",
  fontSize: 11,
  padding: "2px 8px",
};

const applyBtnStyle: CSSProperties = {
  background: "#5B6AF0",
  border: "none",
  borderRadius: 6,
  color: "#fff",
  fontSize: 11,
  fontWeight: 600,
  padding: "3px 10px",
  cursor: "pointer",
};

const discardBtnStyle: CSSProperties = {
  background: "none",
  border: "none",
  color: "#475569",
  fontSize: 14,
  cursor: "pointer",
  padding: "2px 4px",
};
