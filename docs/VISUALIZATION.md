# Visualization System (Current)

## Status (March 2026)
The visualization system has been fully overhauled. Charts created by the AI agent are now **ephemeral** (not auto-saved) and can be explicitly saved to a per-user **Visualizations Library**. Saved visualizations can be dragged onto **Canvas** drag-drop dashboards. The old "Charts" tab in the project has been replaced by the new **Canvas** tab.

## Current Frontend Architecture

### AI Agent → Visualizations Library → Canvas
1. **AI agent** (`AIPanel.tsx`) renders inline ephemeral charts using `EChartsRenderer`.
2. User clicks **☁ Save to Visualizations** to persist a chart to the library — calls `POST /api/visualizations/saved`.
3. **VisualizationsSection** (left sidebar, below ArtifactsSection) lists saved visualizations. Items are draggable.
4. **Canvas tab** (in `CanvasPanel.tsx`) opens `CanvasView.tsx` — a plan-gated list of canvas layouts.
5. Opening a canvas loads `CanvasGrid.tsx` (react-grid-layout drop zone). Dragging a visualization item from the sidebar drops it as a tile.
6. **CanvasToolbar.tsx** provides an editable canvas name and Save Layout button (auto-debounced on name changes).

### Key frontend files
| File | Role |
|---|---|
| `src/components/VisualizationsSection.tsx` | Left-sidebar library; drag-to-canvas, preview popover, rename/delete |
| `src/components/CanvasView.tsx` | Canvas list + create flow (plan-limit gated) |
| `src/components/CanvasGrid.tsx` | react-grid-layout drop zone for viz tiles |
| `src/components/CanvasToolbar.tsx` | Editable name, Save Layout, back button |
| `src/components/EChartsRenderer.tsx` | ECharts 5.5.1 wrapper used everywhere |
| `src/components/AIPanel.tsx` | Save to Visualizations inline button |

## Current Backend Stack

### Saved Visualizations — `/api/visualizations/saved`
- **Router**: `backend/app/routers/saved_visualizations.py`
- **Model**: `VisualizationDB` (table `visualizations`) in `backend/app/models_db.py`
- **Not plan-gated** — unlimited saves for all tiers
- CRUD: list, create, get, rename (PATCH), delete

### Canvas Layouts — `/api/canvas`
- **Router**: `backend/app/routers/canvas.py`
- **Model**: `CanvasLayoutDB` (table `canvas_layouts`) in `backend/app/models_db.py`
- **Plan-gated** — limits enforced at `POST /api/canvas`:
  - Free: 2 canvases
  - Professional: 20 canvases
  - Team / Business / Enterprise: Unlimited
- Exceeding limit returns HTTP 403 `{"error": "canvas_limit_reached", ...}`
- `GET /api/canvas/limit-status` returns `{count, limit, can_create, plan}`

### AI Chart Ephemerality
`create_chart` in `backend/app/services/agent/nodes/execute_step.py` now generates a transient `chart_id` (UUID) and returns the `echarts_config` in the SSE `tile_created` payload — it no longer creates a `DashboardTileDB` row. Charts are only persisted when the user explicitly clicks "Save to Visualizations".

## Legacy Backend (still present, not removed)
The V2 dashboards system (`DashboardV2DB`, `DashboardTileDB`, `DashboardsV2Service`) remains intact for any backward-compatible API consumers. It is decoupled from the new canvas flow.

## Removed Legacy Frontend Components
The following legacy files were removed from active frontend code because they were not wired into the current app flow:
- `frontend/src/components/DataVisualizationTab.tsx`
- `frontend/src/components/DataVisualizationTab.css`
- `frontend/src/components/DashboardPanel.tsx`
- `frontend/src/components/ShareAdminPanel.tsx`
- `frontend/src/components/DashboardBuilderPanel.tsx`
- `frontend/src/components/TemplateGalleryPanel.tsx`
- `frontend/src/components/WidgetsPanel.tsx`
- `frontend/src/components/WidgetEditor.tsx`
- `frontend/src/components/WidgetRenderer.tsx`
- `frontend/src/components/SharedDashboardPanel.tsx`

