import {
  Article, Lead, H2, H3, P, UL, LI, OL, Strong, Callout, CodeBlock, InlineCode,
  MidCTA, FAQ,
} from "./_components";

export default function AutomateMonthlyExcelReports() {
  return (
    <Article>
      <Lead>
        If you spend hours every month refreshing the same Excel report — downloading source data,
        cleaning it, running the same formulas, fixing the same formatting issues, sending it to
        the same people — you're doing manually what a pipeline should handle. Here's how to
        automate the whole thing without writing a single macro.
      </Lead>

      <H2>The monthly report problem</H2>
      <P>
        Monthly reporting workflows follow a predictable pattern that makes them ideal candidates
        for automation. They run on a fixed schedule, use the same data sources, apply the same
        transformations, and produce the same output format every time.
      </P>
      <P>And yet most analysts rebuild them from scratch every month. Here's why:</P>
      <UL>
        <LI>
          <Strong>The data changes every month.</Strong> New rows, new periods, sometimes new
          column names. A hardcoded formula or pivot table breaks the moment the source data
          structure shifts.
        </LI>
        <LI>
          <Strong>Excel macros are fragile.</Strong> VBA macros work until they don't — and
          debugging them requires skills most analysts don't have.
        </LI>
        <LI>
          <Strong>The source data is always messy.</Strong> Before you can run the report, you
          spend 30–60 minutes cleaning the raw export. That step is manual every time.
        </LI>
        <LI>
          <Strong>The output format changes.</Strong> Someone asks for a different breakdown, a
          new column, or a different grouping. Rebuilding the whole report takes hours.
        </LI>
      </UL>

      <H2>What "automating" a monthly report actually means</H2>
      <P>
        Automation doesn't mean setting up a complex system. For a monthly Excel report, it means:
      </P>
      <OL>
        <LI>
          <Strong>The cleanup steps run automatically</Strong> on the new data — no manual fixing
          of nulls, date formats, or header rows.
        </LI>
        <LI>
          <Strong>The transformation logic is saved</Strong> — the joins, aggregations, and
          calculated columns are defined once and re-applied every month.
        </LI>
        <LI>
          <Strong>The output is generated automatically</Strong> — in the same format, same
          structure, same layout every time.
        </LI>
        <LI>
          <Strong>The whole workflow triggers on its own</Strong> — or with one click, rather than
          hours of manual steps.
        </LI>
      </OL>

      <H2>Step-by-step: automating a monthly report with DataHub</H2>

      <H3>Step 1: Document the current manual steps</H3>
      <P>
        Before automating, list every step you currently do manually. For example:
      </P>
      <UL>
        <LI>Download sales export from CRM</LI>
        <LI>Delete first 2 header rows</LI>
        <LI>Remove rows where "Region" is blank</LI>
        <LI>Convert "Revenue" column from text to number</LI>
        <LI>Join with the product master file on "Product Code"</LI>
        <LI>Aggregate by Region and Product Category</LI>
        <LI>Add Month-over-Month variance column</LI>
        <LI>Export as Excel with formatting</LI>
      </UL>
      <P>
        This list is your pipeline definition. Each step becomes one pipeline step in DataHub.
      </P>

      <H3>Step 2: Build the pipeline in DataHub</H3>
      <P>
        Upload this month's source file and describe the steps one by one in plain English. DataHub
        translates each instruction into a named pipeline step with visible SQL:
      </P>

      <Callout type="tip">
        "Skip the first 2 rows. Remove rows where Region is blank. Convert Revenue from text to
        number — strip commas first. Join with the product master on Product Code. Group by Region
        and Product Category, summing Revenue. Add a column showing month-over-month change."
      </Callout>

      <P>
        The agent generates a step-by-step plan. You review and approve each step. Nothing runs
        until you click approve.
      </P>

      <H3>Step 3: Verify the output</H3>
      <P>
        Run the pipeline on this month's data. Check that the row counts, totals, and structure
        match what you'd expect. Compare a few rows with your manually-produced report to confirm
        they're identical.
      </P>

      <H3>Step 4: Save and name the pipeline</H3>
      <P>
        Save the pipeline as "Monthly Sales Report" or "Regional P&L". Every step is stored — the
        column mappings, the join logic, the aggregation, the variance formula.
      </P>

      <H3>Step 5: Schedule or reuse</H3>
      <P>
        Next month, either:
      </P>
      <UL>
        <LI>
          <Strong>Drop in the new file and click run.</Strong> The pipeline applies the same logic
          to the new data and produces the same output format.
        </LI>
        <LI>
          <Strong>Set up a schedule.</Strong> Connect a cloud storage folder (S3, Google Drive).
          When the new file appears, DataHub picks it up and runs the pipeline automatically.
        </LI>
      </UL>

      <MidCTA text="Build your first automated monthly report — free, no install needed." />

      <H2>Handling the most common complications</H2>

      <H3>The source format changes</H3>
      <P>
        If the export adds a new column or renames one, update the relevant step in the pipeline —
        without rebuilding everything from scratch. The rest of the pipeline is unaffected.
      </P>

      <H3>The report needs a new breakdown</H3>
      <P>
        Add a new aggregation step or adjust the grouping. The change is visible as SQL so you can
        verify it before running.
      </P>

      <H3>Multiple source files</H3>
      <P>
        If the report draws from two or three sources (e.g., a CRM export plus a finance export
        plus a product master), each source is a separate step. The pipeline joins them in the
        correct order each time.
      </P>

      <H2>The SQL behind the scenes</H2>
      <P>
        You don't need to write or understand the SQL — but it's always there if you want to
        inspect it. For a monthly aggregation pipeline, the generated SQL looks something like:
      </P>
      <CodeBlock>{`SELECT
  s.region,
  p.category       AS product_category,
  SUM(s.revenue)   AS total_revenue,
  LAG(SUM(s.revenue)) OVER (
    PARTITION BY s.region, p.category
    ORDER BY s.month
  )                AS prev_month_revenue,
  SUM(s.revenue) - LAG(SUM(s.revenue)) OVER (
    PARTITION BY s.region, p.category
    ORDER BY s.month
  )                AS mom_variance
FROM sales_export s
JOIN product_master p ON s.product_code = p.product_code
WHERE s.region IS NOT NULL
GROUP BY s.region, p.category, s.month`}</CodeBlock>
      <P>
        Every step is deterministic, reproducible, and auditable. The same input always produces
        the same output.
      </P>

      <FAQ
        items={[
          {
            q: "Do I need to know SQL to use DataHub for reports?",
            a: "No. You describe what you want in plain English and DataHub generates the SQL. You can see and edit it, but you never have to write it from scratch.",
          },
          {
            q: "Can DataHub replace Excel for reporting entirely?",
            a: "For the data transformation and aggregation parts of a report, yes. DataHub produces clean, analysis-ready tables. You can download as Excel or push to a dashboard. For complex formatting — custom charts, print layouts — Excel or a BI tool handles the final presentation step.",
          },
          {
            q: "What if I have 20 source files that merge each month?",
            a: "DataHub supports merging multiple files in a single pipeline step. Upload all files, describe the merge logic, and it handles column alignment, deduplication, and stacking automatically.",
          },
          {
            q: "Can I send the output to someone automatically?",
            a: "Scheduled pipelines can push output to a shared dashboard link, a download URL, or a cloud storage folder. Email delivery of reports is on the product roadmap.",
          },
        ]}
      />
    </Article>
  );
}
