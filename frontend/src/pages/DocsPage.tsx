import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useSEO } from "../hooks/useSEO";
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
      { id: "welcome", label: "Welcome to datahub.org.in" },
      { id: "quickstart", label: "Quick Start" },
      { id: "guest-mode", label: "Try without signing in" },
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
      { id: "guide-upload", label: "Import data (CSV, Excel, JSON, Parquet)" },
      { id: "guide-database", label: "Connect a database" },
      { id: "guide-pipeline", label: "Build a pipeline" },
      { id: "guide-pipeline-edit", label: "Edit & re-run pipeline steps" },
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

// ── Per-page SEO descriptions ──────────────────────────────────
const PAGE_DESCRIPTIONS: Record<string, string> = {
  // Getting Started
  welcome:
    "Welcome to DataHub — the AI-powered data transformation tool for analysts. Learn what DataHub does, how it works, and how to get started for free.",
  quickstart:
    "Get started with DataHub in under 5 minutes. Upload a CSV or Excel file, let the AI clean it, and build your first pipeline — no signup required to try.",
  "guest-mode":
    "Try DataHub without creating an account. Upload a file, clean it, and run transformations instantly — no email, no credit card.",
  concepts:
    "Learn the core concepts behind DataHub: datasets, pipelines, AI agent, canvases, and how they work together to automate data transformation workflows.",
  // Core Features
  projects:
    "DataHub projects keep your datasets, pipelines, and dashboards organised. Learn how to create projects, invite team members, and manage your workspace.",
  pipelines:
    "Build reusable data pipelines in DataHub. Chain transformation steps — clean, join, filter, aggregate — save them once and schedule them to run automatically on fresh data.",
  "ai-agent":
    "Use DataHub's AI agent to clean Excel files, merge CSVs, remove duplicates, and transform data in plain English. Every step is visible SQL you review before it runs.",
  "data-ops":
    "30+ data transformation operations in DataHub: remove duplicates, fill nulls, standardize column names, merge datasets, filter rows, type casting, and more — without writing code.",
  artifacts:
    "DataHub artifacts are the outputs of pipeline runs — cleaned datasets, transformed tables, and exports. Learn how to manage, download, and reuse pipeline outputs.",
  canvases:
    "Build interactive dashboards in DataHub with drag-and-drop KPI tiles, charts, tables, and filters. Share with your team or publish a public link.",
  visualizations:
    "Explore the full visualisation library in DataHub: bar charts, line charts, scatter plots, heatmaps, KPI cards, pivot tables, and more — powered by your live data.",
  // How To Guides
  "guide-start":
    "Step-by-step: create your first DataHub project. Upload a file, explore your data, and run your first transformation in minutes.",
  "guide-upload":
    "How to import CSV, Excel, JSON, and Parquet files into DataHub. Handles messy headers, mixed types, multi-sheet Excel, and broken encodings automatically.",
  "guide-database":
    "Connect DataHub to PostgreSQL, MySQL, SQLite, MSSQL, Oracle, Snowflake, BigQuery, or Redshift. Query live databases without exporting to CSV first.",
  "guide-pipeline":
    "How to build a reusable data pipeline in DataHub. Chain transformation steps, review the generated SQL, and schedule the pipeline to run automatically.",
  "guide-pipeline-edit":
    "How to edit, re-run, and debug pipeline steps in DataHub. Modify individual steps, preview results, and re-execute without rebuilding the pipeline from scratch.",
  "guide-schedule":
    "Schedule a DataHub pipeline to run daily, weekly, or monthly. Automate Excel reconciliation, CSV cleanup, and reporting without touching a file manually.",
  "guide-dashboard":
    "Build a DataHub dashboard from scratch. Add charts, KPI tiles, filters, and tables. Connect to live pipeline outputs and share with your team.",
  "guide-invite":
    "Invite team members to your DataHub workspace. Assign roles, manage permissions, and collaborate on datasets, pipelines, and dashboards.",
  "guide-export":
    "Export and share DataHub results. Download as CSV or Excel, publish a dashboard link, push to Power BI or Google Sheets, or set up automated delivery.",
  // Reference
  faq:
    "Answers to common questions about DataHub: how the AI agent works, what pipelines do, data security, pricing, and how it compares to Excel, Power BI, and Alteryx.",
  limits:
    "Plan limits for DataHub: file upload sizes, row limits, AI messages per month, pipeline steps, number of projects, and database connections by plan tier.",
  formats:
    "Supported file formats in DataHub: CSV, Excel (.xlsx and .xls, including multi-sheet), JSON, Parquet, and direct database connections to 10+ database types.",
  shortcuts:
    "Keyboard shortcuts for DataHub: navigate faster, run pipelines, switch between views, and access common actions without reaching for the mouse.",
  // Legal
  "legal-terms":
    "DataHub Terms of Service: usage rules, account responsibilities, billing terms, intellectual property, and liability for the DataHub platform.",
  "legal-privacy":
    "DataHub Privacy Policy: how we collect, store, and protect your data. We never use customer data to train AI models. Full encryption and audit logging.",
};

