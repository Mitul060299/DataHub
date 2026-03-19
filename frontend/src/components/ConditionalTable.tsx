import { useState, useMemo } from "react";

interface ConditionalRow {
  row: number;
  type: "variance" | "missing" | string;
  color: string;
  bg: string;
}

interface ConditionalTableProps {
  title?: string;
  subtitle?: string;
  columns: string[];
  rows: unknown[][];
  rowCount?: number;
  conditional?: ConditionalRow[];
  className?: string;
  maxHeight?: number | string;
}

type SortDir = "asc" | "desc";

export function ConditionalTable({
  title,
  subtitle,
  columns,
  rows,
  rowCount,
  conditional = [],
  className = "",
  maxHeight = 400,
}: ConditionalTableProps) {
  const [sortCol, setSortCol] = useState<number | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const condMap = useMemo(() => {
    const m = new Map<number, ConditionalRow>();
    conditional.forEach((c) => m.set(c.row, c));
    return m;
  }, [conditional]);

  const sortedRows = useMemo(() => {
    if (sortCol === null) return rows;
    return [...rows].sort((a, b) => {
      const av = a[sortCol];
      const bv = b[sortCol];
      const an = Number(av);
      const bn = Number(bv);
      const cmp = !isNaN(an) && !isNaN(bn)
        ? an - bn
        : String(av ?? "").localeCompare(String(bv ?? ""));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [rows, sortCol, sortDir]);

  const handleSort = (colIdx: number) => {
    if (sortCol === colIdx) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(colIdx);
      setSortDir("asc");
    }
  };

  const totalRows = rowCount ?? rows.length;

  return (
    <div className={className} style={{ maxHeight, display: "flex", flexDirection: "column" }}>
      {(title || subtitle) && (
        <div style={{ padding: "8px 12px 4px", flexShrink: 0 }}>
          {title && (
            <div style={{ fontSize: 14, fontWeight: 500, color: "#E2E8F0" }}>{title}</div>
          )}
          {subtitle && (
            <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>{subtitle}</div>
          )}
        </div>
      )}

      <div style={{ flex: 1, overflowY: "auto", overflowX: "auto" }}>
        {columns.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: "#94A3B8", fontSize: 13 }}>
            No data
          </div>
        ) : (
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 12,
              minWidth: columns.length * 100,
            }}
          >
            <thead style={{ position: "sticky", top: 0, background: "#0F1117", zIndex: 1 }}>
              <tr>
                {columns.map((col, i) => (
                  <th
                    key={i}
                    onClick={() => handleSort(i)}
                    style={{
                      padding: "8px 10px",
                      textAlign: "left",
                      color: "#94A3B8",
                      fontWeight: 600,
                      fontSize: 11,
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      borderBottom: "1px solid #1E293B",
                      cursor: "pointer",
                      userSelect: "none",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {col}
                    {sortCol === i && (
                      <span style={{ marginLeft: 4 }}>{sortDir === "asc" ? "↑" : "↓"}</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row, rowIdx) => {
                const cond = condMap.get(rowIdx);
                return (
                  <tr
                    key={rowIdx}
                    style={{
                      background: cond?.bg ?? "transparent",
                      borderBottom: "1px solid #1E293B",
                    }}
                  >
                    {row.map((cell, cellIdx) => (
                      <td
                        key={cellIdx}
                        style={{
                          padding: "6px 10px",
                          color: cond?.color ?? "#E2E8F0",
                          fontFamily: typeof cell === "number" ? "monospace" : undefined,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {cell === null || cell === undefined ? (
                          <span style={{ color: "#F59E0B", fontStyle: "italic" }}>—</span>
                        ) : (
                          String(cell)
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Row count footer */}
      <div
        style={{
          padding: "4px 12px",
          fontSize: 11,
          color: "#64748B",
          borderTop: "1px solid #1E293B",
          flexShrink: 0,
          display: "flex",
          gap: 16,
        }}
      >
        <span>{totalRows.toLocaleString()} row{totalRows !== 1 ? "s" : ""}</span>
        {conditional.length > 0 && (
          <>
            <span style={{ color: "#EF4444" }}>
              ⬤ {conditional.filter((c) => c.type === "variance").length} variance
            </span>
            <span style={{ color: "#F59E0B" }}>
              ⬤ {conditional.filter((c) => c.type === "missing").length} missing
            </span>
          </>
        )}
      </div>
    </div>
  );
}