## Dashboard Overhaul (May 2026)

### New chart types
Both the server-side Python builder and the client-side TypeScript mirror now support 15 chart types:

| Type | Builder | Notes |
|---|---|---|
| `bar` | `_build_bar` | Grouped bar |
| `horizontal_bar` | `_build_bar` | Horizontal orientation |
| `line` | `_build_line` | Multi-series line |
| `area` | `_build_line` | Filled area (gradient) |
| `scatter` | `_build_scatter` | XY scatter |
| `pie` | `_build_pie` | Standard pie |
| `donut` | `_build_pie` | `radius: ["40%","70%"]` |
| `heatmap` | `_build_heatmap` | Calendar/matrix heat |
| `waterfall` | `_build_waterfall` | Running-total waterfall |
| `funnel` | `_build_funnel` | Conversion stages, sorted descending |
| `gauge` | `_build_gauge` | Single-KPI dial with threshold colours |
| `treemap` | `_build_treemap` | Proportional area treemap |
| `radar` | `_build_radar` | Spider chart (multi-axis or single) |
| `dual_axis` | `_build_dual_axis` | Bar (left) + line (right) combo |
| `table` | *(envelope)* | Passthrough for tabular display |

The Python dispatcher (`build_echarts_config`) also accepts aliases: `dual-axis`, `combo`.

### `infer_chart_type` heuristics
New keyword patterns added to the auto-inference logic (before the waterfall check):
- `funnel` — keywords: `funnel`, `pipeline`, `conversion`, `drop-off`, `drop off`
- `gauge` — keywords: `gauge`, `dial`, `speedometer`, `kpi`, `single value`, `meter`
- `treemap` — keywords: `treemap`, `tree map`, `hierarchical`, `nested`, `breakdown by size`
- `radar` — keywords: `radar`, `spider`, `spider web`, `radial comparison`, `multi-dimensional`; requires `len(num_cols) >= 2`
- `dual_axis` — keywords: `dual axis`, `dual-axis`, `secondary axis`, `twin axis`, `two axis`, `combo`, `bar and line`; requires `len(num_cols) >= 2`

### DashboardPage new features

**Filter bar** (`DashboardFilterBar.tsx`)
- Persistent dimension filter row above the tile grid
- Supports operators: `=`, `!=`, `contains`, `>`, `<`
- Toggle via `⊟ Filter` button in header; chip-based UI with inline add-filter form
- Filter state (`ActiveFilter[]`) applied to every tile's ECharts config via `applyDashFilters()`; non-matching series dimmed to 8% opacity

**Chart type switcher**
- `⇄` button appears on chart/table tiles in edit mode
- Opens a 15-type picker popover; clicking a type immediately calls `updateDashboardTile` + refreshes the tile

**Auto-refresh**
- Dashboard Settings panel now has an **Auto-refresh interval** selector (Off / 1 / 5 / 15 / 30 / 60 min)
- Stored in `dashboard.theme.refresh_interval_mins`
- A `setInterval` in `DashboardPage` re-fetches all chart and metric tiles on the chosen cadence

### DashboardCanvas — react-grid-layout migration
The workspace Canvas sidebar (`DashboardCanvas.tsx`) now uses `react-grid-layout` instead of the previous absolute-positioning drag system:
- 12-column grid, 60 px row height, 8 px gutters
- Drag via `.canvas-drag-handle` header strip; resize handle at bottom-right
- Layout persisted to `localStorage` key `dh:dashboard:layout:{projectId}`
- Default layout: items placed in 2-column grid, 6×5 cells each
- Tiles are flex-column so charts fill all available vertical space

## Note on Historical Documentation
If you need historical implementation notes for removed tab-era UX, use documents under `docs/archive/`.
