# Dashboard Migration and Cleanup (Current)

## Summary
The old dashboard frontend surface has been fully removed from active UI code. The product now follows the unified project project model and retains `/visualizations/*` as the canonical backend dashboard API namespace.

## What Was Cleaned Up
### Frontend (removed legacy, unreferenced files)
- `frontend/src/components/DashboardPanel.tsx`
- `frontend/src/components/ShareAdminPanel.tsx`
- `frontend/src/components/DashboardBuilderPanel.tsx`
- `frontend/src/components/TemplateGalleryPanel.tsx`
- `frontend/src/components/WidgetsPanel.tsx`
- `frontend/src/components/WidgetEditor.tsx`
- `frontend/src/components/WidgetRenderer.tsx`
- `frontend/src/components/SharedDashboardPanel.tsx`
- `frontend/src/components/DataVisualizationTab.tsx`
- `frontend/src/components/DataVisualizationTab.css`

### Frontend API Client (removed deprecated helpers)
Removed deprecated `/dashboards` helper methods from `frontend/src/api.ts`:
- `listDashboards`
- `createDashboard`
- `updateDashboard`
- `deleteDashboard`
- `shareDashboard`
- `unshareDashboard`
- `unshareAllDashboards`
- `purgeExpiredDashboards`
- `fetchSharedDashboard`

## Current Canonical Direction
- UI workflow: `frontend/src/App.tsx` -> `CommandRibbon` + `ChatWorkspaceContent`
- Backend visualization APIs: `backend/app/routers/visualizations.py`
- Any future dashboard UI should target `/visualizations/*` only.

## Historical References
Older migration notes and tab-era implementation details should be treated as historical context only; keep those in `docs/archive/`.
