import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import "./DocsPage.css";

// ── Types ────────────────────────────────────────────────────
interface Page {
  id: string;
  label: string;
}

interface Section {
  label: string;
  pages: Page[];
}

// ── Sidebar structure ─────────────────────────────────────────
const SECTIONS: Section[] = [
  {
    label: "GETTING STARTED",
    pages: [
      { id: "welcome", label: "Welcome to DataHub" },
      { id: "quickstart", label: "Quick Start" },
      { id: "concepts", label: "Key Concepts" },
    ],
  },
  {
    label: "CORE FEATURES",
    pages: [
      { id: "projects", label: "Projects" },
      { id: "pipelines", label: "Pipelines" },
      { id: "ai-agent", label: "AI Agent" },
      { id: "data-ops", label: "AI Data Operations" },
      { id: "artifacts", label: "Artifacts" },
      { id: "canvases", label: "Canvases" },
      { id: "visualizations", label: "Visualizations Library" },
    ],
  },
  {
    label: "HOW TO GUIDES",
    pages: [
      { id: "guide-start", label: "Create your first project" },
      { id: "guide-upload", label: "Upload a file" },
      { id: "guide-database", label: "Connect a database" },
      { id: "guide-pipeline", label: "Build a pipeline" },
      { id: "guide-schedule", label: "Schedule a pipeline" },
      { id: "guide-dashboard", label: "Build a dashboard" },
      { id: "guide-invite", label: "Invite team members" },
      { id: "guide-export", label: "Export & share results" },
    ],
  },
  {
    label: "REFERENCE",
    pages: [
      { id: "faq", label: "FAQ" },
      { id: "limits", label: "Plan limits" },
      { id: "formats", label: "Supported file formats" },
      { id: "shortcuts", label: "Keyboard shortcuts" },
    ],
  },
  {
    label: "LEGAL",
    pages: [
      { id: "legal-terms", label: "Terms of Service" },
      { id: "legal-privacy", label: "Privacy Policy" },
    ],
  },
];

const FLAT_PAGES: Page[] = SECTIONS.flatMap((s) => s.pages);

// ── Content components ─────────────────────────────────────────

function Welcome() {
  return (
    <article className="docs-article">
      <h1>Welcome to DataHub</h1>
      <p className="docs-lead">
        DataHub is an AI-powered data platform that lets you upload, transform, analyse, and visualise your data — without writing a single line of
        SQL or code.
      </p>
      <h2>What you can do with DataHub</h2>
      <ul>
        <li>
          <strong>Upload any file</strong> — CSV, Excel, Parquet, JSON — and start querying it in seconds.
        </li>
        <li>
          <strong>Build pipelines</strong> — chain AI-guided steps (filter, join, summarise, enrich) that run automatically.
        </li>
        <li>
          <strong>Create dashboards</strong> — drag-and-drop charts, tables, and KPI cards powered by your live data.
        </li>
        <li>
          <strong>Schedule & automate</strong> — run pipelines on a cron schedule and keep your dashboards always fresh.
        </li>
        <li>
          <strong>Smart AI agent</strong> — the AI understands plain English, auto-detects table names and join keys, and always shows a step-by-step plan you can <strong>Approve</strong>, <strong>Modify</strong>, or <strong>Reject</strong> before anything runs.
        </li>
        <li>
          <strong>Collaborate</strong> — invite teammates, share dashboards publicly or securely.
        </li>
      </ul>
      <div className="docs-callout docs-callout--info">
        <strong>New here?</strong> Head to <em>Quick Start</em> for a five-minute walkthrough from sign-up to your first insight.
      </div>
      <h2>How these docs are organised</h2>
      <ul>
        <li>
          <strong>Getting Started</strong> — sign up, create a project, understand the core model.
        </li>
        <li>
          <strong>Core Features</strong> — deep-dives into Projects, Pipelines, Artifacts, and Dashboards.
        </li>
        <li>
          <strong>How To Guides</strong> — step-by-step walkthroughs for common tasks.
        </li>
        <li>
          <strong>Reference</strong> — plan limits, supported formats, shortcuts, and FAQ.
        </li>
      </ul>
    </article>
  );
}

function QuickStart() {
  return (
    <article className="docs-article">
      <h1>Quick Start</h1>
      <p className="docs-lead">Go from zero to your first insight in under five minutes.</p>

      <div className="docs-step">
        <div className="docs-step__number">1</div>
        <div className="docs-step__body">
          <h3>Create an account</h3>
          <p>
            Visit <a href="https://datahub.org.in" target="_blank" rel="noreferrer">datahub.org.in</a> and click <strong>Get started free</strong>. Sign
            up with Google or email — no credit card required.
          </p>
        </div>
      </div>

      <div className="docs-step">
        <div className="docs-step__number">2</div>
        <div className="docs-step__body">
          <h3>Create a project</h3>
          <p>
            From your workspace, click <strong>New project</strong>. Give it a name — this is the container that holds your data sources, pipelines,
            and dashboards.
          </p>
        </div>
      </div>

      <div className="docs-step">
        <div className="docs-step__number">3</div>
        <div className="docs-step__body">
          <h3>Upload a file</h3>
          <p>
            Inside your project, click <strong>Add data source → Upload file</strong>. Drag in a CSV or Excel file (up to 50 MB on the Free plan). DataHub
            will parse and preview it instantly.
          </p>
        </div>
      </div>

      <div className="docs-step">
        <div className="docs-step__number">4</div>
        <div className="docs-step__body">
          <h3>Ask the AI a question</h3>
          <p>
            In the AI panel, type a question like <em>"Show me total revenue by month"</em>. The AI classifies your intent, then generates an execution plan showing each step and estimated row counts.
          </p>
          <p>
            If your request needs more context, the AI replies with a single clarifying question — shown with a purple <strong>❓ NEEDS YOUR INPUT</strong> badge. Type your answer and press <kbd>Enter</kbd> to continue.
          </p>
          <p>
            Once the plan appears, click <strong>✓ Approve</strong> to run it, <strong>✎ Modify</strong> to tweak a step first, or <strong>✕ Reject</strong> to cancel.
          </p>
        </div>
      </div>

      <div className="docs-step">
        <div className="docs-step__number">5</div>
        <div className="docs-step__body">
          <h3>Pin to a dashboard</h3>
          <p>
            Click <strong>Add to dashboard</strong> on any result to pin it as a chart or table card. You now have a live dashboard driven by your data.
          </p>
        </div>
      </div>

      <div className="docs-callout docs-callout--success">
        That's it — your first project, data source, pipeline, and dashboard are live. Read on to learn what each of those concepts means in depth.
      </div>
    </article>
  );
}

function KeyConcepts() {
  return (
    <article className="docs-article">
      <h1>Key Concepts</h1>
      <p className="docs-lead">Four building blocks underpin everything in DataHub. Learn these and you'll understand how every feature fits together.</p>
      <dl className="docs-glossary">
        <div className="docs-glossary__item">
          <dt>Workspace</dt>
          <dd>
            Your top-level account. A workspace has a plan (Free, Pro, Team…), a set of members, and a billing subscription. All projects live inside one
            workspace.
          </dd>
        </div>
        <div className="docs-glossary__item">
          <dt>Project</dt>
          <dd>
            An isolated container for a single analytical workload — e.g. "Q1 Sales Analysis". A project holds data sources, pipelines, artifacts, and
            dashboards. Projects on the Free plan are limited to 2; all paid plans get unlimited projects.
          </dd>
        </div>
        <div className="docs-glossary__item">
          <dt>Pipeline</dt>
          <dd>
            A sequence of AI-guided data transformation steps (filter, join, aggregate, enrich, validate, summarise…). Each step is generated by the AI from
            a plain-English instruction and executed against your data in real time. Pipelines can be run on demand or scheduled.
          </dd>
        </div>
        <div className="docs-glossary__item">
          <dt>Artifact</dt>
          <dd>
            The output of a pipeline step — a table, a CSV download, a Parquet file stored in S3. Artifacts are versioned and can be used as inputs to
            downstream steps or pinned to a dashboard.
          </dd>
        </div>
        <div className="docs-glossary__item">
          <dt>Dashboard</dt>
          <dd>
            A drag-and-drop canvas of chart, table, and KPI cards. Each card is backed by an artifact or a live SQL query. Dashboards can be shared publicly
            (via link) or restricted to workspace members.
          </dd>
        </div>
        <div className="docs-glossary__item">
          <dt>Data source</dt>
          <dd>
            A registered file or database connection that pipelines can read from. Supported sources include CSV, Excel, Parquet, JSON, and
            PostgreSQL, MySQL, SQLite, MSSQL, Oracle (Professional+), Snowflake, Redshift, BigQuery (Team+).
          </dd>
        </div>
        <div className="docs-glossary__item">
          <dt>AI message</dt>
          <dd>
            Each time you send a prompt to the AI assistant (e.g. "filter rows where country = US"), that counts as one AI message. Monthly limits vary by
            plan; see Plan limits for details.
          </dd>
        </div>
        <div className="docs-glossary__item">
          <dt>Execution plan</dt>
          <dd>
            Before making any changes, the AI always presents a plan: a numbered list of steps with descriptions and estimated row counts. Review it, then <strong>Approve</strong> to run, <strong>Modify</strong> to change specific steps, or <strong>Reject</strong> to cancel.
          </dd>
        </div>
        <div className="docs-glossary__item">
          <dt>Clarification step</dt>
          <dd>
            When a request is ambiguous (e.g. multiple tables loaded and none specified), the AI asks exactly one focused question with concrete examples. Answer it in the chat input and the agent proceeds.
          </dd>
        </div>
      </dl>
    </article>
  );
}

