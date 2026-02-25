import { useMemo, useState } from "react";
import { IconFilter, IconSearch } from "./Icons";

type SortDirection = "asc" | "desc";

interface DataTableProps {
  loading: boolean;
  rows: Record<string, unknown>[];
  columns: string[];
  stepCount: number;
  lastAction: string;
}

const statusColor: Record<string, string> = {
  Delivered: "var(--gr)",
  Processing: "var(--yw)",
  Shipped: "var(--ac)",
};

export function DataTable({ loading, rows, columns, stepCount, lastAction }: DataTableProps) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<string>("");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    let nextRows = rows;
    if (q) {
      nextRows = rows.filter((row) => Object.values(row).some((value) => String(value ?? "").toLowerCase().includes(q)));
    }
    if (sortKey) {
      nextRows = [...nextRows].sort((a, b) => {
        const av = a[sortKey] ?? "";
        const bv = b[sortKey] ?? "";
        if (av === bv) return 0;
        if (sortDirection === "asc") return av > bv ? 1 : -1;
        return av < bv ? 1 : -1;
      });
    }
    return nextRows;
  }, [rows, query, sortKey, sortDirection]);

  const handleSort = (column: string) => {
    if (sortKey === column) {
      setSortDirection((dir) => (dir === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(column);
    setSortDirection("asc");
  };

  if (loading) {
    return (
      <div className="panel" style={{ margin: 8, height: "calc(100% - 16px)", padding: 12 }}>
        <div style={{ display: "grid", gap: 8 }}>
          {Array.from({ length: 8 }).map((_, index) => (
            <div
              key={index}
              style={{
                height: 16,
                borderRadius: "var(--r6)",
                background: "linear-gradient(90deg, var(--bg2), var(--bg3), var(--bg2))",
                backgroundSize: "200% 100%",
                animation: "skeleton 1.2s ease infinite",
              }}
            />
          ))}
        </div>
        <style>{`@keyframes skeleton{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
      </div>
    );
  }

  return (
    <div className="panel" style={{ margin: 8, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: 8, borderBottom: "1px solid var(--bd)" }}>
        <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
          <IconSearch size={14} className="search-icon" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search rows..."
            style={{ width: "100%", height: 28, border: "1px solid var(--bd2)", borderRadius: "var(--r6)", background: "var(--bg2)", padding: "0 10px 0 28px" }}
          />
          <style>{`.search-icon { position: absolute; left: 8px; top: 7px; color: var(--tx1); }`}</style>
        </div>
        <button className="btn" style={{ width: 32, padding: 0 }} aria-label="Filter">
          <IconFilter size={14} />
        </button>
      </div>

      <div style={{ flex: 1, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th className="mono" style={{ width: 50, textAlign: "right", color: "var(--tx1)", borderBottom: "1px solid var(--bd)", padding: "8px 10px" }}>#</th>
              {columns.map((column) => (
                <th
                  key={column}
                  onClick={() => handleSort(column)}
                  className="mono"
                  style={{ textAlign: "left", borderBottom: "1px solid var(--bd)", padding: "8px 10px", cursor: "pointer" }}
                >
                  {column} {sortKey === column ? (sortDirection === "asc" ? "↑" : "↓") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row, index) => (
              <tr key={`row-${index}`} style={{ borderBottom: "1px solid var(--bd)" }}>
                <td className="mono" style={{ textAlign: "right", color: "var(--tx1)", padding: "7px 10px" }}>{index + 1}</td>
                {columns.map((column) => {
                  const value = row[column];
                  const text = value === null || value === undefined || value === "" ? "—" : String(value);
                  const isNumber = typeof value === "number";
                  const status = typeof value === "string" && statusColor[value] ? value : null;
                  return (
                    <td
                      key={`${index}-${column}`}
                      className="mono"
                      style={{
                        padding: "7px 10px",
                        color: status ? statusColor[status] : isNumber ? "#7dd3fc" : value === null || value === undefined || value === "" ? "var(--tx2)" : "var(--tx0)",
                        fontStyle: value === null || value === undefined || value === "" ? "italic" : "normal",
                      }}
                    >
                      {text}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mono" style={{ borderTop: "1px solid var(--bd)", padding: "7px 10px", color: "var(--tx1)", fontSize: 11 }}>
        {filteredRows.length} rows · {columns.length} cols · {stepCount} steps applied · Last: {lastAction}
      </div>
    </div>
  );
}
