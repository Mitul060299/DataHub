# Onboarding

## Welcome Modal (First Visit)
On your first visit to a workspace, DataHub shows an interactive 4-slide welcome walkthrough:

1. **Feature overview** — four feature cards: Upload Data, Transform with AI, Build Pipelines, and Export & Share.
2. **Data tab tips** — how to upload a file, preview data, and trigger profiling.
3. **Pipeline tab tips** — how to open the Pipeline tab, add steps, and run transformations.
4. **Sample dataset picker** — choose a starter dataset (Customers, Sales Data, Journal Entries, or Employee Records) to load it directly into the workspace.

Progress dots at the top let you jump to any slide. Use **Back** / **Next** to navigate, or click a dot to jump directly. Click **Skip** to close the modal and upload your own file.

## Workspace Layout
The workspace is a three-panel layout:

- **Left panel — Explorer** (always visible): shows Datasets, Artifacts, and Visualizations. Drag the resize handle on the right edge to adjust its width; the size is remembered in `localStorage`.
- **Center panel — Canvas**: a tabbed surface with **Data**, **Pipeline**, **Canvas**, **Schedule**, and **History** tabs.
- **Right panel — AI Agent**: streaming chat panel, always visible except when the **Pipeline** tab is active (see below).

### Pipeline Tab
On the Pipeline tab the AI Agent panel is automatically hidden so the pipeline view has full horizontal width. The tab shows:
- **Left**: visual pipeline graph (`PipelineGraphTab`)
- **Right (300 px)**: applied steps list and pipeline controls (`PipelineSection`)

Switch to any other tab to restore the AI Agent panel.

## Quick Steps
1. Start services (or open the hosted app).
2. On first visit, the welcome modal appears — pick a sample dataset or close and upload your own.
3. Review column stats and profiling results in the **Data** tab.
4. Open the **Pipeline** tab to add transformation steps, or type in the AI Agent panel (e.g. *"remove duplicates"*).
5. Build a dashboard with KPI and visualisation widgets on the **Canvas** tab.

## First-Time Tour
After closing the welcome modal, a step-by-step tooltip tour highlights 8 key features in the workspace:

1. **Data section** — the Datasets list in the Explorer panel
2. **AI Agent header** — the chat input and ＋ Join button
3. **Approve button** — the ✓ Approve & Run button on plan cards
4. **Pipeline tab** — click to open the inline pipeline editor (graph + steps)
5. **Artifacts section** — saved pipeline checkpoints in the Explorer
6. **Canvas tab** — the dashboard builder
7. **Visualizations section** — saved charts in the Explorer
8. **Export button** — export the current dataset or pipeline output

The tour can be re-triggered from the **Getting Started** checklist widget in the bottom-right corner.

## Getting Started Checklist
A collapsible "Getting started" widget in the bottom-right tracks three onboarding milestones:

1. **Upload a dataset** — Drag & drop a CSV/Excel into the Data panel, or press `Ctrl+I` to import.
2. **Run an AI transformation** — Type in the AI Agent on the right, e.g. *"remove duplicates"*.
3. **Explore your history** — Click the git-branch icon tab to see your transformation history.

---

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
- On the **Pipeline** tab, add a step from the steps list on the right and choose from 30+ operation types.
- Or type a plain-English instruction in the **AI Agent** panel (e.g. *"fill null values in revenue with the median"*) and the pipeline steps are rewritten automatically.

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
The AI Agent panel is on the right side of the workspace (hidden automatically when the Pipeline tab is active). Type a request in plain English and the agent will classify your intent, generate an execution plan, and execute it step by step.

**Tips:**
- Press `/` anywhere on the page (not in an input) to instantly focus the AI chat input.
- The agent remembers your conversation history within a session — you can follow up naturally (e.g. “now filter those results”).
- The live step indicator shows “Step N/M: operation” as each step runs so you know what the agent is doing.
- When a plan is shown, review it and click **✓ Approve & Run** to execute, or **✕ Reject** to discard it.
- Click **Copy** on any plan step’s SQL block to copy it to your clipboard.
- Click **■ Stop** at any time to abort the current stream.
- For JOIN or UNION queries, click **＋ Join** in the header to select additional datasets to make available to the agent.
- Query result tables show the first 20 rows; click **Show all** to expand.
- AI responses support Markdown formatting.

## LLM Configuration
- Set `GROQ_API_KEY` in `.env` to enable the AI agent and NL pipeline editing.
- `GROQ_MODEL` — model used for planning, execution, and responses.
- `GROQ_INTENT_MODEL` — model used for intent classification only (a lightweight, faster model).

## RBAC (Scaffold)
- Use /auth/login?username=...&role=editor to get a token for editor actions.
- Send Authorization: Bearer <token> for protected endpoints.
