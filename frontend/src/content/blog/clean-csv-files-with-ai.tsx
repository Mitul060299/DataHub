import {
  Article, Lead, H2, H3, P, UL, LI, Strong, Callout, MidCTA, FAQ, CompareTable,
} from "./_components";

export default function CleanCSVFilesWithAI() {
  return (
    <Article>
      <Lead>
        AI tools have made cleaning CSV files dramatically faster — you describe what needs fixing
        in plain English, the AI generates the SQL or transformation logic, and the file comes
        out clean. Here's how to use AI to clean common CSV problems in minutes.
      </Lead>

      <H2>The most common CSV data quality problems</H2>
      <P>
        Most CSV files from real-world systems have at least a few of these issues. The more
        sources a file comes from, the more likely it is to have several:
      </P>
      <UL>
        <LI>
          <Strong>Inconsistent column names</Strong> — "Customer ID", "customer_id", "CustID",
          "cust id" — the same field with different headers across exports
        </LI>
        <LI>
          <Strong>Mixed date formats</Strong> — "01/05/2026", "2026-05-01", "May 1st 2026" all
          meaning the same date
        </LI>
        <LI>
          <Strong>Null and empty values</Strong> — blank cells, "N/A", "null", "-", "—" all
          representing missing data
        </LI>
        <LI>
          <Strong>Leading and trailing whitespace</Strong> — "  London  " instead of "London",
          breaking every group-by and filter
        </LI>
        <LI>
          <Strong>Duplicate rows</Strong> — exact duplicates from accidental double exports, or
          near-duplicates with minor spelling differences
        </LI>
        <LI>
          <Strong>Broken encoding</Strong> — special characters appearing as "Ã©" or "â€™"
          instead of "é" or "'"
        </LI>
        <LI>
          <Strong>Type mismatches</Strong> — a "revenue" column stored as text because one row
          contains "N/A" or a currency symbol
        </LI>
        <LI>
          <Strong>Inconsistent categories</Strong> — "UK", "United Kingdom", "U.K." and "Britain"
          all referring to the same country in a region column
        </LI>
      </UL>

      <H2>How AI cleans CSV files</H2>
      <P>
        AI-powered CSV cleaning tools work in two ways. The better approach is to use AI to
        generate transformation logic (SQL or code) that runs on your data deterministically —
        the AI writes the cleaning recipe, your data produces the clean result. The weaker
        approach is to have AI guess or fill in missing values directly, which introduces
        invented data.
      </P>
      <P>
        DataHub uses the first approach: every cleaning step is generated as readable SQL you
        review before it runs. The AI never invents data — it only transforms what's there.
      </P>

      <H3>Cleaning inconsistent column names with AI</H3>
      <P>
        <Strong>What you type:</Strong> "Standardise all column names: lowercase, underscores
        instead of spaces, no special characters."
      </P>
      <P>
        <Strong>What DataHub generates:</Strong> an ALTER TABLE or SELECT statement that renames
        every column according to the rule. You review the mapping (original → new name) and
        approve.
      </P>

      <H3>Cleaning mixed date formats</H3>
      <P>
        <Strong>What you type:</Strong> "The order_date column has inconsistent formats. Convert
        everything to ISO 8601 (YYYY-MM-DD)."
      </P>
      <P>
        <Strong>What DataHub generates:</Strong> a CASE statement or date-parsing function that
        detects and normalises each format variant. Rows it can't parse are flagged for your review.
      </P>

      <H3>Handling nulls and empty values</H3>
      <P>
        <Strong>What you type:</Strong> "Replace all nulls and empty strings in the region column
        with 'Unknown'."
      </P>
      <P>
        <Strong>What DataHub generates:</Strong> a COALESCE or CASE statement applied to the
        column. You can also ask: "Flag all rows where revenue is null" to investigate before
        filling.
      </P>

      <MidCTA text="Clean your own CSV files with AI — free, upload now." />

      <H3>Removing duplicates</H3>
      <P>
        <Strong>What you type:</Strong> "Remove duplicate rows based on customer_id — keep the
        most recent one based on created_at."
      </P>
      <P>
        <Strong>What DataHub generates:</Strong> a ROW_NUMBER() window function with a PARTITION
        BY customer_id ORDER BY created_at DESC filter. Clean, auditable, and replayable on
        every new file.
      </P>

      <H3>Fixing encoding issues</H3>
      <P>
        DataHub automatically detects and repairs broken encodings when you upload a file —
        UTF-8 mis-interpreted as Latin-1, Windows-1252, or other common encoding problems are
        fixed before the data reaches your transformation steps.
      </P>

      <H2>AI vs manual CSV cleaning: time comparison</H2>
      <CompareTable
        colA="Manual (Excel / scripts)"
        colB="DataHub AI"
        rows={[
          { feature: "Column standardisation", manual: "15–30 mins — find/replace, rename each column manually", datahub: "30 seconds — describe the rule, approve the rename map" },
          { feature: "Date normalisation", manual: "30–60 mins — write TEXT() formulas or custom code for each format variant", datahub: "1 minute — describe the target format, review the generated SQL" },
          { feature: "Null handling", manual: "10–20 mins — conditional formulas, find empties, fill manually", datahub: "30 seconds — 'fill nulls in X column with Y'" },
          { feature: "Deduplication", manual: "5–15 mins for exact; hours for fuzzy", datahub: "1–2 minutes — specify the key columns and deduplication rule" },
          { feature: "Encoding repair", manual: "Manual only if you know the encoding — often needs scripting", datahub: "Automatic on upload" },
          { feature: "Re-run on next month's file", manual: "Full manual process again", datahub: "Run the saved pipeline — seconds" },
        ]}
      />

      <Callout type="tip">
        Save every cleaning workflow as a DataHub pipeline after the first run. When next month's
        file arrives, run the pipeline — all the same cleaning steps apply automatically in
        seconds.
      </Callout>

      <FAQ items={[
        {
          q: "Does DataHub change my original CSV file?",
          a: "No. DataHub works on a copy of your uploaded data. Your original file is never modified. You export the clean results as a new file.",
        },
        {
          q: "Can I clean CSV files with different column orders?",
          a: "Yes. DataHub operations work by column name, not position. If the column order changes between files, the same pipeline still works correctly.",
        },
        {
          q: "What size CSV files can DataHub handle?",
          a: "DataHub handles CSV files up to several GB on paid plans. The Free plan supports files up to 500 MB. For very large files (10+ GB), connecting directly to a database source is recommended.",
        },
        {
          q: "Is AI CSV cleaning accurate?",
          a: "DataHub's AI generates SQL transformations that you review before they run. The accuracy of the cleaning depends on how precisely you describe the problem. For ambiguous cases, DataHub flags rows for your review rather than making assumptions.",
        },
      ]} />
    </Article>
  );
}
