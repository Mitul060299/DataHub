import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { IconFilter } from "./Icons";

type SortDirection = "asc" | "desc";

/** Sentinel stored in columnFilters for null / undefined / "" cells */
const BLANK_KEY = "__blank__";
const BLANK_LABEL = "(Blank)";

interface DataTableProps {
  loading: boolean;
  rows: Record<string, unknown>[];
  columns: string[];
  stepCount: number;
  lastAction: string;
  /**
   * Other datasets currently held in lane HUD. When provided, clicking a cell
   * shows a popover that includes "Drill to <dataset> where <col> = <value>"
   * actions for each lane. The handler is expected to switch the active
   * dataset and dispatch a filter prompt to the AI chat.
   */
  otherLanes?: { id: string; name: string }[];
  onDrillTo?: (datasetId: string, column: string, value: string) => void;
}

const statusColor: Record<string, string> = {
  Delivered: "var(--gr)",
  Processing: "var(--yw)",
  Shipped: "var(--ac)",
};

export function DataTable({ loading, rows, columns, stepCount, lastAction, otherLanes, onDrillTo }: DataTableProps) {
  // ── sort ────────────────────────────────────────────────────────────────────
  const [sortKey, setSortKey] = useState<string>("");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  // ── column checkbox filters ───────────────────────────────────────────────
  // absent key = no filter (all shown); string[] = only those values included
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({});
  const [openFilterCol, setOpenFilterCol] = useState<string | null>(null);
  const [filterSearch, setFilterSearch] = useState("");
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });



  // ── refs ─────────────────────────────────────────────────────────────────
  const filterButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!openFilterCol) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (dropdownRef.current?.contains(target)) return;
      const onBtn = Object.values(filterButtonRefs.current).some((btn) => btn?.contains(target));
      if (!onBtn) setOpenFilterCol(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [openFilterCol]);

  // Reset column filters when the column set changes (new dataset / transform)
  useEffect(() => {
    setColumnFilters({});
    setOpenFilterCol(null);
  }, [columns]);

  // Unique values per column — drives checkbox list in the dropdown
  const uniqueValuesMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const col of columns) {
      const seen = new Set<string>();
      for (const row of rows) {
        const v = row[col];
        seen.add(v === null || v === undefined || v === "" ? BLANK_KEY : String(v));
      }
      map[col] = Array.from(seen).sort((a, b) => {
        if (a === BLANK_KEY) return 1;  // blanks at the bottom
        if (b === BLANK_KEY) return -1;
        return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
      });
    }
    return map;
  }, [rows, columns]);

  const filteredRows = useMemo(() => {
    let nextRows = rows;
    // Per-column checkbox filters
    for (const [col, selected] of Object.entries(columnFilters)) {
      const selectedSet = new Set(selected);
      nextRows = nextRows.filter((row) => {
        const v = row[col];
        const key = v === null || v === undefined || v === "" ? BLANK_KEY : String(v);
        return selectedSet.has(key);
      });
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
  }, [rows, columnFilters, sortKey, sortDirection]);

  const handleSort = (column: string) => {
    if (sortKey === column) {
      setSortDirection((dir) => (dir === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(column);
    setSortDirection("asc");
  };

  // ── column filter helpers ──────────────────────────────────────────────────
  const activeFilterCount = Object.keys(columnFilters).length;

  const isValueChecked = (col: string, val: string): boolean => {
    const selected = columnFilters[col];
    if (!selected) return true; // no filter → all checked
    return selected.includes(val);
  };

  const isAllSelected = (col: string) => !columnFilters[col];

  const openFilter = (col: string) => {
    if (openFilterCol === col) { setOpenFilterCol(null); return; }
    const btn = filterButtonRefs.current[col];
    if (btn) {
      const rect = btn.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 4, left: rect.left });
    }
    setFilterSearch("");
    setOpenFilterCol(col);
  };

  const toggleValue = (col: string, val: string) => {
    setColumnFilters((prev) => {
      const allVals = uniqueValuesMap[col] ?? [];
      const currentChecked = new Set(prev[col] ?? allVals);
      if (currentChecked.has(val)) currentChecked.delete(val);
      else currentChecked.add(val);
      const next = { ...prev };
      if (currentChecked.size === allVals.length) {
        delete next[col]; // all selected → remove filter entirely
      } else {
        next[col] = Array.from(currentChecked);
      }
      return next;
    });
  };

  const clearColumnFilter = (col: string) => {
    setColumnFilters((prev) => { const n = { ...prev }; delete n[col]; return n; });
  };

  const clearAllFilters = () => { setColumnFilters({}); setOpenFilterCol(null); };

  // ── cell-click popover (drill-through / quick filter / copy) ───────────
  const [cellPopover, setCellPopover] = useState<{
    column: string;
    value: string;
    top: number;
    left: number;
  } | null>(null);
  const cellPopoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!cellPopover) return;
    const handler = (e: MouseEvent) => {
      if (cellPopoverRef.current?.contains(e.target as Node)) return;
      setCellPopover(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [cellPopover]);

  const handleCellClick = (e: ReactMouseEvent<HTMLTableCellElement>, column: string, value: unknown) => {
    // Only show popover for non-blank, primitive values
    if (value === null || value === undefined || value === "") {
      setCellPopover(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    setCellPopover({
      column,
      value: String(value),
      top: rect.bottom + 4,
      left: rect.left,
    });
  };

  const applyFilterHere = () => {
    if (!cellPopover) return;
    const { column, value } = cellPopover;
    setColumnFilters((prev) => ({ ...prev, [column]: [value] }));
    setCellPopover(null);
  };

  const copyCellValue = () => {
    if (!cellPopover) return;
    void navigator.clipboard?.writeText(cellPopover.value).catch(() => undefined);
    setCellPopover(null);
  };

  const triggerDrillTo = (datasetId: string) => {
    if (!cellPopover || !onDrillTo) return;
    onDrillTo(datasetId, cellPopover.column, cellPopover.value);
    setCellPopover(null);
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
    <div className="panel" style={{ margin: 8, display: "flex", flexDirection: "column", minHeight: 0, height: "calc(100% - 16px)" }}>
      {activeFilterCount > 0 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", padding: "4px 8px", borderBottom: "1px solid var(--bd)", gap: 6, flexShrink: 0 }}>
          <span className="mono" style={{ fontSize: 11, color: "var(--tx2)" }}>{activeFilterCount} filter{activeFilterCount > 1 ? "s" : ""} active</span>
          <button
            className="btn"
            style={{ height: 24, display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap", color: "var(--ac)", border: "1px solid var(--ac)", padding: "0 8px" }}
            onClick={clearAllFilters}
            title="Clear all column filters"
          >
            <IconFilter size={11} />
            <span className="mono" style={{ fontSize: 11 }}>Clear all</span>
          </button>
        </div>
      )}

      <div style={{ flex: 1, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th className="mono" style={{ width: 50, textAlign: "right", color: "var(--tx1)", borderBottom: "1px solid var(--bd)", padding: "8px 10px" }}>#</th>
              {columns.map((column) => {
                const hasFilter = !!columnFilters[column];
                return (
                  <th
                    key={column}
                    className="mono"
                    style={{ textAlign: "left", borderBottom: "1px solid var(--bd)", padding: "6px 10px", whiteSpace: "nowrap" }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span
                        onClick={() => handleSort(column)}
                        style={{ cursor: "pointer", flex: 1, minWidth: 0 }}
                      >
                        {column} {sortKey === column ? (sortDirection === "asc" ? "↑" : "↓") : ""}
                      </span>
                      <button
                        ref={(el) => { filterButtonRefs.current[column] = el; }}
                        onClick={(e) => { e.stopPropagation(); openFilter(column); }}
                        style={{
                          background: hasFilter ? "color-mix(in srgb, var(--ac) 15%, transparent)" : "none",
                          border: hasFilter ? "1px solid color-mix(in srgb, var(--ac) 40%, transparent)" : "none",
                          cursor: "pointer",
                          padding: "2px 4px",
                          borderRadius: 3,
                          color: hasFilter ? "var(--ac)" : "var(--tx1)",
                          opacity: hasFilter ? 1 : 0.4,
                          flexShrink: 0,
                          display: "flex",
                          alignItems: "center",
                        }}
                        title={hasFilter ? `Filtering: ${columnFilters[column]?.length} value(s) — click to edit` : `Filter by ${column}`}
                      >
                        <IconFilter size={11} />
                      </button>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td
                  colSpan={(columns ?? []).length + 1}
                  style={{ padding: "32px 0", textAlign: "center", color: "var(--tx2)", fontSize: 13, fontStyle: "italic" }}
                >
                  {rows.length === 0 ? "No data loaded" : "No rows match your filters"}
                </td>
              </tr>
            ) : filteredRows.map((row, index) => {
              // Prefer a stable unique id; fall back to index only if unavailable
              const rowKey = (row as Record<string, unknown>).__id ?? (row as Record<string, unknown>).id ?? `row-${index}`;
              return (
              <tr key={String(rowKey)} style={{ borderBottom: "1px solid var(--bd)", transition: "background 0.1s ease" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(91,106,240,0.04)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <td className="mono" style={{ textAlign: "right", color: "var(--tx1)", padding: "7px 10px" }}>{index + 1}</td>
                {columns.map((column) => {
                  const value = row[column];
                  const text = value === null || value === undefined || value === "" ? "—" : String(value);
                  const isNumber = typeof value === "number";
                  const status = typeof value === "string" && statusColor[value] ? value : null;
                  const isClickable = value !== null && value !== undefined && value !== "";
                  return (
                    <td
                      key={`${String(rowKey)}-${column}`}
                      className="mono"
                      onClick={isClickable ? (e) => handleCellClick(e, column, value) : undefined}
                      style={{
                        padding: "7px 10px",
                        color: status ? statusColor[status] : isNumber ? "#7dd3fc" : value === null || value === undefined || value === "" ? "var(--tx2)" : "var(--tx0)",
                        fontStyle: value === null || value === undefined || value === "" ? "italic" : "normal",
                        cursor: isClickable ? "pointer" : "default",
                      }}
                    >
                      {text}
                    </td>
                  );
                })}
              </tr>
            );})}
          </tbody>
        </table>
      </div>

      <div className="mono" style={{ borderTop: "1px solid var(--bd)", padding: "8px 12px", color: "var(--tx1)", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span>{filteredRows.length}{activeFilterCount > 0 ? ` of ${rows.length}` : ""} rows · {(columns ?? []).length} cols</span>
        <span style={{ color: "var(--tx2)" }}>{stepCount} steps · {lastAction}</span>
      </div>

      {/* Column filter dropdown — position:fixed so it escapes the scroll container */}
      {openFilterCol && (() => {
        const col = openFilterCol;
        const allValues = uniqueValuesMap[col] ?? [];
        const allSelected = isAllSelected(col);
        const partial = !allSelected && (columnFilters[col]?.length ?? 0) > 0;
        const lowerSearch = filterSearch.toLowerCase();
        const visibleValues = lowerSearch
          ? allValues.filter((v) => (v === BLANK_KEY ? BLANK_LABEL : v).toLowerCase().includes(lowerSearch))
          : allValues;
        return (
          <div
            ref={dropdownRef}
            style={{
              position: "fixed",
              top: dropdownPos.top,
              left: dropdownPos.left,
              width: 240,
              background: "var(--bg)",
              border: "1px solid var(--bd2)",
              borderRadius: "var(--r6)",
              boxShadow: "0 4px 20px rgba(0,0,0,0.35)",
              zIndex: 9999,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            {/* Search within values */}
            <div style={{ padding: "8px 8px 4px" }}>
              <input
                autoFocus
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                placeholder="Search values…"
                style={{
                  width: "100%",
                  height: 28,
                  border: "1px solid var(--bd2)",
                  borderRadius: "var(--r6)",
                  background: "var(--bg2)",
                  color: "var(--tx0)",
                  padding: "0 8px",
                  boxSizing: "border-box",
                }}
              />
            </div>

            {/* Select All */}
            <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderBottom: "1px solid var(--bd)", cursor: "pointer", userSelect: "none" }}>
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => { if (el) el.indeterminate = partial; }}
                onChange={() => { if (!allSelected) clearColumnFilter(col); }}
              />
              <span className="mono" style={{ fontSize: 12, fontWeight: 600 }}>(Select All)</span>
              {!allSelected && (
                <span className="mono" style={{ fontSize: 11, color: "var(--tx1)", marginLeft: "auto" }}>
                  {columnFilters[col]?.length ?? 0} / {allValues.length}
                </span>
              )}
            </label>

            {/* Value list */}
            <div style={{ maxHeight: 220, overflowY: "auto" }}>
              {visibleValues.length === 0 ? (
                <div style={{ padding: 10, color: "var(--tx1)", fontSize: 12, fontStyle: "italic" }}>No values found</div>
              ) : visibleValues.map((val) => (
                <label
                  key={val}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 10px", cursor: "pointer", userSelect: "none" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg2)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ""; }}
                >
                  <input
                    type="checkbox"
                    checked={isValueChecked(col, val)}
                    onChange={() => toggleValue(col, val)}
                  />
                  <span
                    className="mono"
                    style={{
                      fontSize: 12,
                      color: val === BLANK_KEY ? "var(--tx1)" : "var(--tx0)",
                      fontStyle: val === BLANK_KEY ? "italic" : "normal",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {val === BLANK_KEY ? BLANK_LABEL : val}
                  </span>
                </label>
              ))}
            </div>

            {/* Footer */}
            <div style={{ padding: 8, borderTop: "1px solid var(--bd)", display: "flex", gap: 6 }}>
              <button className="btn" style={{ flex: 1 }} onClick={() => clearColumnFilter(col)}>Clear</button>
              <button
                className="btn"
                style={{ flex: 1, background: "var(--ac)", color: "#fff", border: "none" }}
                onClick={() => setOpenFilterCol(null)}
              >
                OK
              </button>
            </div>
          </div>
        );
      })()}

      {/* Cell click popover — quick filter / copy / drill-to-other-dataset */}
      {cellPopover && (
        <div
          ref={cellPopoverRef}
          role="menu"
          style={{
            position: "fixed",
            top: cellPopover.top,
            left: cellPopover.left,
            minWidth: 240,
            maxWidth: 320,
            background: "var(--bg)",
            border: "1px solid var(--bd2)",
            borderRadius: "var(--r6)",
            boxShadow: "0 4px 20px rgba(0,0,0,0.35)",
            zIndex: 9999,
            padding: 4,
          }}
        >
          <div
            className="mono"
            style={{
              padding: "6px 10px",
              fontSize: 10,
              color: "var(--tx2)",
              borderBottom: "1px solid var(--bd)",
              marginBottom: 4,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={`${cellPopover.column} = ${cellPopover.value}`}
          >
            <strong style={{ color: "var(--tx0)" }}>{cellPopover.column}</strong> = {cellPopover.value}
          </div>
          <button
            className="btn"
            onClick={applyFilterHere}
            style={{ display: "block", width: "100%", textAlign: "left", padding: "6px 10px", background: "none", border: "none", color: "var(--tx0)", cursor: "pointer", fontSize: 12 }}
          >
            Filter this column to <strong>{cellPopover.value.length > 24 ? cellPopover.value.slice(0, 24) + "…" : cellPopover.value}</strong>
          </button>
          <button
            className="btn"
            onClick={copyCellValue}
            style={{ display: "block", width: "100%", textAlign: "left", padding: "6px 10px", background: "none", border: "none", color: "var(--tx0)", cursor: "pointer", fontSize: 12 }}
          >
            Copy value
          </button>
          {otherLanes && otherLanes.length > 0 && onDrillTo && (
            <>
              <div style={{ borderTop: "1px solid var(--bd)", margin: "4px 0" }} />
              <div className="mono" style={{ padding: "4px 10px", fontSize: 9, color: "var(--tx2)", textTransform: "uppercase", letterSpacing: 0.5 }}>
                Drill to another dataset
              </div>
              {otherLanes.map((lane) => (
                <button
                  key={lane.id}
                  className="btn"
                  onClick={() => triggerDrillTo(lane.id)}
                  style={{ display: "block", width: "100%", textAlign: "left", padding: "6px 10px", background: "none", border: "none", color: "var(--ac)", cursor: "pointer", fontSize: 12 }}
                  title={`Switch to ${lane.name} and filter ${cellPopover.column} = ${cellPopover.value}`}
                >
                  → {lane.name}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