const FALLBACK_DOCS_DESCRIPTION =
  "Step-by-step guides to upload data, connect databases, work with the AI agent, and build visual reusable pipelines on DataHub. Full reference and connector documentation.";

// ── Content components ─────────────────────────────────────────

function Welcome() {
  return (
    <article className="docs-article">
      <h1>Welcome to datahub.org.in</h1>
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
      <p className="docs-lead">Go from zero to your first insight in under five minutes — no account required.</p>

      <div className="docs-callout docs-callout--success">
        <strong>No sign-up needed.</strong> DataHub works fully in guest mode. Click <strong>Workspace</strong> in the top nav or visit{" "}
        <a href="/workspace">datahub.org.in/workspace</a> — you'll land directly inside the app as a guest. Sign up later only when you want to save
        your work permanently.
      </div>

      <div className="docs-step">
        <div className="docs-step__number">1</div>
        <div className="docs-step__body">
          <h3>Open the Workspace</h3>
          <p>
            Click <strong>Workspace</strong> in the top navigation bar. You'll see an empty three-panel layout: the left panel (Explorer), the centre
            (data canvas), and the right (AI Agent). No login required.
          </p>
          <p>
            If this is your first visit, a welcome modal will open with sample datasets to get you started in one click.
          </p>
        </div>
      </div>

      <div className="docs-step">
        <div className="docs-step__number">2</div>
        <div className="docs-step__body">
          <h3>Create a project</h3>
          <p>
            Click <strong>+ New project</strong> on the workspace home. Give it a name (e.g. <em>Sales Q1</em>). Projects are containers that hold your
            data sources, pipeline steps, and visualisations.
          </p>
        </div>
      </div>

      <div className="docs-step">
        <div className="docs-step__number">3</div>
        <div className="docs-step__body">
          <h3>Import your data</h3>
          <p>
            Click the <strong>+</strong> next to <strong>DATA</strong> in the left panel. The Import modal opens. Drag-and-drop a CSV, Excel, Parquet,
            or JSON file — or click a format button to browse. DataHub parses and previews the file instantly.
          </p>
          <p>
            Alternatively, try a sample: in the welcome modal pick one of the pre-loaded sample datasets and it will import automatically.
          </p>
        </div>
      </div>

      <div className="docs-step">
        <div className="docs-step__number">4</div>
        <div className="docs-step__body">
          <h3>Ask the AI a question</h3>
          <p>
            In the <strong>AI Agent</strong> panel on the right, type what you want — e.g.{" "}
            <em>"Show total revenue by month"</em> or <em>"Clean nulls and find the top 5 customers"</em>.
          </p>
          <p>
            The AI generates a step-by-step execution plan before touching your data. Click <strong>✓ Approve</strong> to run it, <strong>✎ Modify</strong>{" "}
            to tweak a step first, or <strong>✕ Reject</strong> to cancel.
          </p>
        </div>
      </div>

      <div className="docs-step">
        <div className="docs-step__number">5</div>
        <div className="docs-step__body">
          <h3>View results &amp; build a dashboard</h3>
          <p>
            The transformed data appears in the centre canvas. Click the chart icon on any result column to visualise it. Add charts to a dashboard
            by clicking <strong>Add to dashboard</strong>.
          </p>
        </div>
      </div>

      <div className="docs-step">
        <div className="docs-step__number">6</div>
        <div className="docs-step__body">
          <h3>Sign up to save your work (optional)</h3>
          <p>
            When you're ready to save permanently, click <strong>Sign up free</strong> in the top bar. All projects, datasets, and pipelines you
            created as a guest will be carried over to your new account automatically — nothing is lost.
          </p>
        </div>
      </div>

      <div className="docs-callout docs-callout--info">
        That's the full loop: open → import → analyse → visualise. Read on to learn how each piece works in depth.
      </div>
    </article>
  );
}

