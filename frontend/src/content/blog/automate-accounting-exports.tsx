import {
  Article, Lead, H2, H3, P, UL, LI, OL, Strong, Callout, CodeBlock, InlineCode,
  MidCTA, FAQ,
} from "./_components";

export default function AutomateAccountingExports() {
  return (
    <Article>
      <Lead>
        Every accountant and finance analyst knows the pain: export the data from Tally, QuickBooks,
        Xero, or SAP — and then spend the next hour cleaning it before you can do any actual
        analysis. Merged header rows, blank columns, totals mixed in with transaction rows,
        inconsistent date formats. Here's how to fix that automatically.
      </Lead>

      <H2>Why accounting software exports are always messy</H2>
      <P>
        Accounting software is designed for data entry and compliance, not for analysis. When you
        export data, the software produces a file that looks good in print but is structurally
        broken for any downstream analytical tool.
      </P>
      <P>Common problems in every accounting export:</P>
      <UL>
        <LI>
          <Strong>Multi-row headers.</Strong> Three rows of column labels before the data starts.
          Pandas, Power BI, and every SQL tool expects one header row.
        </LI>
        <LI>
          <Strong>Subtotal and total rows mixed in with data.</Strong> QuickBooks and Tally both
          insert subtotal rows inside the data — labelled "Total" or "Sub-Total" — that corrupt
          any aggregation you try to do.
        </LI>
        <LI>
          <Strong>Inconsistent date formats.</Strong> Indian accounting software often exports dates
          as <InlineCode>01-Apr-26</InlineCode> or <InlineCode>01/04/2026</InlineCode>. Depending
          on locale settings, these can be ambiguous or fail to parse.
        </LI>
        <LI>
          <Strong>Amount columns stored as text.</Strong> Numbers with commas and currency symbols —
          <InlineCode>₹1,23,456.00</InlineCode> — are stored as text strings, not numbers.
          Any sum or average returns zero or an error.
        </LI>
        <LI>
          <Strong>Blank rows between sections.</Strong> Tally in particular uses blank rows to
          visually separate groups. These break every filter and sort operation.
        </LI>
        <LI>
          <Strong>Column names that shift between exports.</Strong> The same report exported with
          slightly different date ranges can produce different column names, depending on which
          periods are included.
        </LI>
      </UL>

      <H2>The manual cleanup process — and why it doesn't scale</H2>
      <P>
        Most finance teams have a cleanup ritual. Open the export, delete the header rows, find and
        remove total rows, reformat the date column, convert the amount columns from text to number.
        It takes 30–60 minutes per file.
      </P>
      <P>
        Multiply that by 12 months, 4 departments, and 3 software exports per department, and
        you're looking at hundreds of hours per year spent on cleanup — before any actual analysis
        begins.
      </P>
      <P>
        The real cost isn't just the time. It's that this process is manual, undocumented, and
        slightly different every time. A new analyst doesn't know the cleanup steps. The steps
        aren't tested. Errors slip through.
      </P>

      <H2>How to automate the cleanup with DataHub</H2>
      <P>
        DataHub lets you describe the cleanup steps in plain English and save them as a reusable
        pipeline. The next time you export the same report, drop the file in and the pipeline runs
        automatically.
      </P>
      <OL>
        <LI>
          <Strong>Upload the export.</Strong> Drag and drop the CSV or Excel file from QuickBooks,
          Tally, Xero, or SAP.
        </LI>
        <LI>
          <Strong>Describe the cleanup.</Strong> Tell the AI what the file looks like and what you
          need:
        </LI>
      </OL>

      <Callout type="tip">
        "This is a Tally export. Skip the first 3 header rows. Remove any rows where the
        Description column contains 'Total' or 'Sub-Total'. Convert the Amount column from text
        to a number — strip the ₹ symbol and commas first. Parse the Date column as DD-Mon-YY.
        Remove blank rows."
      </Callout>

      <OL start={3}>
        <LI>
          <Strong>Review the plan.</Strong> DataHub shows you each step as a named pipeline step
          with the underlying SQL. You see exactly what will happen before it runs.
        </LI>
        <LI>
          <Strong>Run and verify.</Strong> The cleaned data appears immediately with a row count
          and data preview. Verify that the totals match what you'd expect.
        </LI>
        <LI>
          <Strong>Save as a pipeline.</Strong> Name it "Tally P&L Cleanup" or "QuickBooks AR
          Export". Next month, upload the new export and run the same pipeline — no rebuilding,
          no re-describing.
        </LI>
      </OL>

      <MidCTA text="Automate your accounting export cleanup — free, no install needed." />

      <H2>Specific fixes for common accounting tools</H2>

      <H3>QuickBooks / QuickBooks Online exports</H3>
      <P>
        QuickBooks CSV exports typically have a report title and date range in the first 2–3 rows,
        a blank row, then column headers, then data — with subtotals and a grand total at the
        bottom. The standard cleanup pipeline:
      </P>
      <CodeBlock>{`-- Skip first 3 rows (title + blank + spacing)
-- Remove rows where "Account" contains "Total"
-- Convert "Amount" column: strip commas, cast to decimal
-- Parse date as MM/DD/YYYY`}</CodeBlock>

      <H3>Tally exports</H3>
      <P>
        Tally exports (both Tally ERP 9 and TallyPrime) are notorious for formatting. The typical
        issues: first row is the company name, multiple blank rows, amounts stored as{" "}
        <InlineCode>1,23,456.00 Dr</InlineCode> with a debit/credit suffix that must be parsed
        as a sign.
      </P>

      <H3>Xero reports</H3>
      <P>
        Xero exports are cleaner but still have a two-row header (report name + column names) and
        use blank rows between account groups. Removing blank rows and skipping the first row is
        usually sufficient.
      </P>

      <H3>SAP / ERP system exports</H3>
      <P>
        SAP exports often come with technical column names (<InlineCode>BSID</InlineCode>,{" "}
        <InlineCode>BUKRS</InlineCode>, <InlineCode>BLDAT</InlineCode>) that need to be renamed to
        human-readable labels. DataHub lets you define a column rename mapping and save it as part
        of the pipeline.
      </P>

      <H2>What to do with clean data</H2>
      <P>
        Once the export is clean, you can use DataHub to go further: aggregate by account category,
        calculate month-over-month variance, join with a budget file for actuals-vs-budget
        comparison, or push directly to a Power BI or Tableau dashboard.
      </P>
      <P>
        The whole workflow — export, clean, transform, visualise — can be saved as a single
        pipeline that runs end-to-end with one click, or on a schedule.
      </P>

      <FAQ
        items={[
          {
            q: "Does DataHub work with Indian accounting software like Tally and Zoho Books?",
            a: "Yes. DataHub handles CSV and Excel exports from any accounting software. It automatically detects Indian number formats (₹1,23,456) and date formats (DD-Mon-YY, DD/MM/YYYY) used by Tally and similar tools.",
          },
          {
            q: "How does DataHub handle the debit/credit suffix in Tally exports?",
            a: "You can describe the parsing logic in plain English: 'The Amount column has Dr and Cr suffixes — treat Cr as negative and Dr as positive, then convert to a number.' DataHub generates the correct SQL transformation.",
          },
          {
            q: "Can I schedule the cleanup to run automatically?",
            a: "Yes. Once you've saved a cleanup pipeline, you can schedule it to run daily, weekly, or monthly. Connect a cloud storage folder and DataHub picks up new exports automatically.",
          },
          {
            q: "Is the cleanup logic reusable if the format changes slightly next month?",
            a: "Pipelines are editable. If the export format changes slightly — an extra column appears, or the date format changes — you can update the relevant step without rebuilding the whole pipeline.",
          },
        ]}
      />
    </Article>
  );
}
