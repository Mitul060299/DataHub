# Visualization System (Current)

## Status (February 2026)
Visualization is supported at the backend API and data-model layer, while the frontend now uses the unified project workspace pattern (Command Ribbon + Chat/Data/Steps layout) instead of the legacy dedicated visualization tab.

## Current Frontend Experience
- Users work inside the project workspace flow in `frontend/src/App.tsx`.
- Project execution surface is rendered by `frontend/src/components/ChatWorkspaceContent.tsx`.
- Data import and action entry points are provided through `frontend/src/components/CommandRibbon.tsx`.
- There is no active dedicated `DataVisualizationTab` component in the current UI.

## Current Backend Visualization Stack
- Router: `backend/app/routers/visualizations.py`
- Models: visualization entities in `backend/app/models_db.py`
- Service: `backend/app/services/visualization.py`

The canonical API namespace is `/visualizations/*` for dashboard/widget/chart/KPI/theme operations.

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
