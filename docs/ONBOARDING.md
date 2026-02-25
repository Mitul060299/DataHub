# Onboarding

## Sample Dataset
Use the sample CSV in samples/customers.csv to test uploads and profiling.

## Quick Steps
1. Start services.
2. Upload the sample CSV from the UI.
3. Review profile results in the API or future UI.

## Inline Import
- Use the Inline Import panel to paste CSV text and create a dataset instantly.

## Preview Filters
- Use the Dataset Preview panel to filter and sort rows for quick inspection.

## Export Filters
- Use export controls in the Datasets panel to filter or sort before exporting.

## Column Summary
- Use the Column Summary panel to visualize histogram or top values per column.

## Dashboard Widgets
- Create dashboards and add summary widgets tied to a dataset/column.
- Edit widget title/column or delete widgets from the Widgets panel.
- Use Up/Down controls to reorder widgets.
- Choose Summary or Table widget types.
- Select a dataset per widget when creating or editing.
- Widget titles are required; only Summary and Table types are allowed.

## Postgres Persistence
- Users, workspaces, dashboards, contexts, and dataset metadata are stored in Postgres.
- Run migrations with Alembic when you are ready to manage schema versions.

## LLM Suggestions (Optional)
- Set LLM_PROVIDER=groq and GROQ_API_KEY in .env to enable LLM suggestions.

## RBAC (Scaffold)
- Use /auth/login?username=...&role=editor to get a token for editor actions.
- Send Authorization: Bearer <token> for protected endpoints.
