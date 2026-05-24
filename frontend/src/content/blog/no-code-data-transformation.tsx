import {
  Article, Lead, H2, H3, P, UL, LI, OL, Strong, Callout, CompareTable,
  MidCTA, FAQ,
} from "./_components";

export default function NoCodeDataTransformation() {
  return (
    <Article>
      <Lead>
        For years, transforming data meant writing code. Python scripts, SQL queries, or at the very
        least, complex Excel formulas that broke every time a column moved. No-code data
        transformation changes that — analysts can now do the same work data engineers do, without
        a single line of code.
      </Lead>

      <H2>What no-code data transformation actually means</H2>
      <P>
        "No-code" is an overused word, but in the context of data transformation it has a specific
        meaning: you describe the result you want — in plain English or through a visual interface —
        and the tool generates the correct transformation logic for you.
      </P>
      <P>
        That's different from a low-code tool that still requires you to configure SQL blocks or
        understand transformation syntax. True no-code means:
      </P>
      <UL>
        <LI>"Remove all rows where revenue is blank" — and it does exactly that</LI>
        <LI>"Join the orders table with the customers table on customer ID" — and it handles the join</LI>
        <LI>"Standardise the date column to YYYY-MM-DD" — and it finds and normalises every format</LI>
      </UL>
      <P>
        The underlying transformation is usually SQL or a query plan. But you never have to write or
        read it unless you want to. The no-code layer sits on top.
      </P>

      <H2>What analysts are using no-code transformation for</H2>
      <P>
        The most common workflows where analysts are replacing manual Excel work with no-code
        transformation tools:
      </P>
      <UL>
        <LI>
          <Strong>Cleaning raw exports.</Strong> CRM exports, accounting software downloads, ad
          platform reports — all come out messy. Fixing nulls, trimming whitespace, normalising
          formats, removing blank rows.
        </LI>
        <LI>
          <Strong>Joining multiple data sources.</Strong> Matching customer records across two
          systems, enriching a sales table with product data, combining regional exports.
        </LI>
        <LI>
          <Strong>Aggregating for reporting.</Strong> Summing by region and month, calculating
          averages, pivoting rows into columns for a summary table.
        </LI>
        <LI>
          <Strong>Deduplicating.</Strong> Removing exact duplicates or near-duplicates caused by
          data entry inconsistencies.
        </LI>
        <LI>
          <Strong>Reshaping for downstream tools.</Strong> Getting data into the right format for
          Power BI, Tableau, or a finance system before upload.
        </LI>
      </UL>

      <H2>The problem with doing this in Excel</H2>
      <P>
        Excel is where most of this work currently lives. It's familiar, it's everywhere, and it
        works — until it doesn't.
      </P>
      <UL>
        <LI>
          <Strong>It doesn't scale.</Strong> Excel starts struggling at 100,000 rows. At 1 million
          rows, it crashes. No-code transformation tools run on a proper SQL engine with no row
          limits.
        </LI>
        <LI>
          <Strong>It's not reproducible.</Strong> A sequence of Excel steps — filter this column,
          paste-values-only, apply this formula — can't be replayed automatically. Every month,
          you do it again from scratch.
        </LI>
        <LI>
          <Strong>It's error-prone.</Strong> Manual steps introduce errors. A misaligned paste.
          A formula that didn't fill down properly. A filter you forgot to clear.
        </LI>
        <LI>
          <Strong>There's no audit trail.</Strong> Who changed what, and when? Excel doesn't know.
        </LI>
      </UL>

      <H2>How DataHub does no-code data transformation</H2>
      <P>
        DataHub gives analysts a plain-English interface on top of a proper SQL transformation
        engine. Here's what the workflow looks like:
      </P>
      <OL>
        <LI>
          <Strong>Upload your data.</Strong> CSV, Excel, JSON, Parquet, or connect a live database.
        </LI>
        <LI>
          <Strong>Describe what you want.</Strong> Type it in the chat — as naturally as you'd
          describe it to a colleague.
        </LI>
        <LI>
          <Strong>Review the plan.</Strong> The AI generates a step-by-step transformation plan
          with the underlying SQL visible. You approve, edit, or reject each step.
        </LI>
        <LI>
          <Strong>Run it.</Strong> The transformation executes on your data. You see the result
          immediately, with a row count and data preview.
        </LI>
        <LI>
          <Strong>Save it as a pipeline.</Strong> If this is a recurring task, save the steps.
          Next time, just re-upload the new file and run the pipeline — or schedule it to run
          automatically.
        </LI>
      </OL>

      <Callout type="tip">
        "Clean this export. Remove rows where Order ID is blank. Standardise the date column to
        ISO format. Trim whitespace from all text columns. Deduplicate on Order ID."
      </Callout>

      <MidCTA text="Try no-code data transformation free — no signup required to start." />

      <H2>No-code vs. low-code vs. writing SQL</H2>

      <CompareTable
        headers={["", "Excel / manual", "Low-code (Power Query, dbt)", "No-code (DataHub)"]}
        rows={[
          ["Requires coding or formulas", "Formulas needed", "Some SQL/M required", "No"],
          ["Handles messy real-world data", "Manual", "Partial", "Automatic"],
          ["Reusable / schedulable", "No", "Yes (with setup)", "Yes"],
          ["Scales beyond 100K rows", "No", "Yes", "Yes"],
          ["Every step auditable", "No", "Partial", "Yes — visible SQL"],
          ["Time to first result", "Minutes to hours", "Hours to days", "Minutes"],
        ]}
      />

      <H2>What no-code transformation doesn't replace</H2>
      <P>
        No-code tools are excellent for analytical ETL — the kind of work analysts do every day.
        They're not designed to replace:
      </P>
      <UL>
        <LI>Real-time streaming pipelines processing millions of events per second</LI>
        <LI>Complex custom business logic that requires application code</LI>
        <LI>Large-scale data warehouse orchestration (Airflow, dbt at scale)</LI>
      </UL>
      <P>
        For the vast majority of analyst workflows — cleaning files, joining sources, aggregating
        for reports, scheduling monthly refreshes — no-code transformation handles everything.
      </P>

      <FAQ
        items={[
          {
            q: "Is DataHub really no-code?",
            a: "Yes. You describe transformations in plain English and DataHub generates the SQL. You can see and edit the SQL if you want to, but you never have to write it.",
          },
          {
            q: "What if I need a transformation DataHub doesn't support natively?",
            a: "DataHub supports custom SQL steps. If you need a specific transformation that isn't in the 30+ built-in operations, you can write the SQL directly and add it as a pipeline step.",
          },
          {
            q: "How is this different from Power Query in Excel?",
            a: "Power Query requires you to understand M query language, manage connections manually, and works only on Windows. DataHub runs in the browser, uses plain English, handles much larger datasets, and supports scheduling and team collaboration.",
          },
          {
            q: "Does it work with databases, or just files?",
            a: "Both. DataHub connects to PostgreSQL, MySQL, Snowflake, BigQuery, Redshift, MSSQL, and Oracle — as well as CSV, Excel, JSON, and Parquet file uploads.",
          },
        ]}
      />
    </Article>
  );
}
