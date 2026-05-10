import {
  Article, Lead, H2, H3, P, UL, LI, OL, Strong, Callout, CodeBlock, InlineCode,
  CompareTable, MidCTA, FAQ,
} from "./_components";

export default function ReconcileExcelFilesAutomatically() {
  return (
    <Article>
      <Lead>
        You have two Excel files — last month's customer database and this month's updated version.
        Finance wants to know what changed. You open both, start comparing rows, and two hours later
        you're still at it. There is a better way.
      </Lead>

      <H2>Why manual Excel reconciliation breaks down</H2>
      <P>
        Reconciling two spreadsheets by hand sounds simple enough when you have 50 rows. At 500
        rows, it's tedious. At 5,000 rows, it's genuinely impossible to do accurately. And yet most
        analysts do exactly this, every week, with a combination of VLOOKUP, conditional formatting,
        and sheer willpower.
      </P>
      <P>Here's where it goes wrong:</P>
      <UL>
        <LI>
          <Strong>Row order changes.</Strong> If the two files are sorted differently, a row-by-row
          comparison returns false mismatches on every single line.
        </LI>
        <LI>
          <Strong>Key column names drift.</Strong> One file has <InlineCode>Customer ID</InlineCode>
          , the other has <InlineCode>CustID</InlineCode>. VLOOKUP silently fails.
        </LI>
        <LI>
          <Strong>Extra rows appear or disappear.</Strong> A simple VLOOKUP doesn't tell you which
          records exist in file A but not file B — you need a FULL OUTER JOIN, which Excel doesn't
          do natively.
        </LI>
        <LI>
          <Strong>Number formatting hides differences.</Strong>{" "}
          <InlineCode>1000</InlineCode> and <InlineCode>1,000.00</InlineCode> look different but are
          the same value. Typos in text fields are invisible in a quick scroll.
        </LI>
      </UL>
      <P>
        The result is a process that's slow, error-prone, and must be repeated every time the data
        changes.
      </P>

      <H2>The Excel approach: VLOOKUP and conditional formatting</H2>
      <P>
        The standard Excel method for reconciling two sheets uses VLOOKUP to pull values from one
        file into the other, then highlights mismatches with conditional formatting.
      </P>
      <CodeBlock>{`=VLOOKUP(A2, '[File2.xlsx]Sheet1'!$A:$B, 2, 0)`}</CodeBlock>
      <P>
        This works — barely — for simple cases. The problems start the moment you have more than one
        column to compare, duplicate keys, or any rows that exist in one file but not the other.
        VLOOKUP returns <InlineCode>#N/A</InlineCode> for missing records, which you then have to
        filter and interpret manually.
      </P>
      <P>
        Power Query is a step up. You can do a full outer join between two tables using the Merge
        Queries feature. But it requires you to understand query steps, manage connections, and
        refresh manually each time. It also doesn't work on a Mac, and it breaks when file paths
        change.
      </P>

      <H2>The automated approach: reconcile in plain English</H2>
      <P>
        DataHub treats reconciliation as a first-class operation. Upload both files, then describe
        what you want to compare in plain English:
      </P>
      <Callout type="tip">
        "Reconcile these two files on Customer ID. Show me which rows differ, which are only in the
        first file, and which are only in the second."
      </Callout>
      <P>The AI agent automatically:</P>
      <OL>
        <LI>Detects the common key column (or asks you to confirm it if there's ambiguity)</LI>
        <LI>
          Performs a full outer join so records present in only one file are flagged, not silently
          dropped
        </LI>
        <LI>
          Generates side-by-side comparison columns: <InlineCode>left_value</InlineCode>,{" "}
          <InlineCode>right_value</InlineCode>, <InlineCode>variance</InlineCode>, and a boolean{" "}
          <InlineCode>reconciled</InlineCode> flag per row
        </LI>
        <LI>
          Produces a summary: X rows matched, Y rows only in file 1, Z rows only in file 2, W rows
          with differing values
        </LI>
      </OL>
      <P>The underlying SQL it generates looks like this:</P>
      <CodeBlock>{`SELECT
  COALESCE(a.customer_id, b.customer_id) AS customer_id,
  a.revenue                              AS file1_revenue,
  b.revenue                              AS file2_revenue,
  (b.revenue - a.revenue)               AS variance,
  (a.revenue = b.revenue)               AS reconciled
FROM file1 a
FULL OUTER JOIN file2 b ON a.customer_id = b.customer_id`}</CodeBlock>
      <P>
        You don't write any of that SQL. You describe the intent, the agent handles it. The result
        is a clean comparison table you can download, filter, or send directly to a dashboard.
      </P>

      <MidCTA text="Upload your two files and run a reconciliation — free, no install needed." />

      <H2>Handling common complications automatically</H2>

      <H3>Different column names for the same key</H3>
      <P>
        If one file has <InlineCode>customer_id</InlineCode> and the other has{" "}
        <InlineCode>CustID</InlineCode>, DataHub's schema comparison API finds the fuzzy match and
        asks you to confirm: "We think these columns are the same — is that right?" One click
        confirms it.
      </P>

      <H3>Type mismatches</H3>
      <P>
        One file stores order values as text (<InlineCode>"1,234.56"</InlineCode>), the other as a
        number. The agent detects the type mismatch and casts both to float before comparing,
        preventing false positives.
      </P>

      <H3>Near-duplicate key values</H3>
      <P>
        If your keys contain typos — <InlineCode>ACC-001</InlineCode> vs{" "}
        <InlineCode>ACC_001</InlineCode> — fuzzy matching flags potential matches with a similarity
        score so you can decide whether to merge them or treat them as separate records.
      </P>

      <H2>Comparison: manual vs automated reconciliation</H2>
      <CompareTable
        colA="Excel / Manual"
        colB="DataHub"
        rows={[
          {
            feature: "Full outer join",
            manual: "Not available natively; requires Power Query with manual steps",
            datahub: "Automatic — generated from your plain-English description",
          },
          {
            feature: "Missing rows",
            manual: "#N/A errors in VLOOKUP; manual filtering required",
            datahub: "Flagged automatically with 'only in file 1' / 'only in file 2' labels",
          },
          {
            feature: "Key column matching",
            manual: "Must be identical column names; manual mapping otherwise",
            datahub: "Fuzzy column matching — finds the right key even if names differ",
          },
          {
            feature: "Type mismatches",
            manual: "Silent failures; incorrect variance calculations",
            datahub: "Detected and cast automatically before comparison",
          },
          {
            feature: "Repeatable",
            manual: "Redo from scratch each time data changes",
            datahub: "Save as a pipeline; re-run with one click when files are updated",
          },
          {
            feature: "Works on Mac",
            manual: "Power Query is Windows-only",
            datahub: "Browser-based — works on any OS",
          },
        ]}
      />

      <H2>Saving reconciliation as a repeatable pipeline</H2>
      <P>
        If this is a recurring task — monthly financial close, weekly inventory sync, daily order
        reconciliation — DataHub lets you save the reconciliation as a named pipeline. Next time you
        have new files, upload them to the same project and re-run. The join logic, column mappings,
        and output format are all preserved.
      </P>
      <P>
        You can also schedule it: point DataHub at a database connection instead of uploaded files,
        and the reconciliation runs automatically on a schedule you set.
      </P>

      <FAQ
        items={[
          {
            q: "Can I reconcile more than two files at once?",
            a: "Yes. You can upload multiple files and ask DataHub to reconcile against a master, or chain reconciliations across files sequentially. The agent handles the join logic for each comparison.",
          },
          {
            q: "What if my key column has duplicates?",
            a: "DataHub detects duplicate keys and asks how you want to handle them: keep first, keep last, or flag all duplicates. The result set includes a count of matched rows per key so you can see where duplicates occurred.",
          },
          {
            q: "Is there a row limit?",
            a: "The free plan handles files up to 50MB. Starter and above support files up to 5GB. For very large files (millions of rows), connecting directly to a database source is more efficient than file uploads.",
          },
          {
            q: "Can I reconcile Excel against a database table?",
            a: "Yes. You can upload an Excel file as one source and connect to a PostgreSQL, MySQL, Snowflake, or other supported database as the second source. The reconciliation works the same way regardless of where each dataset comes from.",
          },
        ]}
      />
    </Article>
  );
}
