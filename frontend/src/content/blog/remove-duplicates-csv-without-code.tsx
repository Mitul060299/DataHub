import {
  Article, Lead, H2, H3, P, UL, LI, OL, Strong, Callout,
  CompareTable, MidCTA, FAQ, InlineCode,
} from "./_components";

export default function RemoveDuplicatesCsvWithoutCode() {
  return (
    <Article>
      <Lead>
        Every analyst has opened a CSV, run a count, and then realised the number doesn't match what
        it should be. Duplicate rows are the silent killers of data quality — they inflate totals,
        skew averages, and make reports wrong in ways that are embarrassing to explain to
        stakeholders. Here's how to remove them without writing a single line of code.
      </Lead>

      <H2>Why duplicates appear in CSV files</H2>
      <P>
        Duplicate rows end up in CSVs for predictable reasons: system exports that don't deduplicate
        before writing, manual data entry where the same record is submitted twice, merging files
        from multiple sources that share records, or ETL jobs that append instead of upsert.
      </P>
      <P>
        Not all duplicates are the same. Some are <Strong>exact duplicates</Strong> — every field is
        identical. Others are <Strong>near-duplicates</Strong>: the same person or entity recorded
        slightly differently across entries ("John Smith", "J Smith", "john smith"). Exact
        duplicates are easy. Near-duplicates require fuzzy matching.
      </P>

      <H2>The Excel approach and its limits</H2>
      <P>
        Excel's built-in "Remove Duplicates" (Data → Remove Duplicates) handles exact duplicates
        across selected columns. It's quick and works well for small, clean datasets. The limits hit
        quickly:
      </P>
      <UL>
        <LI>No preview of what will be removed — you find out after the fact</LI>
        <LI>No near-duplicate detection — "J Smith" and "John Smith" are treated as different records</LI>
        <LI>Removes rows destructively — no option to flag instead of delete</LI>
        <LI>No way to keep the most-complete record when duplicates differ across columns</LI>
        <LI>Breaks on files over ~1M rows</LI>
      </UL>
      <P>
        Python with pandas is more powerful — <InlineCode>df.drop_duplicates()</InlineCode> and
        fuzzy matching via <InlineCode>rapidfuzz</InlineCode> can handle everything above. But that
        requires installing Python, knowing pandas, and writing code that you'll need to maintain.
      </P>

      <H2>Removing exact duplicates without code</H2>
      <P>
        In DataHub, upload your CSV and describe what you want. For exact deduplication:
      </P>
      <Callout type="tip">
        "Remove duplicate rows from this file. Keep the first occurrence of each."
      </Callout>
      <P>
        DataHub runs <InlineCode>drop_duplicates</InlineCode> across all columns, previews the rows
        it will remove, and confirms the operation before making any changes. You can choose to keep
        first or last, or to keep all duplicates flagged but not removed (useful when you need to
        audit what was duplicated).
      </P>
      <P>
        If duplicates should be determined by a subset of columns — for example, deduplicate by
        customer email only, ignoring timestamp differences:
      </P>
      <Callout type="tip">
        "Remove duplicates based on the email column only. When there are duplicates, keep the row
        with the most recent date."
      </Callout>
      <P>
        This runs <InlineCode>deduplicate_by_column</InlineCode> with a sort on the date column
        before deduplication, so the "keep last" logic selects the correct row automatically.
      </P>

      <H2>Near-duplicate (fuzzy) deduplication</H2>
      <P>
        Fuzzy deduplication matches records that are similar but not identical — catching typos,
        abbreviations, and formatting inconsistencies in text columns. This is the hard part that
        most tools don't handle at all.
      </P>
      <Callout type="tip">
        "Find near-duplicate company names in the name column and group them."
      </Callout>
      <P>
        DataHub's <InlineCode>fuzzy_deduplicate</InlineCode> operation uses{" "}
        <InlineCode>rapidfuzz</InlineCode> to compute a similarity ratio between strings. You set a
        threshold (default is 85% similarity). Records above the threshold are grouped, and you
        choose which canonical value to keep. Results show the similarity score for each match so
        you can review borderline cases.
      </P>
      <P>Common cases this catches:</P>
      <UL>
        <LI>"Acme Corp" / "Acme Corporation" / "ACME CORP" → all merged as "Acme Corp"</LI>
        <LI>"John Smith" / "Jon Smith" / "J. Smith" → flagged for review</LI>
        <LI>"10 High Street" / "10 High St" → matched as near-duplicate addresses</LI>
      </UL>

      <MidCTA text="Upload your CSV and remove duplicates — free, no install needed." />

      <H2>Deduplication strategies for different scenarios</H2>

      <H3>Customer lists</H3>
      <P>
        Deduplicate on email (exact) first, then on name (fuzzy at 90%) for records without email.
        Keep the record with the most recent <InlineCode>updated_at</InlineCode> timestamp.
      </P>

      <H3>Product catalogues</H3>
      <P>
        Exact dedup on SKU or product code. Fuzzy dedup on product name at 80% to catch variant
        spellings. Review matched groups manually before merging.
      </P>

      <H3>Transaction logs</H3>
      <P>
        Exact dedup on transaction ID. If no transaction ID exists, deduplicate on the combination
        of date + amount + account — a composite key that identifies the same transaction even
        without an explicit ID field.
      </P>

      <H3>Address data</H3>
      <P>
        Normalise before deduplicating: lowercase everything, expand abbreviations (St → Street, Ave
        → Avenue), strip punctuation. Then fuzzy match at 85%.
      </P>

      <H2>Comparison</H2>
      <CompareTable
        colA="Excel Remove Duplicates"
        colB="DataHub"
        rows={[
          {
            feature: "Exact duplicate removal",
            manual: "Yes — simple and fast",
            datahub: "Yes, with preview before deletion",
          },
          {
            feature: "Subset column dedup",
            manual: "Yes — select columns in dialog",
            datahub: "Yes, plus sort by any column to pick which row to keep",
          },
          {
            feature: "Near-duplicate / fuzzy matching",
            manual: "No — requires VBA or Python",
            datahub: "Built-in fuzzy_deduplicate with configurable similarity threshold",
          },
          {
            feature: "Preview before removing",
            manual: "No — rows are removed immediately",
            datahub: "Yes — shows which rows will be removed before confirming",
          },
          {
            feature: "Flag instead of delete",
            manual: "No",
            datahub: "Yes — can add a 'is_duplicate' column instead of deleting",
          },
          {
            feature: "File size",
            manual: "~1M row limit in Excel",
            datahub: "Up to 10GB per file on Business plan",
          },
        ]}
      />

      <H2>Making deduplication repeatable</H2>
      <P>
        If deduplication is part of a regular workflow — weekly CRM export cleanup, monthly supplier
        data sync — save the steps as a named pipeline. Drag new files into the same project and
        re-run. The same deduplication logic (columns, threshold, keep strategy) applies
        automatically.
      </P>

      <FAQ
        items={[
          {
            q: "How do I know which rows were removed?",
            a: "DataHub shows a preview of rows flagged for removal before the operation runs. You can also choose to flag rows with a boolean column rather than removing them, giving you a full audit trail of what was a duplicate and why.",
          },
          {
            q: "What similarity threshold should I use for fuzzy matching?",
            a: "For business names and product names, 85–90% works well. For addresses, 80% is more permissive to allow for abbreviation differences. For personal names, 90–95% is safer to avoid merging genuinely different people. DataHub shows you matched pairs at your chosen threshold so you can adjust before committing.",
          },
          {
            q: "Can I deduplicate across multiple files rather than within one file?",
            a: "Yes. Upload both files to the same project, combine them with a union operation, then deduplicate the merged result. The workflow is: upload file A, upload file B, 'combine these two files into one', then 'remove duplicates on [key column]'.",
          },
          {
            q: "Does deduplication work on large files with millions of rows?",
            a: "Yes. DataHub runs all operations via DuckDB, which is optimised for analytical workloads on large files. Exact deduplication on a 5M-row file typically completes in under 10 seconds. Fuzzy deduplication is more computationally intensive — on very large files, running it on a key column subset rather than the full string is faster.",
          },
        ]}
      />
    </Article>
  );
}
