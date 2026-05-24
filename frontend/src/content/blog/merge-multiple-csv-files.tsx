import {
  Article, Lead, H2, H3, P, UL, LI, OL, Strong, Callout, CodeBlock, InlineCode,
  MidCTA, FAQ,
} from "./_components";

export default function MergeMultipleCsvFiles() {
  return (
    <Article>
      <Lead>
        You have 12 monthly CSV exports sitting in a folder. Your boss wants a single consolidated
        file by end of day. You start copy-pasting columns — and realise halfway through that three
        of the files use slightly different header names. There is a much faster way.
      </Lead>

      <H2>Why merging CSV files is harder than it looks</H2>
      <P>
        Merging two or three CSVs sounds trivial. In practice, it almost always involves at least
        one of these problems:
      </P>
      <UL>
        <LI>
          <Strong>Inconsistent column names.</Strong> One file has{" "}
          <InlineCode>CustomerID</InlineCode>, another has <InlineCode>customer_id</InlineCode>,
          another has <InlineCode>Cust ID</InlineCode>. They all mean the same thing.
        </LI>
        <LI>
          <Strong>Different column orders.</Strong> A simple append puts the wrong values under
          the wrong headers when the columns are in different positions.
        </LI>
        <LI>
          <Strong>Extra or missing columns.</Strong> Some exports have columns others don't. A naive
          paste drops those columns entirely or misaligns everything.
        </LI>
        <LI>
          <Strong>Different date and number formats.</Strong> One file stores dates as{" "}
          <InlineCode>DD/MM/YYYY</InlineCode>, another as <InlineCode>YYYY-MM-DD</InlineCode>.
          After merging, your pivot table charts spike and crash at month boundaries.
        </LI>
        <LI>
          <Strong>Duplicate rows across files.</Strong> Monthly exports often overlap. The same
          transaction appears in both the June and July file.
        </LI>
      </UL>
      <P>
        These problems compound. Fix the column names, and you still have date format issues. Fix
        the date formats, and you still have duplicates. Every fix is manual.
      </P>

      <H2>The Excel approach: Power Query or copy-paste</H2>
      <P>
        Power Query can combine CSVs from a folder using the <Strong>Get Data → From Folder</Strong>{" "}
        option. It loads all files and lets you append them. The problem is it requires every file
        to have identical column names and types — and most real-world exports don't.
      </P>
      <P>
        If you go the copy-paste route, you're doing it row by row. At 10 files and 5,000 rows
        each, that's 50,000 rows of manual work with no error checking and no audit trail.
      </P>
      <P>
        Python with Pandas is the engineer's answer. But analysts shouldn't need to install Python,
        manage a virtual environment, and write{" "}
        <InlineCode>pd.concat([df1, df2, df3], ignore_index=True)</InlineCode> just to combine a
        few CSVs.
      </P>

      <H2>How to merge multiple CSV files with DataHub</H2>
      <P>
        DataHub lets you upload multiple CSV files and describe the merge in plain English. It
        handles column alignment, type normalisation, and deduplication automatically.
      </P>
      <OL>
        <LI>
          <Strong>Upload all your CSV files.</Strong> Select multiple files at once from the upload
          dialog — or drag and drop a folder.
        </LI>
        <LI>
          <Strong>Ask in plain English.</Strong> Type something like: "Merge all these files into
          one table. Match columns by name even if the casing is different."
        </LI>
        <LI>
          <Strong>Review the plan.</Strong> The AI agent shows you exactly which columns it matched,
          which it couldn't resolve, and what SQL it will run. You approve before anything executes.
        </LI>
        <LI>
          <Strong>Handle edge cases.</Strong> If column names differ, the agent asks: "We found
          'CustomerID' in 3 files and 'customer_id' in 2 files — should these be treated as the
          same column?" One click.
        </LI>
        <LI>
          <Strong>Download or pipeline it.</Strong> Export the merged file as CSV or Excel, or save
          the steps as a reusable pipeline for next month's batch.
        </LI>
      </OL>

      <Callout type="tip">
        "Stack all 12 monthly export files. Standardise column names. Remove any duplicate rows
        where the order ID appears more than once. Export as a single CSV."
      </Callout>

      <P>The SQL DataHub generates for a basic column-aligned merge looks like this:</P>
      <CodeBlock>{`SELECT
  order_id,
  customer_id,
  CAST(order_date AS DATE)  AS order_date,
  CAST(amount AS DECIMAL)   AS amount,
  region
FROM jan_export

UNION ALL

SELECT
  order_id,
  customer_id,
  CAST(order_date AS DATE)  AS order_date,
  CAST(amount AS DECIMAL)   AS amount,
  region
FROM feb_export

-- ... repeated for each file`}</CodeBlock>
      <P>
        You see every step. You can edit the SQL directly if you need to tweak anything. Nothing
        runs until you approve the plan.
      </P>

      <MidCTA text="Upload your CSV files and merge them in minutes — free, no install needed." />

      <H2>Common scenarios</H2>

      <H3>Merging monthly sales exports</H3>
      <P>
        Each month's export has the same structure but different data. A simple vertical append is
        what you need. DataHub stacks them and adds a <InlineCode>source_file</InlineCode> column
        so you can always trace which row came from which month.
      </P>

      <H3>Merging regional exports with different schemas</H3>
      <P>
        North region uses <InlineCode>salesperson</InlineCode>, South region uses{" "}
        <InlineCode>rep_name</InlineCode>. DataHub's fuzzy schema matching identifies likely
        equivalents and asks you to confirm before mapping them. It never silently renames a column
        without your approval.
      </P>

      <H3>Deduplicating after merge</H3>
      <P>
        If your monthly exports overlap (e.g. an order placed on the last day of the month appears
        in both months' files), tell the agent: "After merging, remove duplicates where the order
        ID appears more than once — keep the first occurrence." It adds a deduplication step to the
        pipeline automatically.
      </P>

      <H3>Merging files with different date formats</H3>
      <P>
        DataHub detects date format inconsistencies during profiling and normalises them before the
        merge. <InlineCode>01/05/2026</InlineCode>,{" "}
        <InlineCode>2026-05-01</InlineCode>, and <InlineCode>May 1, 2026</InlineCode> all become
        the same value in the output.
      </P>

      <H2>Saving the workflow as a reusable pipeline</H2>
      <P>
        If this is a monthly task, you don't want to repeat these steps every time. After the merge
        runs successfully, save it as a pipeline. Next month, drop new files into the same folder
        and the pipeline runs itself — same column mappings, same deduplication logic, same output
        format.
      </P>
      <P>
        The pipeline can also be scheduled: connect a cloud storage bucket and DataHub will pick
        up new files automatically, merge them, and push the result to your dashboard or a download
        link.
      </P>

      <FAQ
        items={[
          {
            q: "How many CSV files can I merge at once?",
            a: "DataHub supports merging any number of CSV files in a single operation. The limit depends on your plan's storage allowance, not the number of files.",
          },
          {
            q: "What if the columns are in different orders?",
            a: "DataHub merges by column name, not position. As long as the column names match (with fuzzy matching for near-identical names), the order doesn't matter.",
          },
          {
            q: "Can I merge Excel files the same way?",
            a: "Yes. DataHub supports CSV, Excel (.xlsx and .xls, including multi-sheet files), JSON, and Parquet. You can mix file types in the same merge operation.",
          },
          {
            q: "Will the merged file remember where each row came from?",
            a: "Yes. DataHub can add a source_file column to the merged output so you can always trace which row came from which original file.",
          },
        ]}
      />
    </Article>
  );
}