function WhatIsProject() {
  return (
    <article className="docs-article">
      <h1>Projects</h1>
      <p className="docs-lead">
        A project is the self-contained unit of work in DataHub. Think of it as a folder that holds everything related to one analytical question or
        use-case.
      </p>
      <h2>What lives inside a project</h2>
      <ul>
        <li>
          <strong>Data sources</strong> — uploaded files or database connections.
        </li>
        <li>
          <strong>Pipelines</strong> — transformation workflows that read from data sources and produce artifacts.
        </li>
        <li>
          <strong>Artifacts</strong> — versioned output tables saved from pipeline runs.
        </li>
        <li>
          <strong>Dashboards</strong> — charts and tables you've built from the pipeline results.
        </li>
      </ul>
      <h2>Project limits by plan</h2>
      <div className="docs-table-wrap">
        <table className="docs-table">
          <thead>
            <tr>
              <th>Plan</th>
              <th>Max projects</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Free</td>
              <td>2</td>
            </tr>
            <tr>
              <td>Professional</td>
              <td>Unlimited</td>
            </tr>
            <tr>
              <td>Team</td>
              <td>Unlimited</td>
            </tr>
            <tr>
              <td>Business</td>
              <td>Unlimited</td>
            </tr>
          </tbody>
        </table>
      </div>
      <h2>Deleting a project</h2>
      <p>
        Deleting a project permanently removes all its data sources, pipelines, artifacts, and dashboards. This action cannot be undone. You'll be asked to
        type the project name to confirm.
      </p>
      <div className="docs-callout docs-callout--warn">
        <strong>Warning:</strong> Deleting a project also deletes all stored artifacts (Parquet files in S3). Export any important artifacts before
        deleting.
      </div>
    </article>
  );
}

function WhatIsPipeline() {
  return (
    <article className="docs-article">
      <h1>Pipelines</h1>
      <p className="docs-lead">
        A pipeline is a sequence of AI-guided transformation steps that turn raw data into structured results. Each step is plain English captured and
        executed automatically.
      </p>
      <h2>Pipeline steps</h2>
      <p>Each step has a type that tells the AI what kind of operation to perform:</p>
      <div className="docs-table-wrap">
        <table className="docs-table">
          <thead>
            <tr>
              <th>Step type</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            <tr><td><code>fill_nulls</code></td><td>Fill missing values — mean / median / mode / zero / ffill / bfill / literal value</td></tr>
            <tr><td><code>filter_nulls</code></td><td>Drop rows where a specific column is null</td></tr>
            <tr><td><code>drop_null_columns</code></td><td>Drop columns with more than a threshold % of nulls</td></tr>
            <tr><td><code>cast_column_type</code></td><td>Change a column's type to int / float / str / datetime / bool</td></tr>
            <tr><td><code>add_calculated_column</code></td><td>Add a new column using a formula expression (e.g. <code>revenue * 0.9</code>)</td></tr>
            <tr><td><code>generate_id</code></td><td>Add a surrogate key — rownum / uuid4 / md5-hash</td></tr>
            <tr><td><code>drop_duplicates</code></td><td>Remove exact duplicate rows (keep first or last)</td></tr>
            <tr><td><code>deduplicate_by_column</code></td><td>Drop duplicates based on a single column subset</td></tr>
            <tr><td><code>fuzzy_deduplicate</code></td><td>Merge near-duplicate string values using a fuzzy similarity threshold</td></tr>
            <tr><td><code>trim_string_columns</code></td><td>Strip leading/trailing whitespace from all string columns</td></tr>
            <tr><td><code>rename_snake_case</code></td><td>Normalise all column names to snake_case</td></tr>
            <tr><td><code>filter_rows</code></td><td>Keep rows matching a condition — operators: == != &gt; &gt;= &lt; &lt;= contains startswith endswith</td></tr>
            <tr><td><code>filter_outliers</code></td><td>Remove rows where a numeric column exceeds a zscore threshold</td></tr>
            <tr><td><code>normalize_column</code></td><td>Scale a column with min-max normalisation or z-score standardisation</td></tr>
            <tr><td><code>round_numeric</code></td><td>Round a numeric column to N decimal places</td></tr>
            <tr><td><code>encode_categorical</code></td><td>One-hot or label-encode a categorical column</td></tr>
            <tr><td><code>parse_dates</code></td><td>Auto-detect and parse date/datetime strings into proper datetime types</td></tr>
            <tr><td><code>sort_by_column</code></td><td>Sort rows by a column — ascending or descending</td></tr>
            <tr><td><code>group_by_sum</code></td><td>Group by column(s) and sum a metric column</td></tr>
            <tr><td><code>group_by_count</code></td><td>Group by column(s) and count rows</td></tr>
            <tr><td><code>group_by_mean</code></td><td>Group by column(s) and average a metric column</td></tr>
            <tr><td><code>pivot_table</code></td><td>Reshape data — specify index, columns, values, and aggregation function</td></tr>
            <tr><td><code>resample_timeseries</code></td><td>Resample a time-series to a lower frequency (D/W/M) with an aggregation function</td></tr>
            <tr><td><code>detect_date_gaps</code></td><td>Reindex a date column to a complete range and fill gaps with ffill or bfill</td></tr>
            <tr><td><code>normalize_timezone</code></td><td>Localise timestamps to a source timezone then convert to a target timezone</td></tr>
            <tr><td><code>validate_rules</code></td><td>Assert quality rules (not_null / &gt; / &gt;= / &lt; / &lt;= / == / unique / regex / min_length) with flag / drop / report mode</td></tr>
            <tr><td><code>sentiment</code></td><td>AI-classify text column as positive / negative / neutral (with keyword-based fallback)</td></tr>
            <tr><td><code>keywords</code></td><td>Extract top-k keywords from a text column by frequency</td></tr>
            <tr><td><code>anomaly_detection</code></td><td>Flag statistical outliers per numeric column using zscore</td></tr>
            <tr><td><code>custom</code></td><td>Write raw SQL — reference your dataset with <code>&#123;&#123;dataset&#125;&#125;</code></td></tr>
          </tbody>
        </table>
      </div>
      <h2>Running a pipeline</h2>
      <p>
        Click <strong>Run</strong> to execute all steps in order. The pipeline creates a <em>pipeline run</em> record, executes each step, and saves any
        output as an artifact. Runs are shown in the Run history panel.
      </p>
      <h2>AI plan workflow: Approve, Modify, Reject</h2>
      <p>When you describe a transformation in the AI chat, the agent generates a plan card before executing anything. Three actions are available:</p>
      <ul>
        <li><strong>✓ Approve</strong> — run all steps immediately.</li>
        <li><strong>✎ Modify</strong> — opens an inline text field. Describe what to change (e.g. <em>"group by region not country"</em>). The agent revises the plan; the previous plan turns red.</li>
        <li><strong>✕ Reject</strong> — discard the plan without running anything.</li>
      </ul>
      <p>You can Modify as many times as needed before approving. Each modification generates a fresh plan incorporating your instruction.</p>
      <h2>Scheduling</h2>
      <p>
        On paid plans you can schedule a pipeline to run automatically on a cron schedule — e.g. every day at 08:00, or every Monday at 09:00. When the
        schedule fires, a new run is created and all downstream dashboards refresh.
      </p>
      <div className="docs-callout docs-callout--info">
        The Free plan does not support scheduled runs. Upgrade to Professional or higher to enable scheduling.
      </div>
    </article>
  );
}

function WhatIsArtifact() {
  return (
    <article className="docs-article">
      <h1>Artifacts</h1>
      <p className="docs-lead">
        An artifact is the versioned output of a pipeline step — a table stored as a Parquet file in S3 and registered in DataHub's metadata.
      </p>
      <h2>What an artifact contains</h2>
      <ul>
        <li>Row data (up to a configurable preview limit shown in the UI)</li>
        <li>Column schema (names, types)</li>
        <li>Row count and storage size</li>
        <li>A link to the source pipeline step and run</li>
        <li>A download link (CSV or Parquet)</li>
      </ul>
      <h2>Using artifacts downstream</h2>
      <p>
        You can reference an artifact as the <em>input</em> to a subsequent pipeline step. This lets you chain pipelines — for example, a daily ingestion
        pipeline feeds into a weekly aggregation pipeline.
      </p>
      <h2>Artifact storage</h2>
      <p>
        Artifacts are stored as Parquet files in S3. Storage is counted against your plan's storage quota. Large artifacts from frequent runs can accumulate
        quickly — consider deleting old pipeline runs to free space.
      </p>
      <div className="docs-table-wrap">
        <table className="docs-table">
          <thead>
            <tr>
              <th>Plan</th>
              <th>Storage</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Free</td>
              <td>1 GB</td>
            </tr>
            <tr>
              <td>Professional</td>
              <td>20 GB</td>
            </tr>
            <tr>
              <td>Team</td>
              <td>100 GB</td>
            </tr>
            <tr>
              <td>Business</td>
              <td>500 GB</td>
            </tr>
          </tbody>
        </table>
      </div>
    </article>
  );
}

