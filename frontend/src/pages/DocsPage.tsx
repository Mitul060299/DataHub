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
            In the AI panel, type a question like <em>"Show me total revenue by month"</em>. The AI will generate a pipeline step, run it, and return a
            result table or chart.
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
            A registered file or database connection that pipelines can read from. Supported sources include CSV, Excel, Parquet, JSON, and (coming soon)
            PostgreSQL, MySQL, Google Sheets, Snowflake, BigQuery.
          </dd>
        </div>
        <div className="docs-glossary__item">
          <dt>AI message</dt>
          <dd>
            Each time you send a prompt to the AI assistant (e.g. "filter rows where country = US"), that counts as one AI message. Monthly limits vary by
            plan; see Plan limits for details.
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
            <tr>
              <td><code>filter</code></td>
              <td>Keep rows matching a condition</td>
            </tr>
            <tr>
              <td><code>select</code></td>
              <td>Choose or rename columns</td>
            </tr>
            <tr>
              <td><code>aggregate</code></td>
              <td>Group by and compute metrics (sum, count, avg…)</td>
            </tr>
            <tr>
              <td><code>join</code></td>
              <td>Combine two datasets on matching keys</td>
            </tr>
            <tr>
              <td><code>sort</code></td>
              <td>Order rows by one or more columns</td>
            </tr>
            <tr>
              <td><code>enrich</code></td>
              <td>Add derived columns or call an external enrichment</td>
            </tr>
            <tr>
              <td><code>summarise</code></td>
              <td>Save a <code>CREATE TABLE AS SELECT</code> result as an artifact</td>
            </tr>
            <tr>
              <td><code>validate</code></td>
              <td>Assert data quality rules and surface failures</td>
            </tr>
          </tbody>
        </table>
      </div>
      <h2>Running a pipeline</h2>
      <p>
        Click <strong>Run</strong> to execute all steps in order. The pipeline creates a <em>pipeline run</em> record, executes each step, and saves any
        output as an artifact. Runs are shown in the Run history panel.
      </p>
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
          <strong>KPI card</strong> — single metric with optional delta and sparkline.
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
      <p className="docs-lead">Database connectors let you query live data from PostgreSQL, MySQL, and more — without exporting to CSV first.</p>
      <div className="docs-callout docs-callout--warn">
        <strong>Coming soon.</strong> Database connectors are not yet live. CSV and Excel uploads are available today. PostgreSQL and MySQL connectors are
        planned for the Team plan; Snowflake and BigQuery for Business.
      </div>
      <h2>Connector roadmap</h2>
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
              <td>Google Sheets</td>
              <td>—</td>
              <td>✅</td>
              <td>✅</td>
              <td>✅</td>
            </tr>
            <tr>
              <td>PostgreSQL</td>
              <td>—</td>
              <td>—</td>
              <td>🔜</td>
              <td>🔜</td>
            </tr>
            <tr>
              <td>MySQL</td>
              <td>—</td>
              <td>—</td>
              <td>🔜</td>
              <td>🔜</td>
            </tr>
            <tr>
              <td>Snowflake</td>
              <td>—</td>
              <td>—</td>
              <td>—</td>
              <td>🔜</td>
            </tr>
            <tr>
              <td>BigQuery</td>
              <td>—</td>
              <td>—</td>
              <td>—</td>
              <td>🔜</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Want to be notified when a specific connector ships?{" "}
        <a href="mailto:hello@datahub.org.in">Email us</a> or use the feedback form on the home page.
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
            In the AI chat panel, type what you want to do — e.g. <em>"Filter to rows where region = APAC, then group by month and sum revenue"</em>. The AI
            generates DuckDB SQL for each step.
          </p>
        </div>
      </div>
      <div className="docs-step">
        <div className="docs-step__number">4</div>
        <div className="docs-step__body">
          <h3>Review and run</h3>
          <p>
            Each generated step shows a preview of the output. Click <strong>Run pipeline</strong> to execute all steps in order and produce an artifact.
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
        <a href="mailto:hello@datahub.org.in">email us</a> for Enterprise API documentation.
      </p>
    </article>
  );
}

