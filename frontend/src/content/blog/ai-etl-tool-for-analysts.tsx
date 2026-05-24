import {
  Article, Lead, H2, H3, P, UL, LI, OL, Strong, Callout, CompareTable,
  MidCTA, FAQ,
} from "./_components";

export default function AiEtlToolForAnalysts() {
  return (
    <Article>
      <Lead>
        Traditional ETL tools were built by engineers, for engineers. They require pipelines written
        in Python or SQL, infrastructure teams to deploy them, and weeks of setup before any data
        moves. Analysts need something different — a tool that does the same work without the ticket
        queue, the codebase, or the three-week timeline.
      </Lead>

      <H2>What ETL actually means for analysts</H2>
      <P>
        ETL stands for Extract, Transform, Load. In practice, analysts do ETL constantly — they
        just don't call it that. Every time you:
      </P>
      <UL>
        <LI>Export a CSV from Salesforce and clean it before loading into a dashboard</LI>
        <LI>Download accounting exports and reshape them into a pivot-ready format</LI>
        <LI>Pull data from two systems and join them on a common key</LI>
        <LI>Run the same sequence of fixes every week before sending a report</LI>
      </UL>
      <P>…you're doing ETL. You're just doing it manually, in Excel, every single time.</P>
      <P>
        The reason traditional ETL tools haven't solved this is that they weren't designed for
        analysts. They were designed for data engineers who can write code and manage infrastructure.
        Analysts need a different kind of tool.
      </P>

      <H2>What makes a good AI ETL tool for analysts</H2>
      <P>
        The best ETL tool for analysts should do five things that traditional tools don't:
      </P>
      <OL>
        <LI>
          <Strong>Understand plain English.</Strong> You should be able to describe what you want —
          "join these two tables on customer ID and remove rows where revenue is null" — and get a
          correct, reviewable transformation without writing SQL.
        </LI>
        <LI>
          <Strong>Show every step transparently.</Strong> AI tools that produce results without
          showing their work are unusable in professional settings. Every transformation should be
          visible as SQL you can inspect, edit, or reject.
        </LI>
        <LI>
          <Strong>Handle messy real-world data.</Strong> Real exports have broken encodings, mixed
          date formats, merged header rows, and pseudo-nulls like "N/A" and "-". A good tool
          detects and fixes these automatically.
        </LI>
        <LI>
          <Strong>Be reusable.</Strong> If you run the same pipeline every week, it should run
          itself. No rebuilding it from scratch each time.
        </LI>
        <LI>
          <Strong>Require no infrastructure.</Strong> No Python environment. No cloud deployment.
          No data engineering ticket. Upload, transform, export.
        </LI>
      </OL>

      <H2>How DataHub works as an AI ETL tool</H2>
      <P>
        DataHub is built around these five principles. Here's what the workflow looks like in
        practice.
      </P>

      <H3>Extract: connect your data sources</H3>
      <P>
        Upload CSV, Excel, JSON, or Parquet files directly. Or connect live databases: PostgreSQL,
        MySQL, SQLite, MSSQL, Oracle, Snowflake, BigQuery, and Redshift are all supported. Data
        stays in your own account — it's never shared between users.
      </P>

      <H3>Transform: describe it in plain English</H3>
      <P>
        Type what you want in the chat. The AI agent translates your intent into a step-by-step
        transformation plan — shown to you as named pipeline steps with the underlying SQL — before
        anything runs.
      </P>

      <Callout type="tip">
        "Join the orders table with the customers table on customer_id. Remove any rows where
        revenue is null or zero. Aggregate by region and month. Export as CSV."
      </Callout>

      <P>
        If the request is ambiguous, the agent asks a clarifying question before producing a plan.
        It never silently assumes.
      </P>

      <H3>Load: export or push downstream</H3>
      <P>
        Download the result as CSV or Excel. Publish to a shared dashboard. Push directly to Power
        BI, Google Sheets, or Tableau via export. Or schedule the pipeline to run on a cadence and
        deliver the output automatically.
      </P>

      <MidCTA text="Try DataHub as your AI ETL tool — free, no credit card, no install." />

      <H2>DataHub vs. traditional ETL tools for analysts</H2>

      <CompareTable
        headers={["", "Traditional ETL (Informatica, Talend)", "Python / Pandas", "DataHub"]}
        rows={[
          ["Requires coding", "Yes (proprietary language)", "Yes (Python)", "No"],
          ["Time to first pipeline", "Days to weeks", "Hours to days", "Minutes"],
          ["Handles messy data automatically", "No", "Partial", "Yes"],
          ["Plain English interface", "No", "No", "Yes"],
          ["Every step visible as SQL", "No", "Partial", "Yes"],
          ["Reusable scheduled pipelines", "Yes", "Custom scripting", "Yes"],
          ["Price for solo analysts", "£10,000+/year", "Free (but dev time)", "Free plan available"],
        ]}
      />

      <H2>When to use DataHub vs. a data engineering tool</H2>
      <P>
        DataHub is the right choice when:
      </P>
      <UL>
        <LI>You're an analyst, accountant, or consultant — not a data engineer</LI>
        <LI>You need to move fast without a backlog or ticket queue</LI>
        <LI>The data sources are files or standard databases, not custom APIs</LI>
        <LI>The transformations are analytical — cleaning, joining, aggregating, formatting</LI>
        <LI>You want full visibility and auditability without writing SQL</LI>
      </UL>
      <P>
        A traditional ETL tool or custom Python pipeline makes more sense when you have complex
        real-time streaming requirements, custom API integrations, or a dedicated data engineering
        team.
      </P>

      <FAQ
        items={[
          {
            q: "Does DataHub replace dbt or Airflow?",
            a: "No. DataHub is designed for analysts doing analytical ETL — cleaning files, joining tables, scheduling reports. dbt and Airflow are engineering tools for large-scale production pipelines. They solve different problems at different scales.",
          },
          {
            q: "Can DataHub connect to Salesforce or HubSpot?",
            a: "DataHub connects to databases (PostgreSQL, MySQL, Snowflake, BigQuery, etc.) and file uploads. For SaaS tools like Salesforce, export your data as CSV and upload it. Native SaaS connectors are on the roadmap.",
          },
          {
            q: "What transformation operations does DataHub support?",
            a: "30+ built-in operations: null handling, type casting, deduplication (exact and fuzzy), column standardisation, filtering, aggregation, joins, pivots, date parsing, and more. You can also write custom SQL if needed.",
          },
          {
            q: "Is DataHub suitable for finance or accounting teams?",
            a: "Yes. Finance and accounting teams are among the heaviest users of analytical ETL. DataHub handles accounting software exports (QuickBooks, Tally, Xero), reconciliation workflows, and scheduled monthly reporting.",
          },
        ]}
      />
    </Article>
  );
}
