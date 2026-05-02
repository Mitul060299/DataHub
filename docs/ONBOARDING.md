# Onboarding

## Sample Dataset
Use the sample CSV in samples/customers.csv to test uploads and profiling.

## Quick Steps
1. Start services.
2. Upload the sample CSV from the UI.
3. Review profile results in the Dataset page.
4. Run a pipeline to clean and transform the data.
5. Build a dashboard with KPI and visualisation widgets.

## Uploading a CSV
- Delimiters are **auto-detected** (comma, tab, semicolon, pipe, colon) — no manual selection required.
- Non-UTF-8 files are re-encoded automatically.

## Uploading Excel (Multi-Sheet)
1. Click **Upload** and select your `.xlsx` / `.xls` file.
2. If the file contains multiple sheets the UI will prompt you to choose one.
3. Alternatively, `POST /import/excel-sheets` with `file` form field to retrieve sheet names programmatically, then `POST /import/upload` with `file` + `sheet` fields.

## Inline Import
- Use the Inline Import panel to paste CSV text and create a dataset instantly.

## Pipeline Operations (30+)
- Open the Pipeline Builder, add a step, and choose from 30+ operation types.
- Or use the **AI edit** panel: type a plain-English instruction like *"fill null values in revenue with the median"* and the pipeline steps are rewritten automatically.

## Schema Comparison
- On the Datasets page, select two datasets and click **Compare Schemas** to see matching and mismatched columns with fuzzy suggestions.

## Preview Filters
- Use the Dataset Preview panel to filter and sort rows for quick inspection.

## Export Filters
- Use export controls in the Datasets panel to filter or sort before exporting.

## Column Summary
- Use the Column Summary panel to visualize histogram or top values per column.

## Dashboard Widgets
- Create dashboards and add summary widgets tied to a dataset/column.
- **KPI tiles**: connect to a dataset column and choose SUM / COUNT / AVG / MIN / MAX.
- **Slicer tiles**: connect to a dataset column to add an interactive filter that cross-filters other tiles.
- Edit widget title/column or delete widgets from the Widgets panel.
- Use Up/Down controls to reorder widgets.
- Choose Summary or Table widget types.
- Select a dataset per widget when creating or editing.
- Widget titles are required; only Summary and Table types are allowed.

## Postgres Persistence
- Users, projects, dashboards, contexts, and dataset metadata are stored in Postgres.
- Run migrations with Alembic when you are ready to manage schema versions.

## AI Chat Agent
The AI Agent panel is available on every dataset page. Type a request in plain English and the agent will classify your intent, generate an execution plan, and execute it step by step.

**Tips:**
- Press `/` anywhere on the page (not in an input) to instantly focus the AI chat input.
- The agent remembers your conversation history within a session — you can follow up naturally (e.g. “now filter those results”).
- The live step indicator shows “Step N/M: operation” as each step runs so you know what the agent is doing.
- When a plan is shown, review it and click **✓ Approve & Run** to execute, or **✕ Reject** to discard it.
- Click **Copy** on any plan step’s SQL block to copy it to your clipboard.
- Click **■ Stop** at any time to abort the current stream.
- For JOIN or UNION queries, click **‚Äú Join** in the header to select additional datasets to make available to the agent.
- Query result tables show the first 20 rows; click **Show all** to expand.
- AI responses support Markdown formatting.

## LLM Configuration
- Set `GROQ_API_KEY` in `.env` to enable the AI agent and NL pipeline editing.
- `GROQ_MODEL` — model used for planning, execution, and responses.
- `GROQ_INTENT_MODEL` — model used for intent classification only (a lightweight, faster model).

## RBAC (Scaffold)
- Use /auth/login?username=...&role=editor to get a token for editor actions.
- Send Authorization: Bearer <token> for protected endpoints.