function GuestMode() {
  return (
    <article className="docs-article">
      <h1>Try without signing in</h1>
      <p className="docs-lead">
        DataHub lets you use the full product — projects, pipelines, AI agent, dashboards — without creating an account. Sign up only when you want to
        save your work permanently.
      </p>

      <h2>How it works</h2>
      <p>
        When you visit DataHub for the first time, a temporary <strong>guest session</strong> is automatically created in the background. This session
        behaves identically to a Free-plan account: you get your own project container, file storage, and AI message quota. Your session is kept alive for
        30 days in your browser's local storage.
      </p>

      <div className="docs-callout docs-callout--info">
        <strong>Nothing is lost on sign-up.</strong> When you create an account (email, Google, or GitHub), every project, dataset, and pipeline you
        created as a guest is automatically migrated to your new account.
      </div>

      <h2>Guest vs. registered account</h2>
      <div className="docs-table-wrap">
        <table className="docs-table">
          <thead>
            <tr>
              <th>Feature</th>
              <th>Guest session</th>
              <th>Free account (signed in)</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>Projects</td><td>2</td><td>2</td></tr>
            <tr><td>File import (CSV, Excel, JSON, Parquet)</td><td>✅</td><td>✅</td></tr>
            <tr><td>AI agent</td><td>✅ (50 msgs/month)</td><td>✅ (50 msgs/month)</td></tr>
            <tr><td>Pipeline builder</td><td>✅</td><td>✅</td></tr>
            <tr><td>Dashboards</td><td>✅</td><td>✅</td></tr>
            <tr><td>Data persists beyond 30 days</td><td>❌</td><td>✅</td></tr>
            <tr><td>Access from another device / browser</td><td>❌</td><td>✅</td></tr>
            <tr><td>Team collaboration</td><td>❌</td><td>❌ (upgrade required)</td></tr>
          </tbody>
        </table>
      </div>

      <h2>Signing up as a guest</h2>
      <p>
        When you're ready, click the <strong>Sign up free</strong> button in the top-right corner of the screen. Complete the sign-up form. Once
        confirmed, DataHub automatically links your guest work to your new account — you'll see all your projects and data exactly as you left them.
      </p>

      <h2>Signing in on a different device</h2>
      <p>
        Guest sessions are stored in your browser's <code>localStorage</code>. If you want access on another device or browser, you need to create a
        free account first — only then can you log in anywhere and see your data.
      </p>

      <h2>What happens after 30 days (guest)</h2>
      <p>
        Inactive guest accounts are cleaned up after 30 days. If you haven't signed up within that window, your projects and uploaded data will be
        removed. Sign up for free to keep everything permanently.
      </p>
    </article>
  );
}

function KeyConcepts() {
  return (
    <article className="docs-article">
      <h1>Key Concepts</h1>
      <p className="docs-lead">Three building blocks underpin everything in DataHub. Learn these and you'll understand how every feature fits together.</p>
      <dl className="docs-glossary">
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
            (via link) or restricted to project members.
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
            Before making any changes, the AI always presents a plan: a numbered list of steps with descriptions, estimated row counts, and the SQL for each step. For complex or multi-rule requests, one plan entry is generated per rule. Review it, then <strong>Approve</strong> to run all steps, <strong>Modify</strong> to change specific steps, or <strong>Reject</strong> to cancel.
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
          <h3>Open the home page</h3>
          <p>Click <strong>Home</strong> in the top navigation bar to see your projects.</p>
        </div>
      </div>
      <div className="docs-step">
        <div className="docs-step__number">2</div>
        <div className="docs-step__body">
          <h3>Click "New project"</h3>
          <p>Hit the <strong>+ New project</strong> button in the top-right corner of the home page.</p>
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
      <h1>Import data (CSV, Excel, JSON, Parquet)</h1>
      <p className="docs-lead">
        Uploading a file is the fastest way to get data into DataHub. Supported formats: CSV, TSV, Excel (.xlsx/.xls), JSON, Parquet. No sign-in
        required — guests can import files immediately.
      </p>

      <h2>Method 1 — left-panel import (most common)</h2>

      <div className="docs-step">
        <div className="docs-step__number">1</div>
        <div className="docs-step__body">
          <h3>Open the Workspace</h3>
          <p>
            Click <strong>Workspace</strong> in the top nav. If you have no project yet, click <strong>+ New project</strong> and give it a name.
            Then open the project so you see the three-panel workspace layout.
          </p>
        </div>
      </div>

      <div className="docs-step">
        <div className="docs-step__number">2</div>
        <div className="docs-step__body">
          <h3>Click the + button next to DATA</h3>
          <p>
            In the left <strong>Explorer</strong> panel, find the <strong>DATA</strong> section header. Click the <strong>+</strong> icon next to it.
            The Import Data Source modal opens.
          </p>
        </div>
      </div>

      <div className="docs-step">
        <div className="docs-step__number">3</div>
        <div className="docs-step__body">
          <h3>Choose your file type</h3>
          <p>
            Four large buttons appear: <strong>CSV</strong>, <strong>Excel</strong>, <strong>JSON</strong>, <strong>Parquet</strong>. Click the one
            matching your file — this sets the file-picker filter to show only the right extension. You can also <strong>drag and drop</strong> a file
            anywhere onto the modal and the type is detected automatically.
          </p>
        </div>
      </div>

      <div className="docs-step">
        <div className="docs-step__number">4</div>
        <div className="docs-step__body">
          <h3>Select or drop your file</h3>
          <p>A file-picker dialog opens. Select your file and click Open.</p>
          <ul>
            <li>
              <strong>CSV:</strong> Delimiter (comma, semicolon, tab, pipe, colon) and character encoding (UTF-8, Latin-1, Windows-1252…) are
              detected automatically — no configuration needed.
            </li>
            <li>
              <strong>Excel:</strong> If your workbook has multiple sheets you'll be prompted to pick one.
            </li>
            <li>
              <strong>JSON:</strong> Flat JSON arrays and newline-delimited JSON (NDJSON) are both supported. Nested objects are flattened
              automatically.
            </li>
            <li>
              <strong>Parquet:</strong> Recommended for large datasets — fastest ingest. Files above 50 MB use a direct-to-cloud upload path (no
              server buffering).
            </li>
          </ul>
        </div>
      </div>

      <div className="docs-step">
        <div className="docs-step__number">5</div>
        <div className="docs-step__body">
          <h3>Review the preview</h3>
          <p>
            DataHub parses the file and shows a column count and row count below the file name. If the wrong delimiter or encoding was detected, you'll
            see garbled column names — close the modal, check the file, and re-import. For CSV you can override the delimiter using the <strong>Custom
            delimiter</strong> field.
          </p>
        </div>
      </div>

      <div className="docs-step">
        <div className="docs-step__number">6</div>
        <div className="docs-step__body">
          <h3>Name your dataset (optional)</h3>
          <p>
            By default the dataset takes the file name without its extension. Enter a custom name in the <strong>Dataset name</strong> field at the top
            of the modal if you prefer something more descriptive (e.g. <em>Q1 Sales</em>).
          </p>
        </div>
      </div>

      <div className="docs-step">
        <div className="docs-step__number">7</div>
        <div className="docs-step__body">
          <h3>Confirm upload</h3>
          <p>
            Click <strong>Import dataset</strong>. A progress bar appears while the file is being processed. When it completes, the dataset appears
            in the left panel under DATA and is automatically selected in the centre canvas, showing the first 100 rows.
          </p>
        </div>
      </div>

      <h2>Method 2 — drag and drop into the window</h2>
      <p>
        Drag any supported file from your file explorer and drop it anywhere over the workspace window. The Import modal opens automatically with your
        file pre-loaded, ready to confirm.
      </p>

      <h2>Method 3 — sample datasets</h2>
      <p>
        When you first open the workspace, a welcome modal appears with pre-loaded sample datasets (retail sales, HR data, etc.). Click any sample to
        import it instantly — no file needed.
      </p>

      <h2>After import</h2>
      <p>Once a dataset is imported you can:</p>
      <ul>
        <li>Browse it in the <strong>Data</strong> tab (centre panel) — scroll, sort, and search columns.</li>
        <li>Ask the AI agent in the right panel to analyse, clean, or transform it.</li>
        <li>Build a pipeline step by step using the <strong>Pipeline</strong> tab.</li>
        <li>Download the raw import as CSV or Parquet via the <strong>Export</strong> button (top-right).</li>
      </ul>

      <div className="docs-callout docs-callout--warn">
        <strong>Size limits:</strong> Free plan — 50 MB per file, 500 MB total storage. Professional — 1 GB per file, 20 GB total. Parquet files
        above 50 MB use a direct upload path and bypass the 50 MB server limit on paid plans.
      </div>
    </article>
  );
}