function Faq() {
  const faqs: { q: string; a: string }[] = [
    {
      q: "Does DataHub work with large files?",
      a: "Free plan supports files up to 50 MB. Paid plans support files up to 1 GB per upload. For larger datasets, contact us for Enterprise options or consider splitting your file into multiple uploads.",
    },
    {
      q: "What SQL dialect does DataHub use internally?",
      a: "DataHub uses DuckDB as its in-process query engine. It supports most ANSI SQL plus DuckDB-specific extensions like COLUMNS(), LIST aggregates, and friendly JSON functions. You don't need to know SQL — the AI handles query generation.",
    },
    {
      q: "Is my data secure?",
      a: "All data is encrypted in transit (TLS) and at rest (AES-256 on S3). Each workspace is isolated at the database and storage level — your data is never shared with or accessible by other workspaces. We are GDPR-compliant.",
    },
    {
      q: "Can I use DataHub for free?",
      a: "Yes. The Free plan lets you create 2 projects, upload files up to 50 MB, use 50 AI messages per month, and build 2 dashboards — with no credit card required.",
    },
    {
      q: "Is there an API?",
      a: "A REST API is available for Business and Enterprise plans. Contact hello@datahub.org.in for documentation and API keys.",
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
      <p className="docs-lead">All plans are billed monthly per workspace. There are no per-seat charges on Team or below.</p>

      <h2>Feature comparison</h2>
      <div className="docs-table-wrap">
        <table className="docs-table docs-table--plans">
          <thead>
            <tr>
              <th>Feature</th>
              <th>Free</th>
              <th>Pro ($79/mo)</th>
              <th>Team ($149/mo)</th>
              <th>Business ($399/mo)</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>Projects</td><td>2</td><td>Unlimited</td><td>Unlimited</td><td>Unlimited</td></tr>
            <tr><td>AI messages / mo</td><td>50</td><td>500</td><td>Unlimited</td><td>Unlimited</td></tr>
            <tr><td>Max file size</td><td>50 MB</td><td>1 GB</td><td>1 GB</td><td>1 GB</td></tr>
            <tr><td>Storage</td><td>1 GB</td><td>20 GB</td><td>100 GB</td><td>500 GB</td></tr>
            <tr><td>Team members</td><td>1</td><td>1</td><td>10</td><td>50</td></tr>
            <tr><td>Scheduled pipelines</td><td>—</td><td>5</td><td>20</td><td>Unlimited</td></tr>
            <tr><td>Dashboards</td><td>2</td><td>20</td><td>Unlimited</td><td>Unlimited</td></tr>
            <tr><td>Public sharing</td><td>—</td><td>—</td><td>✅</td><td>✅</td></tr>
            <tr><td>Audit log</td><td>—</td><td>—</td><td>✅</td><td>✅</td></tr>
            <tr><td>SSO / SAML</td><td>—</td><td>—</td><td>—</td><td>🔜</td></tr>
            <tr><td>DB connections</td><td>CSV, Excel</td><td>+ Google Sheets</td><td>+ PG, MySQL 🔜</td><td>+ Snowflake 🔜</td></tr>
            <tr><td>Support</td><td>Community</td><td>Email</td><td>Priority email</td><td>24/7 dedicated</td></tr>
          </tbody>
        </table>
      </div>

      <h2>Monthly usage quotas</h2>
      <div className="docs-table-wrap">
        <table className="docs-table docs-table--plans">
          <thead>
            <tr>
              <th>Quota</th>
              <th>Free</th>
              <th>Pro</th>
              <th>Team</th>
              <th>Business</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>AI calls</td><td>100</td><td>2,000</td><td>10,000</td><td>Unlimited</td></tr>
            <tr><td>Pipeline runs</td><td>10</td><td>200</td><td>1,000</td><td>Unlimited</td></tr>
            <tr><td>Dataset uploads</td><td>3</td><td>50</td><td>Unlimited</td><td>Unlimited</td></tr>
          </tbody>
        </table>
      </div>
      <div className="docs-callout docs-callout--info">
        INR pricing: Pro ₹3,299/mo · Team ₹6,199/mo · Business ₹16,599/mo. Billing is processed via Razorpay.
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
            <tr><td><code>.csv</code></td><td>Comma-separated values</td><td>UTF-8 and common encodings auto-detected</td></tr>
            <tr><td><code>.tsv</code></td><td>Tab-separated values</td><td>Treated same as CSV with tab delimiter</td></tr>
            <tr><td><code>.xlsx</code></td><td>Excel workbook</td><td>First sheet loaded by default; multi-sheet support planned</td></tr>
            <tr><td><code>.xls</code></td><td>Legacy Excel</td><td>Converted server-side; large files may be slow</td></tr>
            <tr><td><code>.parquet</code></td><td>Apache Parquet</td><td>Recommended for large datasets — fastest ingest</td></tr>
            <tr><td><code>.json</code></td><td>JSON / NDJSON</td><td>Newline-delimited JSON preferred; nested objects flattened</td></tr>
          </tbody>
        </table>
      </div>
      <h2>Encoding &amp; delimiter detection</h2>
      <p>
        CSV files are automatically probed for delimiter (comma, semicolon, pipe, tab) and encoding (UTF-8, Latin-1, Windows-1252). If auto-detection fails,
        you can override the delimiter in the upload dialog.
      </p>
      <h2>Multi-sheet Excel</h2>
      <p>
        Currently only the first sheet of an Excel workbook is loaded. Multi-sheet support is on the roadmap. As a workaround, export each sheet as a
        separate CSV.
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

// ── Content router ─────────────────────────────────────────────
function DocContent({ page }: { page: string }) {
  switch (page) {
    case "welcome":      return <Welcome />;
    case "quickstart":   return <QuickStart />;
    case "concepts":     return <KeyConcepts />;
    case "projects":     return <WhatIsProject />;
    case "pipelines":    return <WhatIsPipeline />;
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
