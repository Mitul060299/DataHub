import { useEffect, useMemo, useRef, useState } from "react";
import { createCalculatedColumn, deleteCalculatedColumn } from "../api";
import type { CalculatedColumn } from "../types";
import { IconFilter, IconSearch } from "./Icons";

type SortDirection = "asc" | "desc";

interface DataTableProps {
  datasetId?: string;
  loading: boolean;
  rows: Record<string, unknown>[];
  columns: string[];
  calculatedColumns: CalculatedColumn[];
  stepCount: number;
  lastAction: string;
  onColumnsChanged: () => void;
}

const statusColor: Record<string, string> = {
  Delivered: "var(--gr)",
  Processing: "var(--yw)",
  Shipped: "var(--ac)",
};

export function DataTable({ datasetId, loading, rows, columns, calculatedColumns, stepCount, lastAction, onColumnsChanged }: DataTableProps) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<string>("");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [columnName, setColumnName] = useState("");
  const [columnFormula, setColumnFormula] = useState("");
  const [columnType, setColumnType] = useState<"dynamic" | "static">("dynamic");
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [columnsError, setColumnsError] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const focusHandler = () => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    };
    window.addEventListener("datahub:datatable:focus-search", focusHandler);
    return () => {
      window.removeEventListener("datahub:datatable:focus-search", focusHandler);
    };
  }, []);

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

  const getErrorMessage = (error: unknown) => {
    const maybeError = error as { response?: { data?: { detail?: string } }; message?: string };
    return maybeError.response?.data?.detail ?? maybeError.message ?? "Request failed";
  };

  const handleAddCalculatedColumn = async () => {
    if (!datasetId || submitting) return;
    const name = columnName.trim();
    const formula = columnFormula.trim();
    if (!name || !formula) {
      setColumnsError("Name and formula are required.");
      return;
    }

    setSubmitting(true);
    setColumnsError(null);
    try {
      await createCalculatedColumn(datasetId, {
        name,
        formula,
        column_type: columnType,
      });
      setColumnName("");
      setColumnFormula("");
      setColumnType("dynamic");
      onColumnsChanged();
    } catch (error) {
      setColumnsError(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteCalculatedColumn = async (columnId: string) => {
    if (!datasetId || deletingId) return;
    setDeletingId(columnId);
    setColumnsError(null);
    try {
      await deleteCalculatedColumn(datasetId, columnId);
      onColumnsChanged();
    } catch (error) {
      setColumnsError(getErrorMessage(error));
    } finally {
      setDeletingId(null);
    }
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
            ref={searchInputRef}
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

      <div style={{ padding: 8, borderBottom: "1px solid var(--bd)", display: "grid", gap: 8 }}>
        <div className="mono" style={{ color: "var(--tx1)", fontSize: 11 }}>Calculated columns</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {calculatedColumns.map((column) => (
            <div
              key={column.id}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 8px",
                borderRadius: "var(--r6)",
                border: "1px solid var(--bd2)",
                background: "var(--bg2)",
              }}
            >
              <span className="mono" style={{ fontSize: 11 }}>{column.name}</span>
              <span className="mono" style={{ fontSize: 10, color: "var(--tx1)" }}>{column.column_type}</span>
              <button
                className="btn"
                style={{ height: 20, padding: "0 6px" }}
                onClick={() => void handleDeleteCalculatedColumn(column.id)}
                disabled={deletingId === column.id}
              >
                {deletingId === column.id ? "..." : "×"}
              </button>
            </div>
          ))}
          {!calculatedColumns.length ? <span className="mono" style={{ color: "var(--tx1)", fontSize: 11 }}>None</span> : null}
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr auto auto", gap: 6 }}>
            <input
              value={columnName}
              onChange={(event) => setColumnName(event.target.value)}
              placeholder="Column name"
              style={{ height: 28, border: "1px solid var(--bd2)", borderRadius: "var(--r6)", background: "var(--bg2)", padding: "0 8px" }}
            />
            <input
              value={columnFormula}
              onChange={(event) => setColumnFormula(event.target.value)}
              placeholder="Formula (e.g. price * quantity)"
              style={{ height: 28, border: "1px solid var(--bd2)", borderRadius: "var(--r6)", background: "var(--bg2)", padding: "0 8px" }}
            />
            <select
              value={columnType}
              onChange={(event) => setColumnType(event.target.value as "dynamic" | "static")}
              style={{ height: 28, border: "1px solid var(--bd2)", borderRadius: "var(--r6)", background: "var(--bg2)", padding: "0 8px" }}
            >
              <option value="dynamic">dynamic</option>
              <option value="static">static</option>
            </select>
            <button className="btn" onClick={() => void handleAddCalculatedColumn()} disabled={!datasetId || submitting}>
              {submitting ? "Adding..." : "Add"}
            </button>
          </div>
          {columnsError ? <div className="mono" style={{ color: "var(--er)", fontSize: 11 }}>{columnsError}</div> : null}
        </div>
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