function WhatIsDashboard() {
  return (
    <article className="docs-article">
      <h1>Canvases &amp; Visualizations</h1>
      <p className="docs-lead">
        A dashboard is a drag-and-drop canvas of charts, tables, and KPI cards — each card powered by a live query or artifact from your pipelines.
      </p>
      <h2>Card types</h2>
      <ul>
        <li>
          <strong>Bar chart</strong> — grouped or stacked, with optional colour grouping.
        </li>
        <li>
          <strong>Line chart</strong> — for time-series data.
        </li>
        <li>
          <strong>Pie / Donut chart</strong> — for part-to-whole comparisons.
        </li>
        <li>
          <strong>Scatter chart</strong> — XY correlation.
        </li>
        <li>
          <strong>Data table</strong> — searchable, sortable tabular view.
        </li>
        <li>
          <strong>KPI card</strong> — single metric connected to a real dataset column. Choose an aggregation (SUM / COUNT / AVG / MIN / MAX) and the value is computed live.
        </li>
        <li>
          <strong>Slicer tile</strong> — interactive filter connected to a dataset column. Selecting a value cross-filters other cards on the canvas.
        </li>
        <li>
          <strong>Text / Markdown card</strong> — add context, headings, or section breaks.
        </li>
      </ul>
      <h2>Sharing dashboards</h2>
      <p>
        Click <strong>Share</strong> on a dashboard to generate a public link. Anyone with the link can view the dashboard without logging in. You can
        revoke the link at any time. Sharing requires the Team plan or higher.
      </p>
      <h2>Dashboard limits</h2>
      <div className="docs-table-wrap">
        <table className="docs-table">
          <thead>
            <tr>
              <th>Plan</th>
              <th>Max dashboards</th>
              <th>Public sharing</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Free</td>
              <td>2</td>
              <td>—</td>
            </tr>
            <tr>
              <td>Professional</td>
              <td>20</td>
              <td>—</td>
            </tr>
            <tr>
              <td>Team</td>
              <td>Unlimited</td>
              <td>✅</td>
            </tr>
            <tr>
              <td>Business</td>
              <td>Unlimited</td>
              <td>✅</td>
            </tr>
          </tbody>
        </table>
      </div>
    </article>
  );
}

function GuideStart() {
  return (
    <article className="docs-article">
      <h1>Create your first project</h1>
      <p className="docs-lead">Projects are the top-level containers in DataHub. Here's how to create and configure one.</p>

      <div className="docs-step">
        <div className="docs-step__number">1</div>
        <div className="docs-step__body">
          <h3>Open the Workspace</h3>
          <p>Click <strong>Workspace</strong> in the top navigation bar.</p>
        </div>
      </div>
      <div className="docs-step">
        <div className="docs-step__number">2</div>
        <div className="docs-step__body">
          <h3>Click "New project"</h3>
          <p>Hit the <strong>+ New project</strong> button in the top-right corner of the workspace view.</p>
        </div>
      </div>
      <div className="docs-step">
        <div className="docs-step__number">3</div>
        <div className="docs-step__body">
          <h3>Name your project</h3>
          <p>
            Enter a descriptive name (e.g. <em>Q1 Revenue Analysis</em>). You can rename it later from the project settings menu.
          </p>
        </div>
      </div>
      <div className="docs-step">
        <div className="docs-step__number">4</div>
        <div className="docs-step__body">
          <h3>You're inside your project</h3>
          <p>
            The project opens to its home view, showing the data sources, pipelines, and dashboards panels. Everything is empty — start by adding a data
            source.
          </p>
        </div>
      </div>
      <div className="docs-callout docs-callout--info">
        On the Free plan you can have up to 2 projects. Upgrade to Professional or higher to create unlimited projects.
      </div>
    </article>
  );
}

function GuideUpload() {
  return (
    <article className="docs-article">
      <h1>Upload a file</h1>
      <p className="docs-lead">Uploading a CSV, Excel, Parquet, or JSON file is the fastest way to get data into DataHub.</p>

      <div className="docs-step">
        <div className="docs-step__number">1</div>
        <div className="docs-step__body">
          <h3>Open a project</h3>
          <p>Navigate to any project from the Workspace.</p>
        </div>
      </div>
      <div className="docs-step">
        <div className="docs-step__number">2</div>
        <div className="docs-step__body">
          <h3>Click "Add data source"</h3>
          <p>In the Data Sources panel, click <strong>+ Add data source</strong> then select <strong>Upload file</strong>.</p>
        </div>
      </div>
      <div className="docs-step">
        <div className="docs-step__number">3</div>
        <div className="docs-step__body">
          <h3>Select your file</h3>
          <p>
            Drag and drop a file or click to browse. Supported formats: <code>.csv</code>, <code>.xlsx</code>, <code>.xls</code>, <code>.parquet</code>,{" "}
            <code>.json</code>. Maximum file size depends on your plan (50 MB on Free, 1 GB on paid plans).
          </p>
          <p>
            <strong>CSV:</strong> Delimiter (comma / tab / semicolon / pipe / colon) and encoding are detected automatically — no configuration needed.
          </p>
          <p>
            <strong>Excel:</strong> If your workbook has multiple sheets, DataHub will prompt you to pick one before importing.
          </p>
        </div>
      </div>
      <div className="docs-step">
        <div className="docs-step__number">4</div>
        <div className="docs-step__body">
          <h3>Preview and confirm</h3>
          <p>
            DataHub parses the file and shows a preview. Verify the column names and types look correct, then click <strong>Confirm upload</strong>.
          </p>
        </div>
      </div>
      <div className="docs-callout docs-callout--warn">
        Files are stored in your workspace's S3 bucket. Large files count toward your plan storage quota.
      </div>
    </article>
  );
}

function GuideDatabase() {
  return (
    <article className="docs-article">
      <h1>Connect a database</h1>
      <p className="docs-lead">Database connectors let you query live data from PostgreSQL, MySQL, Snowflake, and more — without exporting to CSV first.</p>
      <div className="docs-callout docs-callout--info">
        <strong>Live now.</strong> Professional plan: PostgreSQL, MySQL, SQLite, MSSQL, Oracle. Team plan: adds Snowflake, Redshift, BigQuery.
        CSV and Excel uploads are available on all plans.
      </div>
      <h2>Connector availability</h2>
      <div className="docs-table-wrap">
        <table className="docs-table">
          <thead>
            <tr>
              <th>Connector</th>
              <th>Free</th>
              <th>Pro</th>
              <th>Team</th>
              <th>Business</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>CSV / Excel</td>
              <td>✅</td>
              <td>✅</td>
              <td>✅</td>
              <td>✅</td>
            </tr>
            <tr>
              <td>PostgreSQL</td>
              <td>—</td>
              <td>✅</td>
              <td>✅</td>
              <td>✅</td>
            </tr>
            <tr>
              <td>MySQL</td>
              <td>—</td>
              <td>✅</td>
              <td>✅</td>
              <td>✅</td>
            </tr>
            <tr>
              <td>SQLite</td>
              <td>—</td>
              <td>✅</td>
              <td>✅</td>
              <td>✅</td>
            </tr>
            <tr>
              <td>MSSQL</td>
              <td>—</td>
              <td>✅</td>
              <td>✅</td>
              <td>✅</td>
            </tr>
            <tr>
              <td>Oracle</td>
              <td>—</td>
              <td>✅</td>
              <td>✅</td>
              <td>✅</td>
            </tr>
            <tr>
              <td>Snowflake</td>
              <td>—</td>
              <td>—</td>
              <td>✅</td>
              <td>✅</td>
            </tr>
            <tr>
              <td>Redshift</td>
              <td>—</td>
              <td>—</td>
              <td>✅</td>
              <td>✅</td>
            </tr>
            <tr>
              <td>BigQuery</td>
              <td>—</td>
              <td>—</td>
              <td>✅</td>
              <td>✅</td>
            </tr>
            <tr>
              <td>Custom</td>
              <td>—</td>
              <td>—</td>
              <td>—</td>
              <td>🔜</td>
            </tr>
          </tbody>
        </table>
      </div>
      <h2>How to connect</h2>
      <div className="docs-step">
        <div className="docs-step__number">1</div>
        <div className="docs-step__body">
          <h3>Open a project and click “Add data source”</h3>
          <p>Select <strong>Connect database</strong> from the data source type picker.</p>
        </div>
      </div>
      <div className="docs-step">
        <div className="docs-step__number">2</div>
        <div className="docs-step__body">
          <h3>Choose your connector</h3>
          <p>Pick the database type (e.g. PostgreSQL). Enter the connection string and credential fields.</p>
        </div>
      </div>
      <div className="docs-step">
        <div className="docs-step__number">3</div>
        <div className="docs-step__body">
          <h3>Select a table or write a query</h3>
          <p>Enter a table name or a <code>SELECT</code> statement. DataHub will preview the first 100 rows.</p>
        </div>
      </div>
      <div className="docs-step">
        <div className="docs-step__number">4</div>
        <div className="docs-step__body">
          <h3>Confirm &amp; import</h3>
          <p>Click <strong>Import dataset</strong>. The data is fetched, stored as Parquet in S3, and available to pipelines and dashboards.</p>
        </div>
      </div>
      <p>
        Questions? <a href="mailto:mitul.srivastava000@gmail.com">Email us</a> or use the feedback form on the home page.
      </p>
    </article>
  );
}