function GuideDatabase() {
  return (
    <article className="docs-article">
      <h1>Connect a database</h1>
      <p className="docs-lead">
        Database connectors let you pull live data from PostgreSQL, MySQL, Snowflake, BigQuery, and more — directly into your pipeline without
        exporting to CSV first.
      </p>

      <div className="docs-callout docs-callout--info">
        <strong>Plan requirement.</strong> CSV and Excel uploads work on all plans including Free. Database connectors require a{" "}
        <strong>Professional</strong> plan or higher. Cloud warehouses (Snowflake, Redshift, BigQuery) require the <strong>Team</strong> plan.
      </div>

      <h2>Connector availability by plan</h2>
      <div className="docs-table-wrap">
        <table className="docs-table">
          <thead>
            <tr>
              <th>Connector</th>
              <th>Free</th>
              <th>Professional</th>
              <th>Team / Business</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>CSV / Excel / JSON / Parquet</td><td>✅</td><td>✅</td><td>✅</td></tr>
            <tr><td>PostgreSQL</td><td>—</td><td>✅</td><td>✅</td></tr>
            <tr><td>MySQL</td><td>—</td><td>✅</td><td>✅</td></tr>
            <tr><td>SQLite</td><td>—</td><td>✅</td><td>✅</td></tr>
            <tr><td>MSSQL (SQL Server)</td><td>—</td><td>✅</td><td>✅</td></tr>
            <tr><td>Oracle</td><td>—</td><td>✅</td><td>✅</td></tr>
            <tr><td>Snowflake</td><td>—</td><td>—</td><td>✅</td></tr>
            <tr><td>Redshift</td><td>—</td><td>—</td><td>✅</td></tr>
            <tr><td>BigQuery</td><td>—</td><td>—</td><td>✅</td></tr>
          </tbody>
        </table>
      </div>

      <h2>How to connect step by step</h2>

      <div className="docs-step">
        <div className="docs-step__number">1</div>
        <div className="docs-step__body">
          <h3>Open the Connectors panel</h3>
          <p>
            From the workspace, click the <strong>+</strong> icon next to <strong>DATA</strong> in the left panel. In the Import modal, click the{" "}
            <strong>Database</strong> tab (or look for the "Connect" option depending on your plan).
          </p>
          <p>
            Alternatively, go to <strong>Settings → Connectors</strong> from the top-right profile menu to manage all your saved connections.
          </p>
        </div>
      </div>

      <div className="docs-step">
        <div className="docs-step__number">2</div>
        <div className="docs-step__body">
          <h3>Choose your connector type</h3>
          <p>
            Select the database type from the list (PostgreSQL, MySQL, Snowflake, etc.). Each connector shows only the fields relevant to that
            database.
          </p>
        </div>
      </div>

      <div className="docs-step">
        <div className="docs-step__number">3</div>
        <div className="docs-step__body">
          <h3>Enter connection details</h3>
          <p>Fill in the connection fields. Typical fields for PostgreSQL / MySQL:</p>
          <ul>
            <li><strong>Host</strong> — e.g. <code>db.example.com</code> or <code>127.0.0.1</code></li>
            <li><strong>Port</strong> — defaults: PostgreSQL 5432, MySQL 3306, MSSQL 1433</li>
            <li><strong>Database</strong> — the database name to connect to</li>
            <li><strong>Username</strong> and <strong>Password</strong></li>
            <li><strong>SSL mode</strong> — required for most cloud databases (set to <em>require</em>)</li>
          </ul>
          <p>For <strong>Snowflake</strong>: account identifier, warehouse, role, database, schema, username, password.</p>
          <p>For <strong>BigQuery</strong>: upload your service account JSON key file.</p>
          <div className="docs-callout docs-callout--warn">
            Credentials are encrypted at rest with AES-256 and are never stored in plaintext. DataHub connects outbound — you do not need to
            open inbound firewall ports to DataHub's IP.
          </div>
        </div>
      </div>

      <div className="docs-step">
        <div className="docs-step__number">4</div>
        <div className="docs-step__body">
          <h3>Choose connection type — Import or DirectQuery</h3>
          <p>
            After entering credentials, choose how DataHub will use this connection. Two options appear (like Power BI's Import vs DirectQuery):
          </p>
          <div className="docs-table-wrap">
            <table className="docs-table">
              <thead><tr><th></th><th>⬇ Import</th><th>⚡ DirectQuery</th></tr></thead>
              <tbody>
                <tr><td><strong>What happens</strong></td><td>Full table copy stored in DataHub (Parquet in S3)</td><td>Only a 500-row preview is stored; no full copy</td></tr>
                <tr><td><strong>Query speed</strong></td><td>Fast — runs locally on DataHub's DuckDB engine</td><td>Depends on source DB latency</td></tr>
                <tr><td><strong>Data freshness</strong></td><td>Snapshot at import time — re-import to refresh</td><td>Always queries the live source</td></tr>
                <tr><td><strong>Pipeline steps</strong></td><td>Run locally against the stored copy</td><td>Pushed down to your source DB via query folding</td></tr>
                <tr><td><strong>Best for</strong></td><td>Static tables, repeated analysis, large datasets</td><td>Frequently updated tables, regulated data, real-time dashboards</td></tr>
              </tbody>
            </table>
          </div>
          <p>
            The mode is fixed when you connect. To change it, delete the dataset and reconnect with the other option.
          </p>
        </div>
      </div>

      <div className="docs-step">
        <div className="docs-step__number">5</div>
        <div className="docs-step__body">
          <h3>Test the connection</h3>
          <p>
            Click <strong>Test connection</strong>. DataHub makes a lightweight probe query. A green tick confirms the credentials work. A red error
            shows the exact database error message — check host, port, and SSL settings if it fails.
          </p>
        </div>
      </div>

      <div className="docs-step">
        <div className="docs-step__number">6</div>
        <div className="docs-step__body">
          <h3>Browse and connect tables</h3>
          <p>
            Click <strong>Save &amp; browse tables</strong> (Import) or <strong>Connect &amp; browse tables</strong> (DirectQuery). A list of all
            tables in your database appears. Click <strong>Load</strong> (Import) or <strong>Connect</strong> (DirectQuery) next to each table you
            want to add as a dataset.
          </p>
          <p>
            Connected tables appear in the left panel under DATA with the appropriate badge: a format badge (e.g. <code>parquet</code>) for Import
            mode, or a green <strong>⚡ LIVE</strong> badge for DirectQuery mode.
          </p>
        </div>
      </div>

      <div className="docs-step">
        <div className="docs-step__number">7</div>
        <div className="docs-step__body">
          <h3>After connecting</h3>
          <p>
            <strong>Import:</strong> DataHub copies all rows, stores them as Parquet, and registers the dataset. Use a scheduled pipeline to
            re-import on a regular cadence — see <em>Schedule a pipeline</em> in the How To Guides.
          </p>
          <p>
            <strong>DirectQuery:</strong> A 500-row preview is stored for the AI agent and schema inference. Every pipeline run pushes SQL to your
            source database. Each step's output is saved as a Parquet snapshot in the Artifacts panel.
          </p>
        </div>
      </div>

      <h2>Saving a connection for reuse</h2>
      <p>
        After a successful test, tick <strong>Save this connection</strong> and give it a name (e.g. <em>Production Postgres</em>). Saved connections
        appear in <strong>Settings → Connectors</strong> and can be reused across projects without re-entering credentials.
      </p>

      <h2>Need help?</h2>
      <p>
        <a href="mailto:mitul.srivastava000@gmail.com">Email us</a> or use the in-app feedback button. Include your connector type and the exact
        error message for fastest resolution.
      </p>
    </article>
  );
}
function GuidePipeline() {
  return (
    <article className="docs-article">
      <h1>Build a pipeline</h1>
      <p className="docs-lead">
        A pipeline is a sequence of transformation steps that turn raw data into clean, structured results. You build it by describing what you want in
        plain English — the AI generates the SQL and runs it. No code required.
      </p>

      <h2>Opening the pipeline view</h2>
      <p>
        From the workspace, select a dataset in the left panel (under DATA). The centre panel shows a row of tabs:{" "}
        <strong>Data</strong> (raw table), <strong>Pipeline</strong> (step list), <strong>History</strong> (past runs), and <strong>Schedule</strong>. Click
        the <strong>Pipeline</strong> tab to see the step builder.
      </p>

      <h2>Step 1 — Describe a transformation</h2>
      <p>
        In the <strong>AI Agent</strong> panel on the right, type what you want to do — for example:
      </p>
      <ul>
        <li><em>"Remove rows where country is null"</em></li>
        <li><em>"Group by region and sum revenue"</em></li>
        <li><em>"Clean the data: fix nulls, remove duplicates, parse the date column"</em></li>
      </ul>
      <p>
        The AI classifies your intent, resolves the table name, and generates a numbered execution plan with one entry per operation. The plan shows a
        plain-English description and the SQL for each step.
      </p>

      <h2>Step 2 — Review the plan</h2>
      <p>Three buttons appear on the plan card:</p>
      <ul>
        <li>
          <strong>✓ Approve</strong> — runs all steps immediately. A live progress indicator updates as each step completes.
        </li>
        <li>
          <strong>✎ Modify</strong> — opens a text field inside the plan card. Describe your change (e.g. <em>"Add a dedup step before the filter"</em>).
          Press Enter. The current plan turns red and a revised plan is generated. You can modify as many times as needed.
        </li>
        <li>
          <strong>✕ Reject</strong> — discards the plan without running anything.
        </li>
      </ul>

      <h2>Step 3 — Results appear in the Data tab</h2>
      <p>
        After approval, the transformed data appears in the <strong>Data</strong> tab. The Pipeline tab shows each completed step with its row count. The
        result is saved as an in-memory session view — click <strong>Save as artifact</strong> to persist it permanently.
      </p>

      <h2>Step 4 — Add more steps</h2>
      <p>
        Keep asking questions in the AI panel. Each approved plan appends new steps to the pipeline. Steps chain automatically: each step reads from the
        output of the previous one.
      </p>

      <h2>Step 5 — Save as artifact</h2>
      <p>
        When the result looks right, click <strong>Save as artifact</strong> (or the save icon in the Pipeline tab). The artifact is stored as Parquet in
        S3, versioned, and can be pinned to a dashboard or used as input to another pipeline.
      </p>

      <div className="docs-callout docs-callout--info">
        See <strong>Edit &amp; re-run pipeline steps</strong> in the How To Guides to learn how to modify individual steps, delete steps, and re-run from a
        specific point.
      </div>
    </article>
  );
}

function GuidePipelineEdit() {
  return (
    <article className="docs-article">
      <h1>Edit &amp; re-run pipeline steps</h1>
      <p className="docs-lead">
        After building a pipeline you can modify individual steps, delete steps, insert new ones between existing ones, and re-run from any point.
      </p>

      <h2>Viewing existing steps</h2>
      <p>
        Open a dataset and click the <strong>Pipeline</strong> tab in the centre panel. You'll see a numbered list of all steps. Each step shows its
        type, a description, and the row count after that step ran.
      </p>

      <h2>Editing a step description</h2>
      <div className="docs-step">
        <div className="docs-step__number">1</div>
        <div className="docs-step__body">
          <h3>Click a step to expand it</h3>
          <p>Click any step row to expand the detail view. You'll see the full description and the generated SQL.</p>
        </div>
      </div>
      <div className="docs-step">
        <div className="docs-step__number">2</div>
        <div className="docs-step__body">
          <h3>Edit via the AI panel</h3>
          <p>
            In the AI panel on the right, type what you want to change — e.g. <em>"Change step 2 to group by month instead of week"</em>. The AI
            regenerates the affected step's SQL and presents a new plan for approval.
          </p>
        </div>
      </div>

      <h2>Deleting a step</h2>
      <p>
        Click the step row to expand it, then click the <strong>✕ Delete step</strong> button (or the trash icon). Steps that depended on the deleted
        step are automatically re-numbered. Re-run the pipeline after deleting to recalculate downstream results.
      </p>

      <h2>Inserting a step between existing steps</h2>
      <p>
        In the AI panel, tell the agent where to insert — e.g.{" "}
        <em>"After step 1 (filter), add a deduplication step, then continue with step 2 (group by)"</em>. The agent generates a plan that includes the
        insertion and presents it for approval. Existing step numbers shift automatically.
      </p>

      <h2>Re-running from a specific step</h2>
      <p>
        Click the step you want to re-run from, then click <strong>Re-run from here</strong> (the play icon next to the step). All steps from that point
        forward are re-executed against the output of the preceding step. Steps before the selected one are not re-run.
      </p>
      <div className="docs-callout docs-callout--warn">
        Re-running from an earlier step discards the cached results of all later steps. If you have unsaved artifacts from those steps, save them first.
      </div>

      <h2>Re-running the entire pipeline</h2>
      <p>
        Click <strong>Run all</strong> (the ▶ button at the top of the Pipeline tab). All steps run in order from step 1. Useful after changing the
        source data or when re-importing a fresh dataset snapshot.
      </p>

      <h2>Undoing a step (Replay)</h2>
      <p>
        If you want to go back to the data before a particular step ran, click <strong>Preview original</strong> in the toolbar to see the unmodified
        source data. To permanently roll back, delete the unwanted steps and re-run.
      </p>

      <h2>Editing custom SQL steps</h2>
      <p>
        Steps with type <code>custom</code> contain hand-written SQL. Expand the step to see the full SQL. Click <strong>Edit SQL</strong> to open an
        inline code editor, modify the query, then click <strong>Save &amp; re-run</strong> to apply the change.
      </p>
      <p>
        Reference the current dataset in custom SQL as <code>{"{{dataset}}"}</code>:
      </p>
      <pre className="docs-codeblock">{`SELECT region, SUM(revenue) AS total
FROM {{dataset}}
WHERE status = 'closed'
GROUP BY region
ORDER BY total DESC`}</pre>
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
      <p className="docs-lead">Collaborate with colleagues by inviting them to your project.</p>
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
            The invitee receives an email. Once they click <strong>Accept invitation</strong> and sign up, they appear in your project as a member with
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
      q: "Do I need to create an account to use DataHub?",
      a: "No. DataHub gives you a full guest session immediately — no sign-up, no credit card. You can import files, build pipelines, use the AI agent, and create dashboards without registering. Sign up only when you want to keep your work permanently or access it from another device.",
    },
    {
      q: "What happens to my work if I close the browser without signing up?",
      a: "Your guest session is stored in your browser's localStorage for 30 days. If you reopen DataHub in the same browser within 30 days, your session is automatically restored and all your data is still there. If you want to access your work from a different device or browser, create a free account first — everything migrates automatically.",
    },
    {
      q: "My file import failed with an error — what should I do?",
      a: "Check three things: (1) File format — make sure the extension matches the format you selected (CSV, Excel, JSON, or Parquet). (2) File size — Free plan supports up to 50 MB per file. (3) Encoding — if you see garbled characters, try saving your CSV as UTF-8 in Excel before re-uploading. If the problem persists, email mitul.srivastava000@gmail.com with the file name and the exact error message.",
    },
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
      a: "All data is encrypted in transit (TLS) and at rest (AES-256 on S3). Each account is isolated at the database and storage level — your data is never shared with or accessible by other accounts. We are GDPR-compliant.",
    },
    {
      q: "Can I use DataHub for free?",
      a: "Yes. The Free plan lets you create 2 projects, upload files up to 50 MB, use 50 AI messages per month — with no credit card required.",
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
      <p className="docs-lead">All plans are billed monthly <strong>per account</strong>. Solo projects draw from the project owner's quota; shared projects draw from the project owner's quota too — invited members consume the owner's allowance.</p>

      <h2>Feature comparison</h2>
      <div className="docs-table-wrap">
        <table className="docs-table docs-table--plans">
          <thead>
            <tr>
              <th>Feature</th>
              <th>Free</th>
              <th>Starter ($19/mo)</th>
              <th>Professional ($79/mo)</th>
              <th>Team ($179/mo)</th>
              <th>Business ($349/mo)</th>
              <th>Enterprise (from $1,500/mo, 5+ seats)</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>Collaborative projects</td><td>0</td><td>0</td><td>0</td><td>5</td><td>Unlimited</td><td>Unlimited</td></tr>
            <tr><td>Members per project</td><td>1</td><td>1</td><td>1</td><td>10</td><td>50</td><td>Unlimited</td></tr>
            <tr><td>Projects (total)</td><td>2</td><td>5</td><td>20</td><td>Unlimited</td><td>Unlimited</td><td>Unlimited</td></tr>
            <tr><td>AI messages / month</td><td>50</td><td>500</td><td>1,500</td><td>4,000+</td><td>15,000+</td><td>Negotiated</td></tr>
            <tr><td>Max file size</td><td>50 MB</td><td>250 MB</td><td>1 GB</td><td>5 GB</td><td>10 GB</td><td>Unlimited</td></tr>
            <tr><td>Storage</td><td>500 MB</td><td>5 GB</td><td>20 GB</td><td>100 GB+</td><td>500 GB+</td><td>Custom</td></tr>
            <tr><td>Data scan / month</td><td>5 GB</td><td>25 GB</td><td>100 GB</td><td>500 GB+</td><td>2 TB+</td><td>Negotiated</td></tr>
            <tr><td>DB connections</td><td>CSV, Excel</td><td>+ JSON, SQLite</td><td>+ PG, MySQL, MSSQL, Oracle, S3/GCS/Azure</td><td>+ Snowflake, Redshift, BigQuery</td><td>+ Custom connectors</td><td>All</td></tr>
            <tr><td>Scheduling</td><td>—</td><td>✅ daily</td><td>✅</td><td>✅</td><td>✅</td><td>✅</td></tr>
            <tr><td>Dashboard sharing</td><td>—</td><td>✅</td><td>✅</td><td>✅</td><td>✅</td><td>✅</td></tr>
            <tr><td>Audit log</td><td>—</td><td>—</td><td>—</td><td>✅</td><td>✅</td><td>✅</td></tr>
            <tr><td>Webhooks</td><td>—</td><td>—</td><td>—</td><td>—</td><td>✅</td><td>✅</td></tr>
            <tr><td>SSO / SAML</td><td>—</td><td>—</td><td>—</td><td>—</td><td>✅</td><td>✅</td></tr>
            <tr><td>Support</td><td>Community</td><td>Email</td><td>Email</td><td>Priority email</td><td>24/7 dedicated</td><td>Custom SLA</td></tr>
          </tbody>
        </table>
      </div>

      <h2>Billing attribution</h2>
      <p>Usage inside a <strong>collaborative project</strong> (AI calls, pipeline runs, data scanned) is charged to the <strong>project owner's</strong> account — not the calling member's. A Free-tier user invited into a Team project uses the Team owner's quota.</p>

      <div className="docs-callout docs-callout--info">
        INR pricing: Starter ₹999/mo · Professional ₹3,999/mo · Team ₹8,999/mo (3 seats incl, +₹1,499/extra) · Business ₹17,999/mo (5 seats incl, +₹2,499/extra) · Enterprise custom. Billing is processed via Razorpay.
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
      <p>
        The agent automatically determines whether your input is a <strong>single operation</strong> or a <strong>multi-step goal</strong>:
      </p>
      <ul>
        <li>
          <strong>Single operation</strong> — e.g. <em>"replace nulls in the revenue column with 0"</em>. The agent presents one plan card with one SQL
          step. Approve to run it.
        </li>
        <li>
          <strong>Multi-step goal</strong> — e.g. pasting multiple business rules, or typing something like <em>"clean the nulls, find the top 5
          customers by revenue, and create a bar chart"</em>. The agent builds a numbered multi-step plan — one card entry per rule, each with its
          own SQL — and presents all of them together for a single approval. After you approve, the steps run in the correct dependency order
          automatically.
        </li>
      </ul>
      <p>You do not need to switch any mode or toggle. The agent decides based on your input.</p>

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
            <tr><td><code>goal</code></td><td>Multiple rules or steps described together — the agent builds a multi-step plan, one entry per rule, each with its own SQL and correct execution order</td></tr>
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
        estimated row count, and the SQL that will run. For multi-rule inputs the plan contains one entry per rule — you see every SQL query up
        front. Three actions are available:
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
        When a multi-step goal contains independent outputs — e.g. <em>"clean the data, then summarise revenue by region AND by product"</em> — the
        agent generates a <strong>branching pipeline</strong>:
      </p>
      <ul>
        <li>Step 1 (clean) feeds into both Step 2 (region summary) and Step 3 (product summary).</li>
        <li>Steps 2 and 3 are independent of each other and run in dependency order after Step 1.</li>
        <li>The Pipeline panel renders a visual node graph showing the fork, with one arrow per dependent step.</li>
      </ul>
      <p>
        The same Approve / Modify / Reject controls apply. A single approval runs the entire branching plan in the correct order. Each branch
        produces its own output table visible in the Pipeline panel.
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
    case "guide-pipeline-edit": return <GuidePipelineEdit />;
    case "guest-mode":   return <GuestMode />;
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

  const pageLabel = FLAT_PAGES.find((p) => p.id === page)?.label ?? "Documentation";
  const docsCanonical = `https://datahub.org.in/docs${page !== "welcome" ? `?page=${page}` : ""}`;

  // Find the section this page belongs to (for breadcrumbs)
  const sectionLabel =
    SECTIONS.find((s) => s.pages.some((p) => p.id === page))?.label ?? "DOCUMENTATION";

  const breadcrumbLd = useMemo(() => {
    const items: Array<Record<string, unknown>> = [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: "https://datahub.org.in/",
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Documentation",
        item: "https://datahub.org.in/docs",
      },
    ];
    if (page !== "welcome") {
      items.push({
        "@type": "ListItem",
        position: 3,
        name: sectionLabel
          .toLowerCase()
          .replace(/\b\w/g, (c) => c.toUpperCase()),
      });
      items.push({
        "@type": "ListItem",
        position: 4,
        name: pageLabel,
        item: docsCanonical,
      });
    }
    return {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: items,
    };
  }, [page, pageLabel, sectionLabel, docsCanonical]);

  useSEO({
    title: `${pageLabel} – DataHub Documentation`,
    description: PAGE_DESCRIPTIONS[page] ?? FALLBACK_DOCS_DESCRIPTION,
    canonical: docsCanonical,
    structuredData: breadcrumbLd,
  });

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
          <img src="/logo.png" alt="" width={28} height={28} style={{ display: "block" }} />
          <span className="docs-topbar__brand">datahub.org.in</span>
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
