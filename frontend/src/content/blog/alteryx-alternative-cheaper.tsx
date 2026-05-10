import {
  Article, Lead, H2, H3, P, UL, LI, Strong, Callout,
  CompareTable, MidCTA, FAQ,
} from "./_components";

export default function AlteryxAlternativeCheaper() {
  return (
    <Article>
      <Lead>
        Alteryx Designer is genuinely powerful. It's also genuinely expensive — around $5,195 per
        seat per year in the US, with no free tier, no monthly billing option, and an enterprise
        sales process for everything. If you need the same capabilities at a fraction of the cost,
        you have more options than you might think.
      </Lead>

      <H2>What you're actually paying for with Alteryx</H2>
      <P>
        Alteryx sells four things: a visual workflow builder, a library of 300+ data connectors, an
        analytics engine that handles large datasets without SQL knowledge, and a brand that CIOs
        recognise. The annual licence funds all of that.
      </P>
      <P>
        The problem is that most analysts use about 15% of Alteryx's capabilities. They're loading
        files, cleaning data, joining tables, running aggregations, and exporting results. The 300+
        connectors and advanced spatial analytics go untouched. They're paying for enterprise
        infrastructure they don't need.
      </P>

      <H2>What to look for in an Alteryx alternative</H2>
      <UL>
        <LI>
          <Strong>Visual pipeline builder</Strong> — drag-and-drop or conversational interface for
          building transformation steps without writing SQL
        </LI>
        <LI>
          <Strong>Multi-source joins</Strong> — ability to combine data from different files and
          databases in one workflow
        </LI>
        <LI>
          <Strong>Data quality operations</Strong> — deduplication, null handling, type casting,
          column standardisation
        </LI>
        <LI>
          <Strong>Scheduling and automation</Strong> — run workflows on a schedule without manual
          intervention
        </LI>
        <LI>
          <Strong>Output flexibility</Strong> — export to CSV, connect to databases, feed into BI
          tools
        </LI>
        <LI>
          <Strong>Collaboration</Strong> — share workflows with team members without each person
          needing their own full licence
        </LI>
      </UL>

      <H2>Option 1: DataHub (best all-round Alteryx alternative)</H2>
      <P>
        DataHub is the closest functional equivalent to Alteryx Designer at a fraction of the cost.
        The core difference is the interface: instead of dragging tool boxes onto a canvas, you
        describe what you want in plain English and an AI agent builds the pipeline for you.
      </P>
      <P>
        The output is the same — a transparent, step-by-step transformation pipeline that you can
        inspect, edit, and re-run. But you get there 10x faster because you don't need to know which
        of 300+ tools to use.
      </P>
      <P>Key capabilities that match Alteryx's core use cases:</P>
      <UL>
        <LI>CSV, Excel, JSON, Parquet upload with auto-schema detection</LI>
        <LI>Database connectors: PostgreSQL, MySQL, Snowflake, BigQuery, Redshift, Azure Synapse</LI>
        <LI>Join, union, pivot, aggregate — all via natural language</LI>
        <LI>
          30+ data quality operations: deduplication, null filling, type casting, outlier detection,
          column renaming, validation rules
        </LI>
        <LI>Reconciliation: full outer join with variance columns, auto key detection</LI>
        <LI>Pipeline scheduling (cron-based, for database-connected sources)</LI>
        <LI>Team collaboration with shared projects and audit logging</LI>
      </UL>
      <Callout type="tip">
        DataHub Team plan: $179/month for 3 seats. That's about $716/seat/year — 86% cheaper than
        Alteryx Designer at $5,195/seat/year.
      </Callout>

      <MidCTA text="Try DataHub free — no credit card, no install, no enterprise sales call." />

      <H2>Option 2: Knime (free, open source, steeper learning curve)</H2>
      <P>
        KNIME is the most feature-complete free alternative to Alteryx. It has a visual workflow
        editor, hundreds of extensions, and handles large datasets well. The tradeoffs: it's a
        desktop application that requires installation, the interface is complex, and the learning
        curve is steep. For technical analysts comfortable with workflow tools, KNIME is excellent.
        For business analysts who want results fast, it's Alteryx-level complexity without the
        support.
      </P>

      <H2>Option 3: Trifacta / Google Dataprep (cloud, collaborative)</H2>
      <P>
        Trifacta (now Google Cloud Dataprep) is a cloud-based data preparation tool with a strong
        visual profiling interface. It's built for cloud data warehouses and integrates tightly with
        BigQuery. Pricing is consumption-based, which is cost-effective for occasional use but can
        get expensive for heavy workloads. Not a great fit for teams working primarily with flat
        files.
      </P>

      <H2>Option 4: Power Query in Excel/Power BI (free, Windows-only)</H2>
      <P>
        Power Query is Microsoft's built-in ETL tool, included in Excel and Power BI Desktop at no
        extra cost. For simple transformations on flat files, it's genuinely good. Limitations:
        Windows-only, no AI assistance, limited scheduling (Power BI Service only), and no
        collaboration without a Power BI Pro licence.
      </P>

      <H2>Full comparison</H2>
      <CompareTable
        colA="Alteryx Designer"
        colB="DataHub"
        rows={[
          {
            feature: "Price per seat/year",
            manual: "~$5,195 (US) / ~£4,000 (UK)",
            datahub: "~$716 on Team plan (86% cheaper)",
          },
          {
            feature: "Free tier",
            manual: "No",
            datahub: "Yes — 50 AI messages/month, up to 500MB",
          },
          {
            feature: "Installation required",
            manual: "Yes — 2GB Windows desktop app",
            datahub: "No — browser-based, any OS",
          },
          {
            feature: "AI-assisted pipeline building",
            manual: "Add-on: Intelligence Suite ($1,950/seat/yr extra)",
            datahub: "Included in all plans",
          },
          {
            feature: "Database connectors",
            manual: "300+ (many require add-ons)",
            datahub: "15+ most-used connectors included",
          },
          {
            feature: "Team collaboration",
            manual: "Requires Alteryx Server ($58k+/yr)",
            datahub: "Included from Team plan ($179/mo for 3 seats)",
          },
          {
            feature: "Setup time",
            manual: "Hours to days (install, licence, config)",
            datahub: "Under 1 minute (upload file, start chatting)",
          },
          {
            feature: "Audit logging",
            manual: "Enterprise only",
            datahub: "Included from Team plan",
          },
        ]}
      />

      <H2>When Alteryx is still the right choice</H2>
      <P>
        Alteryx remains the better choice in specific situations:
      </P>
      <UL>
        <LI>
          You need spatial analytics or geographic data processing at scale — Alteryx's spatial
          tools are still best-in-class
        </LI>
        <LI>
          You have exotic data connectors (SAP, Salesforce with complex config, mainframe systems)
          that only Alteryx supports
        </LI>
        <LI>
          Your organisation has an existing Alteryx Server deployment with workflows you can't
          migrate
        </LI>
        <LI>
          Procurement requires a vendor with SOC 2 Type II certification and enterprise SLAs —
          DataHub has RBAC, full audit logging, and encrypted storage; SOC 2 certification is in progress
        </LI>
      </UL>
      <P>
        For everything else — cleaning, joining, transforming, scheduling, and sharing data — a
        modern alternative is cheaper, faster to set up, and easier to use.
      </P>

      <FAQ
        items={[
          {
            q: "Can I migrate my existing Alteryx workflows to DataHub?",
            a: "DataHub doesn't import Alteryx .yxmd workflow files directly. However, because DataHub generates transparent SQL and named pipeline steps for every operation, recreating a workflow is typically straightforward. The AI agent can often reproduce a multi-step Alteryx workflow from a plain-English description in a few minutes.",
          },
          {
            q: "Does DataHub work for the same use cases as Alteryx — blending, prep, and output?",
            a: "Yes for the core cases. DataHub covers data ingestion (file upload + database connection), transformation (30+ operations), blending (joins across uploaded datasets), and output (CSV download, scheduled refresh for database-connected sources). Advanced Alteryx modules like predictive modelling, spatial analytics, and some enterprise connectors are not in scope.",
          },
          {
            q: "Is DataHub compliant for enterprise use?",
            a: "DataHub supports SSO/SAML, audit logging, RBAC, and encrypted storage at rest and in transit. SOC 2 certification is in progress. For regulated industries, the Enterprise plan adds a custom DPA and dedicated infrastructure.",
          },
          {
            q: "What's the minimum commitment — do I have to pay annually?",
            a: "DataHub bills monthly with no annual lock-in on Starter, Professional, and Team plans. You can cancel at any time. The free plan has no time limit.",
          },
        ]}
      />
    </Article>
  );
}