function GuidePipeline() {
  return (
    <article className="docs-article">
      <h1>Build a pipeline</h1>
      <p className="docs-lead">Pipelines are the heart of DataHub. Here's how to build one step by step.</p>

      <div className="docs-step">
        <div className="docs-step__number">1</div>
        <div className="docs-step__body">
          <h3>Open a project and click "New pipeline"</h3>
          <p>In your project's Pipelines panel, click <strong>+ New pipeline</strong> and give it a name.</p>
        </div>
      </div>
      <div className="docs-step">
        <div className="docs-step__number">2</div>
        <div className="docs-step__body">
          <h3>Select a data source</h3>
          <p>The first step of any pipeline reads from a data source. Pick the file you uploaded earlier, or a previous artifact.</p>
        </div>
      </div>
      <div className="docs-step">
        <div className="docs-step__number">3</div>
        <div className="docs-step__body">
          <h3>Describe a transformation in plain English</h3>
          <p>
            In the AI chat panel, type what you want to do — e.g. <em>"Filter to rows where region = APAC, then group by month and sum revenue"</em>. The AI classifies your intent and generates a step-by-step execution plan with SQL and estimated row counts.
          </p>
          <p>
            If the request is ambiguous the AI asks one clarifying question first. Answer it and press <kbd>Enter</kbd> to receive the plan.
          </p>
        </div>
      </div>
      <div className="docs-step">
        <div className="docs-step__number">4</div>
        <div className="docs-step__body">
          <h3>Approve, modify, or reject the plan</h3>
          <p>
            The plan card shows each step with a description and estimated row count. Click <strong>✓ Approve</strong> to run all steps, <strong>✎ Modify</strong> to type a change before running (e.g. <em>"Remove the sort step"</em>), or <strong>✕ Reject</strong> to cancel. You can modify as many times as needed before approving.
          </p>
        </div>
      </div>
      <div className="docs-step">
        <div className="docs-step__number">5</div>
        <div className="docs-step__body">
          <h3>Save and name your artifact</h3>
          <p>After a successful run, the final step's output is saved as an artifact. You can rename it and add it to a dashboard.</p>
        </div>
      </div>
    </article>
  );
}

function GuideSchedule() {
  return (
    <article className="docs-article">
      <h1>Schedule a pipeline</h1>
      <p className="docs-lead">Keep your dashboards always up to date by running pipelines on a cron schedule.</p>
      <div className="docs-callout docs-callout--info">
        Scheduling requires a <strong>Professional</strong> plan or higher. The Free plan does not support scheduled runs.
      </div>

      <div className="docs-step">
        <div className="docs-step__number">1</div>
        <div className="docs-step__body">
          <h3>Open pipeline settings</h3>
          <p>Inside a pipeline, click the <strong>⚙ Settings</strong> icon.</p>
        </div>
      </div>
      <div className="docs-step">
        <div className="docs-step__number">2</div>
        <div className="docs-step__body">
          <h3>Enable schedule</h3>
          <p>Toggle <strong>Run on a schedule</strong> to on.</p>
        </div>
      </div>
      <div className="docs-step">
        <div className="docs-step__number">3</div>
        <div className="docs-step__body">
          <h3>Set a cron expression</h3>
          <p>
            Enter a standard cron expression. Examples:
          </p>
          <pre className="docs-codeblock">
            {`0 8 * * *     → every day at 08:00 UTC
0 9 * * 1     → every Monday at 09:00 UTC
0 0 1 * *     → first day of every month at midnight`}
          </pre>
        </div>
      </div>
      <div className="docs-step">
        <div className="docs-step__number">4</div>
        <div className="docs-step__body">
          <h3>Save</h3>
          <p>Click <strong>Save schedule</strong>. The pipeline will now run automatically. You'll see scheduled runs in the Run history panel.</p>
        </div>
      </div>
    </article>
  );
}

function GuideDashboard() {
  return (
    <article className="docs-article">
      <h1>Build a dashboard</h1>
      <p className="docs-lead">Turn your pipeline artifacts into shareable visual dashboards.</p>

      <div className="docs-step">
        <div className="docs-step__number">1</div>
        <div className="docs-step__body">
          <h3>Create a new dashboard</h3>
          <p>In your project's Dashboards panel, click <strong>+ New dashboard</strong>. Give it a name.</p>
        </div>
      </div>
      <div className="docs-step">
        <div className="docs-step__number">2</div>
        <div className="docs-step__body">
          <h3>Add a card</h3>
          <p>
            Click <strong>+ Add card</strong> and choose a chart type (bar, line, pie, scatter, table, KPI). Select the artifact or data source to power it.
          </p>
        </div>
      </div>
      <div className="docs-step">
        <div className="docs-step__number">3</div>
        <div className="docs-step__body">
          <h3>Configure axes</h3>
          <p>Map your data columns to chart axes. For a bar chart, choose the X-axis (category), Y-axis (metric), and optional colour/group column.</p>
        </div>
      </div>
      <div className="docs-step">
        <div className="docs-step__number">4</div>
        <div className="docs-step__body">
          <h3>Drag to resize and arrange</h3>
          <p>Drag cards to rearrange them on the canvas. Drag the bottom-right corner of a card to resize it.</p>
        </div>
      </div>
      <div className="docs-step">
        <div className="docs-step__number">5</div>
        <div className="docs-step__body">
          <h3>Share (Team plan+)</h3>
          <p>
            Click <strong>Share</strong> → <strong>Generate public link</strong>. Anyone with the link can view the dashboard without logging in.
          </p>
        </div>
      </div>
    </article>
  );
}

function GuideInvite() {
  return (
    <article className="docs-article">
      <h1>Invite team members</h1>
      <p className="docs-lead">Collaborate with colleagues by inviting them to your workspace.</p>
      <div className="docs-callout docs-callout--info">
        The Free plan supports 1 member (you). Upgrade to Professional (1 member) or Team (up to 10) to collaborate.
      </div>

      <div className="docs-step">
        <div className="docs-step__number">1</div>
        <div className="docs-step__body">
          <h3>Go to Settings → Team</h3>
          <p>Click your profile avatar in the top bar and select <strong>Settings</strong>, then open the <strong>Team</strong> tab.</p>
        </div>
      </div>
      <div className="docs-step">
        <div className="docs-step__number">2</div>
        <div className="docs-step__body">
          <h3>Enter an email address</h3>
          <p>Type the email of the person you want to invite and click <strong>Send invite</strong>.</p>
        </div>
      </div>
      <div className="docs-step">
        <div className="docs-step__number">3</div>
        <div className="docs-step__body">
          <h3>They accept & join</h3>
          <p>
            The invitee receives an email. Once they click <strong>Accept invitation</strong> and sign up, they appear in your workspace as a member with
            access to all projects.
          </p>
        </div>
      </div>
      <div className="docs-table-wrap">
        <table className="docs-table">
          <thead>
            <tr>
              <th>Plan</th>
              <th>Max members</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>Free</td><td>1</td></tr>
            <tr><td>Professional</td><td>1</td></tr>
            <tr><td>Team</td><td>10</td></tr>
            <tr><td>Business</td><td>50</td></tr>
            <tr><td>Enterprise</td><td>Unlimited</td></tr>
          </tbody>
        </table>
      </div>
    </article>
  );
}

function GuideExport() {
  return (
    <article className="docs-article">
      <h1>Export &amp; share results</h1>
      <p className="docs-lead">Get your data out of DataHub in the format that works best for you.</p>
      <h2>Download an artifact</h2>
      <p>
        Open any artifact from a pipeline run. Click the <strong>Download</strong> button and choose <strong>CSV</strong> or <strong>Parquet</strong>. The
        file downloads directly to your machine.
      </p>
      <h2>Share a dashboard</h2>
      <p>
        On the Team plan and higher, open a dashboard and click <strong>Share → Generate public link</strong>. The link can be shared with anyone — they
        don't need a DataHub account to view it.
      </p>
      <h2>Embed a chart</h2>
      <p>
        From the Share menu, copy the <strong>iframe embed snippet</strong> to embed a live chart in any website or Notion page.
      </p>
      <div className="docs-callout docs-callout--info">
        Public links and embed snippets display a read-only snapshot. Viewers cannot edit or interact with the underlying data.
      </div>
      <h2>Export via API</h2>
      <p>
        The DataHub REST API exposes artifact download endpoints. See <a href="/docs?page=faq">the FAQ</a> for API access details, or{" "}
        <a href="mailto:mitul.srivastava000@gmail.com">email us</a> for Enterprise API documentation.
      </p>
    </article>
  );
}

