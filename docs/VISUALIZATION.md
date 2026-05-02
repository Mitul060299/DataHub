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

## Note on Historical Documentation
If you need historical implementation notes for removed tab-era UX, use documents under `docs/archive/`.
