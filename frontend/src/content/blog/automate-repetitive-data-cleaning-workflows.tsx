import {
  Article, Lead, H2, H3, P, UL, LI, OL, Strong, Callout, InlineCode,
  CompareTable, MidCTA, FAQ,
} from "./_components";

export default function AutomateRepetitiveDataCleaningWorkflows() {
  return (
    <Article>
      <Lead>
        Every week: download the file, open it in Excel, remove the first three rows, trim the
        whitespace, fill the nulls, rename the columns, remove duplicates, export. Then do it again
        next week. If you're doing the same data cleaning steps repeatedly, you're not working —
        you're running a pipeline manually. Here's how to automate it.
      </Lead>

      <H2>Identifying what's worth automating</H2>
      <P>
        Not every cleaning task needs to be automated. One-off, complex, judgement-heavy data
        quality work is best done manually where the nuance can be applied. What's worth automating
        is the <Strong>repeatable, predictable, mechanical</Strong> work:
      </P>
      <UL>
        <LI>The same file format arrives on a schedule (weekly export, monthly report, daily feed)</LI>
        <LI>The cleaning steps are the same every time (strip whitespace, fill nulls, cast types)</LI>
        <LI>The output format is consistent (same destination, same structure)</LI>
        <LI>The process requires no human judgment about individual rows</LI>
      </UL>
      <P>
        If you can document the steps in a numbered list, you can automate them. The question is
        which tool to use.
      </P>

      <H2>Why manual pipelines break down</H2>
      <P>
        Analysts who do this work manually aren't doing it because they prefer it. They're doing it
        because the alternatives have historically required engineering skills. The conventional
        options for automation were:
      </P>
      <UL>
        <LI>
          <Strong>Python scripts</Strong> — powerful, but requires programming knowledge and
          maintenance as schemas change
        </LI>
        <LI>
          <Strong>Excel macros / VBA</Strong> — fragile, difficult to version-control, breaks on
          new machines
        </LI>
        <LI>
          <Strong>Power Query refresh</Strong> — Windows-only, requires Power BI Service for
          scheduling, path-dependent
        </LI>
        <LI>
          <Strong>Alteryx workflows</Strong> — excellent, but expensive and technically complex to
          set up
        </LI>
      </UL>
      <P>
        Each option has a barrier: either it requires code, or it requires an enterprise licence, or
        it only works in specific environments. The gap between "I know what I want to automate" and
        "I can actually automate it" has been wide for business analysts.
      </P>

      <H2>Building a reusable cleaning pipeline in DataHub</H2>
      <P>
        DataHub closes this gap by recording every cleaning step as a named pipeline that can be
        re-run on any new file.
      </P>

      <H3>Step 1: Upload your first file and describe the cleaning steps</H3>
      <P>
        Upload a representative file — the same format you'll receive each week. Then describe what
        needs to happen:
      </P>
      <Callout type="tip">
        "Every week I get this file. I need to: skip the first two rows (they're a title block),
        standardise all column names to snake_case, fill nulls in the revenue column with zero,
        parse the order_date column as a date, remove duplicate rows based on order_id, and export
        the result as a CSV."
      </Callout>
      <P>
        DataHub's AI agent builds each step in the pipeline sequentially, shows you the result
        after each one, and lets you confirm or adjust before proceeding.
      </P>

      <H3>Step 2: Review the pipeline</H3>
      <P>
        After building the steps, you see the complete pipeline as a list of named operations:
      </P>
      <OL>
        <LI><InlineCode>skip_rows</InlineCode> — skip first 2 rows</LI>
        <LI><InlineCode>rename_snake_case</InlineCode> — standardise all column names</LI>
        <LI><InlineCode>fill_nulls</InlineCode> — revenue → 0</LI>
        <LI><InlineCode>parse_dates</InlineCode> — order_date, format DD/MM/YYYY</LI>
        <LI><InlineCode>deduplicate_by_column</InlineCode> — key: order_id, keep: last</LI>
        <LI>Export as CSV</LI>
      </OL>
      <P>
        Each step is inspectable and editable. You can add, remove, or reorder steps. The pipeline
        is saved to the project with a name you choose.
      </P>

      <H3>Step 3: Re-run on next week's file</H3>
      <P>
        When the next file arrives, upload it to the same project and select the pipeline. All six
        steps run automatically on the new file. If the schema hasn't changed, you have a clean
        output in seconds without touching any of the steps.
      </P>

      <H3>Step 4: Schedule it (optional)</H3>
      <P>
        If the file arrives from a database source rather than a manual upload, you can connect
        DataHub directly to the database and schedule the pipeline to run automatically. The cleaned
        output is written back to a destination table or exported on the schedule you set.
      </P>

      <MidCTA text="Build your first reusable cleaning pipeline — free, no install needed." />

      <H2>Handling schema changes in automated pipelines</H2>
      <P>
        The most common failure mode for automated data pipelines is an upstream schema change: a
        column is renamed, a new column is added, a date format changes. The pipeline breaks
        silently and the analyst discovers it when output is missing or wrong.
      </P>
      <P>
        DataHub handles this in two ways:
      </P>
      <UL>
        <LI>
          <Strong>Schema drift detection:</Strong> When a new file is uploaded, DataHub compares its
          schema to the expected schema from the last successful run. If columns are missing, renamed,
          or have changed types, it flags the change before running the pipeline.
        </LI>
        <LI>
          <Strong>Fuzzy column matching:</Strong> If a column has been renamed (e.g.{" "}
          <InlineCode>CustomerID</InlineCode> → <InlineCode>customer_id</InlineCode>), the fuzzy
          schema comparison suggests the likely mapping and asks you to confirm before proceeding.
        </LI>
      </UL>

      <H2>Adding validation to your pipeline</H2>
      <P>
        A cleaning pipeline that runs without errors isn't the same as a pipeline that produces
        correct output. Add validation steps to catch data quality issues in the output before they
        reach the downstream report or database:
      </P>
      <Callout type="tip">
        "After cleaning, validate that: revenue is always greater than zero, order_date is never in
        the future, order_id is unique, and the product_category column contains only values in
        [Electronics, Apparel, Home, Food]."
      </Callout>
      <P>
        DataHub's <InlineCode>validate_rules</InlineCode> step runs these checks and produces a
        validation report: rows that passed, rows that failed, and which rule failed on each row.
        You can configure whether failing rows are flagged (kept with a warning column) or dropped.
      </P>

      <H2>Comparison: manual recurring process vs automated pipeline</H2>
      <CompareTable
        colA="Manual (weekly)"
        colB="DataHub Pipeline"
        rows={[
          {
            feature: "Time per run",
            manual: "30–90 minutes of manual work",
            datahub: "Seconds to minutes (upload + click run)",
          },
          {
            feature: "Consistency",
            manual: "Varies — human error introduces inconsistencies over time",
            datahub: "Identical steps applied every run",
          },
          {
            feature: "Schema change handling",
            manual: "Discovered after the fact when output is wrong",
            datahub: "Detected before the pipeline runs; flagged for review",
          },
          {
            feature: "Validation",
            manual: "Ad hoc spot checks, if any",
            datahub: "Formal validation rules run on every output",
          },
          {
            feature: "Audit trail",
            manual: "None — no record of what was changed",
            datahub: "Every step logged with timestamp, user, and result",
          },
          {
            feature: "Sharing with team",
            manual: "Document the steps in a Word file",
            datahub: "Pipeline visible to all project members; anyone can run it",
          },
        ]}
      />

      <H2>Common automated workflow patterns</H2>

      <H3>Weekly CRM export cleanup</H3>
      <P>
        Export from CRM → fill nulls in contact fields → deduplicate on email → standardise column
        names → validate required fields → export clean file for sales reporting.
      </P>

      <H3>Monthly financial reconciliation</H3>
      <P>
        Upload GL export and bank statement → parse dates → trim whitespace → full outer join on
        transaction reference → flag unmatched rows → export reconciliation report.
      </P>

      <H3>Daily inventory sync</H3>
      <P>
        Connect to warehouse database → filter to active SKUs → cast types → validate stock levels
        not negative → write cleaned data back to reporting database → trigger dashboard refresh
        via webhook.
      </P>

      <H3>Supplier data onboarding</H3>
      <P>
        Every new supplier sends files in their own format. Pipeline: detect delimiter → skip header
        rows → rename columns to standard schema → cast types → validate required fields → flag
        anomalies → ingest to central table.
      </P>

      <FAQ
        items={[
          {
            q: "Can I run a DataHub pipeline automatically without manual intervention?",
            a: "Yes. If your data source is a database or API connection (not manual file uploads), you can schedule pipelines to run on a cron schedule or trigger them via webhook. For file-based workflows, the trigger is the upload — but the pipeline steps run automatically after upload.",
          },
          {
            q: "What happens when a pipeline step fails?",
            a: "DataHub stops the pipeline at the failing step and surfaces an error message explaining what went wrong (e.g. 'Column order_id not found in uploaded file'). It does not proceed to subsequent steps with potentially corrupted data. The partial result is not saved unless you explicitly confirm it.",
          },
          {
            q: "Can I version-control my pipelines?",
            a: "Pipeline versions are tracked automatically. Each time you modify a pipeline, a new version is created. You can view the history, compare versions, and roll back to a previous version if a change breaks something.",
          },
          {
            q: "How many steps can a pipeline have?",
            a: "There's no hard limit on pipeline steps. Complex pipelines with 20+ steps are common. Performance depends on the size of the dataset being processed rather than the number of steps.",
          },
        ]}
      />
    </Article>
  );
}