function Faq() {
  const faqs: { q: string; a: string }[] = [
    {
      q: "Does DataHub work with large files?",
      a: "Free supports files up to 50 MB. Professional supports up to 1 GB, Team up to 5 GB, Business up to 10 GB. Enterprise has no per-file size limit. For very large datasets, consider splitting files or contact us for Enterprise options.",
    },
    {
      q: "What SQL dialect does DataHub use internally?",
      a: "DataHub executes analytical SQL against your data using an in-process columnar SQL engine. It supports most ANSI SQL plus extensions for JSON, arrays, and time-series. You don't need to know SQL — the AI handles query generation for you.",
    },
    {
      q: "Is my data secure?",
      a: "All data is encrypted in transit (TLS) and at rest (AES-256 on S3). Each workspace is isolated at the database and storage level — your data is never shared with or accessible by other workspaces. We are GDPR-compliant.",
    },
    {
      q: "Can I use DataHub for free?",
      a: "Yes. The Free plan lets you create 2 projects, upload files up to 50 MB, use 100 AI messages per month — with no credit card required.",
    },
    {
      q: "Is there an API?",
      a: "A REST API is available for Business and Enterprise plans. Contact mitul.srivastava000@gmail.com for documentation and API keys.",
    },
    {
      q: "Can I export my data if I cancel?",
      a: "Yes. Before your subscription ends you can download all artifacts as CSV or Parquet from the project view. We will also email you a data export link upon cancellation.",
    },
    {
      q: "Do AI messages roll over month to month?",
      a: "No. AI message quotas reset on the first day of each billing month. Unused messages do not carry over.",
    },
    {
      q: "What happens when I hit a plan limit?",
      a: "You'll see an in-app warning when you're close to a limit. When you exceed it, the specific action (e.g. uploading a new file, or sending an AI message) will be blocked until you upgrade or the quota resets.",
    },
    {
      q: "Can I modify an AI plan before it runs?",
      a: "Yes. When the AI presents a plan card, click ✎ Modify. A text field appears — describe what to change (e.g. \"Group by region instead of country\" or \"Add a dedup step first\"). Press Enter or click Apply changes. The previous plan is discarded and a revised plan is generated. You can modify as many times as you like before approving.",
    },
    {
      q: "Why did the AI ask me a question instead of showing a plan?",
      a: "The AI only asks for clarification when it genuinely cannot proceed without more information — for example, multiple tables are loaded and you didn't specify which one, or your request has no actionable detail. The question appears with a purple border and a NEEDS YOUR INPUT label. Type your answer and press Enter.",
    },
    {
      q: "What is the data quality check and how do I fix issues automatically?",
      a: "Type \"validate\", \"check data quality\", \"profile my data\", or click the Quality button in the AI panel header. A two-step plan runs: step 1 collects null counts and duplicate statistics; step 2 produces a human-readable summary with per-column null percentages, min/max/mean, and outlier counts. After the report, the AI asks \"Want me to automatically fix these issues?\" — reply or approve the follow-up plan to clean the dataset.",
    },
  ];

  const [openIdx, setOpenIdx] = useState<number | null>(null);

  return (
    <article className="docs-article">
      <h1>Frequently Asked Questions</h1>
      <p className="docs-lead">Common questions about DataHub — billing, security, limits, and more.</p>
      <div className="docs-faq">
        {faqs.map((item, i) => (
          <div key={i} className={`docs-faq__item${openIdx === i ? " docs-faq__item--open" : ""}`}>
            <button className="docs-faq__question" onClick={() => setOpenIdx(openIdx === i ? null : i)}>
              {item.q}
              <span className="docs-faq__chevron">▼</span>
            </button>
            {openIdx === i && <p className="docs-faq__answer">{item.a}</p>}
          </div>
        ))}
      </div>
    </article>
  );
}

function PlanLimits() {
  return (
    <article className="docs-article">
      <h1>Plan limits</h1>
      <p className="docs-lead">All plans are billed monthly <strong>per account</strong>. Personal workspaces draw from the account owner's quota; collab workspaces draw from the workspace owner's quota.</p>

      <h2>Feature comparison</h2>
      <div className="docs-table-wrap">
        <table className="docs-table docs-table--plans">
          <thead>
            <tr>
              <th>Feature</th>
              <th>Free</th>
              <th>Professional ($79/mo)</th>
              <th>Team ($149/mo)</th>
              <th>Business ($399/mo)</th>
              <th>Enterprise</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>Personal workspace</td><td>1</td><td>1</td><td>1</td><td>1</td><td>Unlimited</td></tr>
            <tr><td>Collab workspaces</td><td>0</td><td>0</td><td>2</td><td>9</td><td>Unlimited</td></tr>
            <tr><td>Projects per workspace</td><td>2</td><td>20</td><td>Unlimited</td><td>Unlimited</td><td>Unlimited</td></tr>
            <tr><td>AI messages / month</td><td>100</td><td>2,000</td><td>5,000</td><td>Unlimited</td><td>Unlimited</td></tr>
            <tr><td>Max file size</td><td>50 MB</td><td>1 GB</td><td>5 GB</td><td>10 GB</td><td>Unlimited</td></tr>
            <tr><td>Storage</td><td>500 MB</td><td>20 GB</td><td>100 GB</td><td>2 TB</td><td>Unlimited</td></tr>
            <tr><td>Data scan / month</td><td>5 GB</td><td>50 GB</td><td>200 GB</td><td>Unlimited</td><td>Unlimited</td></tr>
            <tr><td>Members per workspace</td><td>1</td><td>1</td><td>10</td><td>50</td><td>Unlimited</td></tr>
            <tr><td>DB connections</td><td>CSV, Excel</td><td>+ PG, MySQL, SQLite, MSSQL, Oracle</td><td>+ Snowflake, Redshift, BigQuery</td><td>+ Custom connectors</td><td>All</td></tr>
            <tr><td>Scheduling</td><td>—</td><td>✅</td><td>✅</td><td>✅</td><td>✅</td></tr>
            <tr><td>Dashboard sharing</td><td>—</td><td>✅</td><td>✅</td><td>✅</td><td>✅</td></tr>
            <tr><td>Audit log</td><td>—</td><td>—</td><td>✅</td><td>✅</td><td>✅</td></tr>
            <tr><td>Webhooks</td><td>—</td><td>—</td><td>—</td><td>✅</td><td>✅</td></tr>
            <tr><td>SSO / SAML</td><td>—</td><td>—</td><td>—</td><td>✅</td><td>✅</td></tr>
            <tr><td>Support</td><td>Community</td><td>Email</td><td>Priority email</td><td>24/7 dedicated</td><td>Custom SLA</td></tr>
          </tbody>
        </table>
      </div>

      <h2>Billing attribution</h2>
      <p>Usage inside a <strong>collab workspace</strong> (AI calls, pipeline runs, data scanned) is charged to the <strong>workspace owner's</strong> account — not the calling member's. A Free-tier user invited into a Team collab workspace uses the Team owner's quota.</p>

      <div className="docs-callout docs-callout--info">
        INR pricing: Professional ₹6,999/mo · Team ₹14,999/mo (3 seats incl, +₹2,499/extra) · Business ₹29,999/mo (5 seats incl, +₹3,999/extra) · Enterprise custom. Billing is processed via Razorpay.
      </div>
    </article>
  );
}

function FileFormats() {
  return (
    <article className="docs-article">
      <h1>Supported file formats</h1>
      <p className="docs-lead">DataHub supports the most common tabular data formats out of the box — no conversion needed.</p>
      <div className="docs-table-wrap">
        <table className="docs-table">
          <thead>
            <tr>
              <th>Extension</th>
              <th>Format</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            <tr><td><code>.csv</code></td><td>Comma-separated values</td><td>Delimiter auto-detected (comma / tab / semicolon / pipe / colon); encoding auto-converted to UTF-8</td></tr>
            <tr><td><code>.tsv</code></td><td>Tab-separated values</td><td>Treated same as CSV with tab delimiter</td></tr>
            <tr><td><code>.xlsx</code></td><td>Excel workbook</td><td>Multi-sheet supported — UI prompts sheet selection; <code>POST /import/excel-sheets</code> lists sheets via API</td></tr>
            <tr><td><code>.xls</code></td><td>Legacy Excel</td><td>Converted server-side; large files may be slow</td></tr>
            <tr><td><code>.parquet</code></td><td>Apache Parquet</td><td>Recommended for large datasets — fastest ingest</td></tr>
            <tr><td><code>.json</code></td><td>JSON / NDJSON</td><td>Newline-delimited JSON preferred; nested objects flattened</td></tr>
          </tbody>
        </table>
      </div>
      <h2>Encoding &amp; delimiter detection</h2>
      <p>
        CSV files are automatically probed to detect the delimiter (comma, semicolon, pipe, tab, colon). Non-UTF-8 encodings (Latin-1, Windows-1252, etc.) are detected automatically and re-encoded to UTF-8 during ingest — no manual action needed.
      </p>
      <h2>Multi-sheet Excel</h2>
      <p>
        When you upload a <code>.xlsx</code> or <code>.xls</code> file with more than one sheet, DataHub shows a sheet-picker before confirming the
        import. You can also retrieve the list of sheets programmatically using <code>POST /import/excel-sheets</code> and pass the sheet name as the
        <code>sheet</code> field on <code>POST /import/upload</code>.
      </p>
    </article>
  );
}

