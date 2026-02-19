# Dashboard Migration Guide

## Overview
The old simplified dashboard system has been **deprecated** and replaced with a comprehensive BI dashboard builder in the **Visualization tab**.

## What Changed?

### Old System (Deprecated)
- **Routes**: `/dashboards`, `/widgets`
- **Models**: `Dashboard` (single table with JSONB widgets)
- **Components**: `DashboardPanel`, `ShareAdminPanel`
- **Features**: Basic widget storage, simple sharing

### New System (Active)
- **Routes**: `/visualizations/*`
- **Models**: `VizDashboardDB`, `VizDashboardWidgetDB`, `VizDashboardThemeDB`, `VizDashboardFilterDB`
- **Component**: `DataVisualizationTab`
- **Features**: 
  - 7+ chart types (Bar, Line, Pie, Scatter, Area, KPI, Table)
  - Drag-and-drop grid layout
  - Auto-refresh
  - Themes and branding
  - Advanced sharing
  - Smart column suggestions
  - Aggregations (sum, avg, count, min, max)

## Migration Steps

### For Users
1. Navigate to the **Visualization** tab (appears after Transform tab)
2. Click "New Dashboard" to create a dashboard
3. Use "Add Widget" to add charts
4. Configure chart type, dataset, and columns
5. Drag widgets to arrange them
6. Use "Share" to generate share links

### For Developers

#### Frontend Migration
**OLD**:
```typescript
import { listDashboards, createDashboard } from '../api';

// List dashboards
const dashboards = await listDashboards();

// Create dashboard
const dashboard = await createDashboard('My Dashboard');
```

**NEW**:
```typescript
import { api } from '../api';

// List dashboards
const response = await api.get('/visualizations/dashboards');
const dashboards = response.data;

// Create dashboard
const dashboard = await api.post('/visualizations/dashboards', {
  name: 'My Dashboard',
  workspace_id: 1,
});
```

#### Backend Migration
**OLD**:
```python
from ..models_db import Dashboard
from ..routers import dashboards

# Query old dashboard
dashboard = db.query(Dashboard).first()
```

**NEW**:
```python
from ..models_db import VizDashboardDB
from ..routers import visualizations

# Query new dashboard
dashboard = db.query(VizDashboardDB).first()
```

## API Comparison

### Old Dashboard Endpoints (Deprecated)
- `POST /dashboards` - Create dashboard
- `GET /dashboards` - List dashboards
- `GET /dashboards/{id}` - Get dashboard
- `PUT /dashboards/{id}` - Update dashboard
- `DELETE /dashboards/{id}` - Delete dashboard
- `POST /dashboards/{id}/share` - Share dashboard

### New Visualization Endpoints (Active)
- `POST /visualizations/dashboards` - Create dashboard
- `GET /visualizations/dashboards` - List dashboards
- `GET /visualizations/dashboards/{id}` - Get dashboard
- `PUT /visualizations/dashboards/{id}` - Update dashboard
- `DELETE /visualizations/dashboards/{id}` - Delete dashboard
- `POST /visualizations/dashboards/{id}/share` - Share dashboard
- `POST /visualizations/widgets` - Create widget
- `PUT /visualizations/widgets/{id}` - Update widget
- `DELETE /visualizations/widgets/{id}` - Delete widget
- `POST /visualizations/chart-data/{dataset_id}` - Get chart data
- `GET /visualizations/suggest-columns/{dataset_id}` - Get column suggestions
- `POST /visualizations/kpi/{dataset_id}` - Calculate KPI
- `POST /visualizations/themes` - Create theme
- `GET /visualizations/themes` - List themes

## Data Migration

### Old Dashboard Structure
```json
{
  "id": "uuid",
  "name": "Dashboard Name",
  "widgets": [
    {
      "id": "uuid",
      "type": "summary",
      "title": "Widget Title",
      "config": {...}
    }
  ]
}
```

### New Dashboard Structure
```json
{
  "id": 1,
  "name": "Dashboard Name",
  "description": "Dashboard description",
  "workspace_id": 1,
  "dataset_id": 123,
  "theme_id": 1,
  "layout": {...},
  "refresh_interval": 30,
  "widgets": [
    {
      "id": 1,
      "dashboard_id": 1,
      "widget_type": "bar",
      "title": "Sales by Category",
      "dataset_id": 123,
      "config": {
        "chart_type": "bar",
        "x_axis": "category",
        "y_axis": "sales",
        "aggregation": "sum"
      },
      "position": {"x": 0, "y": 0, "w": 6, "h": 4}
    }
  ]
}
```

## Backwards Compatibility

The old system is **deprecated but not removed**:
- Old API endpoints still work but are not maintained
- Old database tables (`dashboards` table) remain for existing data
- Old components are marked with `@deprecated` JSDoc
- New features are only added to the visualization system

## Recommendations

1. **For New Projects**: Use the new Visualization tab exclusively
2. **For Existing Projects**: 
   - Plan migration to new system
   - Test visualization features with sample data
   - Gradually move dashboards to new system
3. **Do Not Mix**: Don't use both systems simultaneously to avoid confusion

## Support

- See [VISUALIZATION.md](./VISUALIZATION.md) for complete documentation
- Old dashboard/widget routers have been fully removed from the codebase
- Contact dev team for migration assistance

## Timeline

- **v0.1.0** - Old dashboard system (active)
- **v0.2.0** - New visualization tab added, old system deprecated
- **v0.3.0** (planned) - Old system removal (with migration tool)

## Files Removed / Deprecated

### Backend (Removed)
- ✅ `backend/app/routers/dashboards.py` - Removed; use `/visualizations` API instead
- ✅ `backend/app/routers/widgets.py` - Removed; use `/visualizations` API instead
- `backend/app/models_db.py::Dashboard` - Deprecated; use `VizDashboardDB` instead

### Frontend
- `frontend/src/components/DashboardPanel.tsx` - Use `DataVisualizationTab.tsx` instead
- `frontend/src/components/ShareAdminPanel.tsx` - Use Visualization tab sharing instead
- `frontend/src/api.ts` - Functions marked with "DEPRECATED: Old Dashboard API" comment

## Benefits of New System

### For End Users
- More chart types (7+ vs 3)
- Drag-and-drop layout builder
- Auto-refresh dashboards
- Professional themes
- Better sharing options
- KPI cards with trends
- Smart column suggestions

### For Developers
- Proper relational database design
- Cleaner API structure
- Better separation of concerns
- Easier to extend
- TypeScript support
- Comprehensive documentation

## Questions?

Check the [VISUALIZATION.md](./VISUALIZATION.md) guide or review the implementation in:
- Frontend: `frontend/src/components/DataVisualizationTab.tsx`
- Backend: `backend/app/routers/visualizations.py`
- Service: `backend/app/services/visualization.py`