function Shortcuts() {
  const groups: { label: string; items: { keys: string[]; desc: string }[] }[] = [
    {
      label: "Navigation",
      items: [
        { keys: ["G", "H"], desc: "Go to Home" },
        { keys: ["G", "W"], desc: "Go to Workspace" },
        { keys: ["G", "D"], desc: "Go to Docs" },
        { keys: ["?"], desc: "Open keyboard shortcuts" },
      ],
    },
    {
      label: "Pipeline editor",
      items: [
        { keys: ["⌘", "Enter"], desc: "Run pipeline" },
        { keys: ["⌘", "S"], desc: "Save pipeline" },
        { keys: ["⌘", "Z"], desc: "Undo last step" },
        { keys: ["Esc"], desc: "Close AI panel" },
      ],
    },
    {
      label: "Dashboard",
      items: [
        { keys: ["E"], desc: "Toggle edit mode" },
        { keys: ["⌘", "S"], desc: "Save layout" },
        { keys: ["Del"], desc: "Delete selected card" },
        { keys: ["Esc"], desc: "Deselect card" },
      ],
    },
  ];

  return (
    <article className="docs-article">
      <h1>Keyboard shortcuts</h1>
      <p className="docs-lead">Speed up your workflow with these keyboard shortcuts. Press <kbd>?</kbd> anywhere in the app to see this list.</p>
      {groups.map((g) => (
        <div key={g.label}>
          <h2>{g.label}</h2>
          <div className="docs-shortcuts-grid">
            {g.items.map((item) => (
              <div key={item.desc} className="docs-shortcut-row">
                <span>{item.desc}</span>
                <span className="docs-keys">
                  {item.keys.map((k, i) => (
                    <kbd key={i}>{k}</kbd>
                  ))}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </article>
  );
}

function AiAgent() {
  return (
    <article className="docs-article">
      <h1>AI Agent</h1>
      <p className="docs-lead">
        The DataHub AI agent understands plain English, generates step-by-step SQL execution plans, and asks focused clarifying questions when it needs
        more information — all before a single row of your data changes.
      </p>

      <div className="docs-callout docs-callout--info">
        <strong>Nothing runs without your approval.</strong> The agent always presents a step-by-step plan first. You can review, modify, or reject
        it before anything executes.
      </div>

      <h2>How it works</h2>
      <p>
        Every message you type passes through a multi-step pipeline: intent classification → planning → approval gate → execution → response. You stay in full
        control at every stage.
      </p>

      <h2>Supported intents</h2>
      <p>The agent classifies every message into one intent before generating a plan:</p>
      <div className="docs-table-wrap">
        <table className="docs-table">
          <thead>
            <tr>
              <th>Intent</th>
              <th>What it does</th>
            </tr>
          </thead>
          <tbody>
            <tr><td><code>clean</code></td><td>Standardise column names, cast types, remove duplicates, trim whitespace, handle nulls</td></tr>
            <tr><td><code>filter</code></td><td>Subset rows by one or more conditions (equals, ≥, ≤, contains, is null…)</td></tr>
            <tr><td><code>transform</code></td><td>General data modification not covered by a more specific intent</td></tr>
            <tr><td><code>add_column</code></td><td>Create a new calculated or derived column</td></tr>
            <tr><td><code>summarise</code></td><td>Group-by aggregation (sum, count, avg, min, max, count_distinct)</td></tr>
            <tr><td><code>pivot</code></td><td>Reshape long-to-wide format</td></tr>
            <tr><td><code>union</code></td><td>Vertically stack two or more tables</td></tr>
            <tr><td><code>join</code></td><td>Merge two tables on a key column — join key is auto-detected</td></tr>
            <tr><td><code>reconcile</code></td><td>Compare two tables on a key to find variances and missing rows</td></tr>
            <tr><td><code>validate</code></td><td>Read-only data quality report (null counts, dupes, outliers) — always generates a two-step plan</td></tr>
            <tr><td><code>sql_query</code></td><td>Run a read-only SQL query or ad-hoc aggregation</td></tr>
            <tr><td><code>visualise</code></td><td>Create a chart, graph, or visual summary</td></tr>
            <tr><td><code>export</code></td><td>Save a table as CSV, Excel, or Parquet and get a download link</td></tr>
            <tr><td><code>clarify</code></td><td>The request is too ambiguous to proceed — triggers exactly one focused clarifying question</td></tr>
            <tr><td><code>converse</code></td><td>Greeting, question about the tool, or anything not data-related</td></tr>
          </tbody>
        </table>
      </div>

      <h2>Table name auto-resolution</h2>
      <p>
        You don't need to use exact internal table names. Mention a dataset by its display name and the agent silently resolves it. For example, typing
        <em> "clean the sales data"</em> will match your <code>sales_data</code> table automatically.
      </p>
      <ul>
        <li>If you reference one table and it exists, it resolves silently — no question asked.</li>
        <li>
          If you reference two tables for a join, union, or reconcile and both exist, they are resolved automatically — join key is auto-detected from
          common columns (preferring columns named <code>*_id</code>, <code>id</code>, <code>key</code>, or <code>code</code>).
        </li>
        <li>Clarification is only requested when the situation is genuinely ambiguous and a reasonable assumption cannot be made.</li>
      </ul>

      <h2>Clarification step</h2>
      <p>
        When the agent cannot proceed without more information it asks <em>exactly one</em> focused question — never more. The question always includes
        2–3 concrete examples to guide your answer.
      </p>
      <p>
        Clarification messages appear with a <strong style={{ color: "#7c3aed" }}>purple border</strong>, a{" "}
        <strong>❓ NEEDS YOUR INPUT</strong> label, and a <em>↓ Type your answer below</em> hint so they are immediately distinguishable from
        regular responses. No follow-up chips are shown after a clarification.
      </p>
      <p>Clarification is triggered only when:</p>
      <ul>
        <li>Multiple tables are loaded and you have not specified which one.</li>
        <li>The operation type is unclear (e.g. <em>"fix the data"</em> with no further detail).</li>
        <li>A required parameter is completely missing (e.g. <em>"filter the data"</em> with no condition).</li>
      </ul>
      <div className="docs-callout docs-callout--info">
        After you answer a clarifying question, the agent proceeds automatically — you do not need to re-state your original request.
      </div>

      <h2>Execution plan: Approve, Modify, Reject</h2>
      <p>
        Before running anything the agent presents a numbered step-by-step plan. Each step shows the operation type, a plain-English description,
        estimated row count, and the SQL that will run. Three actions are available:
      </p>
      <ul>
        <li>
          <strong>✓ Approve</strong> — all steps run immediately in sequence. A live progress indicator updates as each step completes (e.g.
          <em> "Step 2/3: summarise"</em>).
        </li>
        <li>
          <strong>✎ Modify</strong> — an inline text field appears inside the plan card. Describe what to change — e.g.{" "}
          <em>"group by region instead of country"</em> or <em>"add a dedup step first"</em>. Press <kbd>Enter</kbd> or click{" "}
          <strong>Apply changes</strong>. The current plan turns red and a revised plan is generated incorporating your instruction. You can modify
          as many times as needed before approving.
        </li>
        <li>
          <strong>✕ Reject</strong> — the plan is discarded without running. The plan card turns red.
        </li>
      </ul>

      <h2>Data quality check</h2>
      <p>
        Type <em>"validate"</em>, <em>"check data quality"</em>, <em>"profile my data"</em>, or click the <strong>Quality</strong> button in the
        AI panel header. The agent generates a <strong>two-step plan</strong>:
      </p>
      <ul>
        <li>
          <strong>Step 1 — Validate:</strong> runs a safe null-count query that counts non-null values per column and the number of distinct rows.
        </li>
        <li>
          <strong>Step 2 — Summarise:</strong> produces a human-readable report with total rows, null count and null% per column, duplicate row count,
          and for numeric columns: min, max, mean, and outlier count.
        </li>
      </ul>
      <p>
        After presenting results the AI asks <em>"Want me to automatically fix these issues?"</em> — approve the follow-up plan to clean the dataset.
      </p>

      <h2>Join key auto-detection</h2>
      <p>When you say <em>"join customers and orders"</em>, the agent:</p>
      <ol>
        <li>Identifies both tables from the session by name matching.</li>
        <li>Finds columns that exist in both tables with the same name.</li>
        <li>Prefers columns named <code>*_id</code>, <code>id</code>, <code>key</code>, or <code>code</code>.</li>
        <li>Generates a complete, ready-to-run <code>LEFT JOIN</code> SQL statement.</li>
      </ol>
      <p>If no common column is found, the plan notes this and asks you to specify the join key.</p>

      <h2>Proactive insights</h2>
      <p>After every data operation the AI response includes one proactive domain observation. Examples:</p>
      <ul>
        <li><em>"I noticed HealthTech accounts for 67% of the remaining deals — want me to analyse this segment?"</em></li>
        <li><em>"753 customers have no matching orders — this might be worth investigating."</em></li>
        <li><em>"The removed rows had significantly higher average deal amounts."</em></li>
      </ul>
      <p>
        If any column contains outliers, the response automatically includes a <strong>⚠️ outlier callout</strong> with the column name and count.
        Every response ends with a <em>"Want me to…"</em> or <em>"Shall I…"</em> follow-up to continue naturally.
      </p>

      <h2>Follow-up suggestion chips</h2>
      <p>After each completed operation, 2–3 context-specific chips appear to continue the analysis:</p>
      <ul>
        <li>After <strong>validate</strong>: "Fix all detected issues automatically", "Show null distribution chart", "Export the quality report".</li>
        <li>After <strong>join</strong>: "Show a summary of joined data", "Visualise the combined dataset", "Export the joined result".</li>
        <li>After <strong>visualise</strong>: "Show a different chart type", "Add to dashboard", "Top 5 values?".</li>
        <li>No chips are shown after clarification questions or conversational replies.</li>
      </ul>

      <h2>Branching pipelines</h2>
      <p>
        When a goal produces multiple independent outputs — e.g. <em>"summarise revenue by region AND by product"</em> — the agent generates a{" "}
        <strong>branching pipeline</strong> where steps can run in parallel. The plan is rendered as a visual node graph with arrows showing
        dependencies. The same Approve / Modify / Reject controls apply to branching plans.
      </p>
    </article>
  );
}

// ── Content router ─────────────────────────────────────────────
function DataOps() {
  return (
    <article className="docs-article">
      <h1>AI Data Operations</h1>
      <p className="docs-lead">
        DataHub includes 30+ built-in transformation operations — each automatically selected by the AI agent when you describe your intent in plain English.
      </p>
      <div className="docs-callout docs-callout--info">
        <strong>Table names are auto-resolved.</strong> You don’t need to use exact internal names. Mention a table by its display name and the agent matches it. For joins and unions involving two tables, both are identified automatically and the join key is auto-detected from common columns.
      </div>
      <p>
        For a full explanation of how the agent classifies intents, handles clarifications, and manages the Approve / Modify / Reject plan workflow, see the <strong>AI Agent</strong> page in Core Features.
      </p>
      <h2>Null handling</h2>
      <div className="docs-table-wrap">
        <table className="docs-table">
          <thead><tr><th>Operation</th><th>What it does</th></tr></thead>
          <tbody>
            <tr><td><code>fill_nulls</code></td><td>Fill missing values using: <em>mean / median / mode / zero / ffill / bfill / literal value</em></td></tr>
            <tr><td><code>filter_nulls</code></td><td>Drop rows where a specified column is null</td></tr>
            <tr><td><code>drop_null_columns</code></td><td>Remove columns where the null percentage exceeds a threshold</td></tr>
          </tbody>
        </table>
      </div>

      <h2>Type casting &amp; enrichment</h2>
      <div className="docs-table-wrap">
        <table className="docs-table">
          <thead><tr><th>Operation</th><th>What it does</th></tr></thead>
          <tbody>
            <tr><td><code>cast_column_type</code></td><td>Convert a column to int / float / str / datetime / bool</td></tr>
            <tr><td><code>add_calculated_column</code></td><td>Add a new column from a formula expression (e.g. <code>revenue * 0.9</code>)</td></tr>
            <tr><td><code>generate_id</code></td><td>Add a surrogate key column — <em>rownum</em>, <em>uuid4</em>, or <em>md5-hash</em> of selected columns</td></tr>
          </tbody>
        </table>
      </div>

      <h2>Cleaning &amp; deduplication</h2>
      <div className="docs-table-wrap">
        <table className="docs-table">
          <thead><tr><th>Operation</th><th>What it does</th></tr></thead>
          <tbody>
            <tr><td><code>drop_duplicates</code></td><td>Remove exact duplicate rows, keeping first or last occurrence</td></tr>
            <tr><td><code>deduplicate_by_column</code></td><td>Keep one row per unique value in a specified column</td></tr>
            <tr><td><code>fuzzy_deduplicate</code></td><td>Merge near-duplicate strings using a fuzzy similarity score — set a threshold (0–100)</td></tr>
            <tr><td><code>trim_string_columns</code></td><td>Strip leading/trailing whitespace from all string columns</td></tr>
            <tr><td><code>rename_snake_case</code></td><td>Normalise all column names to lowercase snake_case</td></tr>
          </tbody>
        </table>
      </div>

      <h2>Filtering &amp; outlier removal</h2>
      <div className="docs-table-wrap">
        <table className="docs-table">
          <thead><tr><th>Operation</th><th>What it does</th></tr></thead>
          <tbody>
            <tr><td><code>filter_rows</code></td><td>Keep rows matching a condition — operators: <code>== != &gt; &gt;= &lt; &lt;=</code> and string ops <code>contains / startswith / endswith</code></td></tr>
            <tr><td><code>filter_outliers</code></td><td>Drop rows where a numeric column's zscore exceeds a threshold</td></tr>
          </tbody>
        </table>
      </div>

      <h2>Normalisation &amp; encoding</h2>
      <div className="docs-table-wrap">
        <table className="docs-table">
          <thead><tr><th>Operation</th><th>What it does</th></tr></thead>
          <tbody>
            <tr><td><code>normalize_column</code></td><td>Min-max scale (0–1) or z-score standardise a numeric column</td></tr>
            <tr><td><code>round_numeric</code></td><td>Round a numeric column to N decimal places</td></tr>
            <tr><td><code>encode_categorical</code></td><td>One-hot or label-encode a categorical column (expands or replaces)</td></tr>
            <tr><td><code>parse_dates</code></td><td>Auto-detect and convert date/datetime string columns to proper datetime type</td></tr>
          </tbody>
        </table>
      </div>

      <h2>Sorting &amp; aggregation</h2>
      <div className="docs-table-wrap">
        <table className="docs-table">
          <thead><tr><th>Operation</th><th>What it does</th></tr></thead>
          <tbody>
            <tr><td><code>sort_by_column</code></td><td>Order rows by a column — ascending or descending</td></tr>
            <tr><td><code>group_by_sum</code></td><td>Group by column(s) and compute the sum of a metric column</td></tr>
            <tr><td><code>group_by_count</code></td><td>Group by column(s) and count rows</td></tr>
            <tr><td><code>group_by_mean</code></td><td>Group by column(s) and compute the mean of a metric column</td></tr>
            <tr><td><code>pivot_table</code></td><td>Reshape data — set index, column headers, values, and aggregation function</td></tr>
            <tr><td><code>resample_timeseries</code></td><td>Downsample a time-series to a lower frequency (D / W / M) with an aggregation function</td></tr>
          </tbody>
        </table>
      </div>

      <h2>Time-series &amp; temporal</h2>
      <div className="docs-table-wrap">
        <table className="docs-table">
          <thead><tr><th>Operation</th><th>What it does</th></tr></thead>
          <tbody>
            <tr><td><code>detect_date_gaps</code></td><td>Reindex a date column to a complete date range; fill newly-introduced nulls with ffill or bfill</td></tr>
            <tr><td><code>normalize_timezone</code></td><td>Localise naive timestamps to a source timezone, then convert to a target timezone</td></tr>
          </tbody>
        </table>
      </div>

      <h2>Validation rule engine</h2>
      <p>
        <code>validate_rules</code> applies quality assertions to any column. Configure multiple rules at once — each rule specifies a column, an
        operator, and a threshold.
      </p>
      <div className="docs-table-wrap">
        <table className="docs-table">
          <thead><tr><th>Operator</th><th>Description</th></tr></thead>
          <tbody>
            <tr><td><code>not_null</code></td><td>Column must contain no null values</td></tr>
            <tr><td><code>&gt;</code> <code>&gt;=</code> <code>&lt;</code> <code>&lt;=</code> <code>==</code></td><td>Numeric comparison against a threshold</td></tr>
            <tr><td><code>unique</code></td><td>All values in the column must be distinct</td></tr>
            <tr><td><code>regex</code></td><td>String values must match a regular expression</td></tr>
            <tr><td><code>min_length</code></td><td>String values must be at least N characters long</td></tr>
          </tbody>
        </table>
      </div>
      <p>Failure handling modes:</p>
      <ul>
        <li><strong>flag</strong> — add a boolean column marking failing rows (non-destructive)</li>
        <li><strong>drop</strong> — remove failing rows from the dataset</li>
        <li><strong>report</strong> — same as flag, with a custom column name</li>
      </ul>

      <h2>AI transforms</h2>
      <div className="docs-table-wrap">
        <table className="docs-table">
          <thead><tr><th>Operation</th><th>What it does</th></tr></thead>
          <tbody>
            <tr><td><code>sentiment</code></td><td>AI-classify a text column as positive / negative / neutral (with keyword-based fallback)</td></tr>
            <tr><td><code>keywords</code></td><td>Extract top-k keywords from a text column by frequency</td></tr>
            <tr><td><code>anomaly_detection</code></td><td>Flag statistical outliers in every numeric column using zscore</td></tr>
          </tbody>
        </table>
      </div>

      <h2>Custom SQL</h2>
      <p>
        Use <code>custom</code> to run any SQL against your dataset. Reference your current dataset as <code>&#123;&#123;dataset&#125;&#125;</code> in the query.
        The result of the <code>SELECT</code> statement becomes the new dataset for the next step.
      </p>
      <pre className="docs-codeblock">{`SELECT *, revenue / total_revenue AS pct_share
FROM {{dataset}}
WHERE region = 'APAC'`}</pre>

      <div className="docs-callout docs-callout--info">
        <strong>NL pipeline editing:</strong> In the pipeline builder, click <strong>AI edit</strong> and type what you want in plain English — e.g.
        <em>"fill nulls in the revenue column with the median, then remove outliers"</em>. The AI matches your intent to the correct operations and
        rewrites the pipeline steps automatically.
      </div>
    </article>
  );
}

function LegalTerms() {
  return (
    <article className="docs-article">
      <h1>Terms of Service</h1>
      <p className="docs-lead">
        By using DataHub you agree to our Terms of Service. These terms cover acceptable use, subscription billing, data ownership,
        intellectual property, termination, liability limits, and more.
      </p>
      <h2>Key sections at a glance</h2>
      <dl className="docs-glossary">
        <div className="docs-glossary__item">
          <dt>Your data</dt>
          <dd>You retain full ownership of all data you upload or generate. We do not sell or share your data with third parties.</dd>
        </div>
        <div className="docs-glossary__item">
          <dt>Acceptable use</dt>
          <dd>DataHub may not be used for illegal activity, malicious automation, or scraping other services. Violations result in immediate termination.</dd>
        </div>
        <div className="docs-glossary__item">
          <dt>Subscriptions &amp; billing</dt>
          <dd>Subscriptions are billed monthly. You may cancel at any time; access continues until the end of the billing period.</dd>
        </div>
        <div className="docs-glossary__item">
          <dt>Liability</dt>
          <dd>The service is provided "as is". Our liability is limited to the amount you paid in the 12 months preceding a claim.</dd>
        </div>
        <div className="docs-glossary__item">
          <dt>Governing law</dt>
          <dd>These terms are governed by the laws of India. Disputes are subject to the exclusive jurisdiction of courts in India.</dd>
        </div>
      </dl>
      <div className="docs-callout docs-callout--info">
        This is a summary only. Read the full Terms of Service for all details.
      </div>
      <a
        href="/terms"
        target="_blank"
        rel="noreferrer"
        className="docs-legal-link"
      >
        Read full Terms of Service →
      </a>
    </article>
  );
}

function LegalPrivacy() {
  return (
    <article className="docs-article">
      <h1>Privacy Policy</h1>
      <p className="docs-lead">
        Your privacy matters. Our Privacy Policy explains what data we collect, how we use it, where it is stored, and your rights
        as a data subject under GDPR, CCPA, and India's DPDP Act 2023.
      </p>
      <h2>Key points at a glance</h2>
      <dl className="docs-glossary">
        <div className="docs-glossary__item">
          <dt>What we collect</dt>
          <dd>Account details (email, name), usage data (pipeline runs, API calls), and the data files you upload for processing.</dd>
        </div>
        <div className="docs-glossary__item">
          <dt>How we use it</dt>
          <dd>To provide the service, send transactional notifications (with your consent), enforce plan limits, and improve the product. We never sell your data.</dd>
        </div>
        <div className="docs-glossary__item">
          <dt>Where data is stored</dt>
          <dd>All data is stored on AWS infrastructure in the Asia Pacific (Mumbai) region. Data is encrypted in transit and at rest.</dd>
        </div>
        <div className="docs-glossary__item">
          <dt>Your rights</dt>
          <dd>You may access, correct, export, or delete your personal data at any time. Contact us at <a href="mailto:mitul.srivastava000@gmail.com">mitul.srivastava000@gmail.com</a> to exercise your rights.</dd>
        </div>
        <div className="docs-glossary__item">
          <dt>Cookies</dt>
          <dd>We use essential session cookies only. No advertising or tracking cookies are used.</dd>
        </div>
        <div className="docs-glossary__item">
          <dt>Third-party services</dt>
          <dd>We use Supabase (auth &amp; database), AWS S3 (storage), Razorpay (billing), and Resend (email). Each provider has their own privacy policy.</dd>
        </div>
      </dl>
      <div className="docs-callout docs-callout--info">
        This is a summary only. Read the full Privacy Policy for all details.
      </div>
      <a
        href="/privacy"
        target="_blank"
        rel="noreferrer"
        className="docs-legal-link"
      >
        Read full Privacy Policy →
      </a>
    </article>
  );
}

// ── Content router ─────────────────────────────────────────────
function DocContent({ page }: { page: string }) {
  switch (page) {
    case "welcome":      return <Welcome />;
    case "quickstart":   return <QuickStart />;
    case "concepts":     return <KeyConcepts />;
    case "projects":     return <WhatIsProject />;
    case "pipelines":    return <WhatIsPipeline />;
    case "ai-agent":     return <AiAgent />;
    case "data-ops":     return <DataOps />;
    case "artifacts":    return <WhatIsArtifact />;
    case "dashboards":     // legacy alias
    case "canvases":       return <WhatIsDashboard />;
    case "visualizations": return <WhatIsDashboard />;
    case "guide-start":  return <GuideStart />;
    case "guide-upload": return <GuideUpload />;
    case "guide-database": return <GuideDatabase />;
    case "guide-pipeline": return <GuidePipeline />;
    case "guide-schedule": return <GuideSchedule />;
    case "guide-dashboard": return <GuideDashboard />;
    case "guide-invite": return <GuideInvite />;
    case "guide-export": return <GuideExport />;
    case "faq":          return <Faq />;
    case "limits":       return <PlanLimits />;
    case "formats":      return <FileFormats />;
    case "shortcuts":    return <Shortcuts />;
    case "legal-terms":  return <LegalTerms />;
    case "legal-privacy": return <LegalPrivacy />;
    default:             return <Welcome />;
  }
}

// ── Main component ─────────────────────────────────────────────
export function DocsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const page = searchParams.get("page") ?? "welcome";

  const currentIdx = FLAT_PAGES.findIndex((p) => p.id === page);
  const prevPage = currentIdx > 0 ? FLAT_PAGES[currentIdx - 1] : null;
  const nextPage = currentIdx < FLAT_PAGES.length - 1 ? FLAT_PAGES[currentIdx + 1] : null;

  function goTo(id: string) {
    setSearchParams({ page: id });
    setSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const filteredSections: Section[] = query.trim()
    ? SECTIONS.map((s) => ({
        ...s,
        pages: s.pages.filter((p) => p.label.toLowerCase().includes(query.toLowerCase())),
      })).filter((s) => s.pages.length > 0)
    : SECTIONS;

  return (
    <div className="docs-root">
      {/* Top bar */}
      <header className="docs-topbar">
        <span className="docs-topbar__logo">
          <span className="docs-topbar__brand">DataHub</span>
          <span className="docs-topbar__docsLabel">Docs</span>
        </span>
        <button
          className="docs-topbar__back"
          aria-label="Back to app"
          onClick={() => navigate("/home")}
        >
          ← Back to app
        </button>
        <button
          className="docs-topbar__mobile-menu"
          aria-label="Toggle sidebar"
          onClick={() => setSidebarOpen((v) => !v)}
        >
          ☰
        </button>
      </header>

      {/* Body */}
      <div className="docs-body">
        {/* Sidebar */}
        <aside className={`docs-sidebar${sidebarOpen ? " docs-sidebar--open" : ""}`}>
          <div className="docs-sidebar__search">
            <input
              className="docs-sidebar__input"
              type="search"
              placeholder="Search docs…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <nav className="docs-nav">
            {filteredSections.map((section) => (
              <div key={section.label} className="docs-nav__section">
                <p className="docs-nav__section-label">{section.label}</p>
                {section.pages.map((p) => (
                  <button
                    key={p.id}
                    className={`docs-nav__item${p.id === page ? " docs-nav__item--active" : ""}`}
                    onClick={() => goTo(p.id)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            ))}
          </nav>
        </aside>

        {/* Content */}
        <main className="docs-content">
          <DocContent page={page} />

          {/* Prev / Next */}
          <div className="docs-prevnext">
            <div>
              {prevPage && (
                <button className="docs-prevnext__btn" onClick={() => goTo(prevPage.id)}>
                  <span className="docs-prevnext__label">← Previous</span>
                  <span className="docs-prevnext__title">{prevPage.label}</span>
                </button>
              )}
            </div>
            <div>
              {nextPage && (
                <button className="docs-prevnext__btn docs-prevnext__btn--next" onClick={() => goTo(nextPage.id)}>
                  <span className="docs-prevnext__label">Next →</span>
                  <span className="docs-prevnext__title">{nextPage.label}</span>
                </button>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
