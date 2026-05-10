import {
  Article, Lead, H2, H3, P, UL, LI, OL, Strong, Callout, InlineCode,
  CompareTable, MidCTA, FAQ,
} from "./_components";

export default function CleanMessyExcelCsvWithoutCoding() {
  return (
    <Article>
      <Lead>
        Every analyst has inherited a file that shouldn't exist: inconsistent date formats across
        columns, leading spaces everywhere, numbers stored as text, four different spellings of
        "N/A", a header row buried on row 6 because someone put a logo in rows 1–5. This is the
        guide for that file.
      </Lead>

      <H2>The anatomy of a messy file</H2>
      <P>
        Messy files fail in predictable ways. Understanding the categories helps you tackle them
        systematically rather than playing whack-a-mole with individual cells.
      </P>

      <H3>Structural problems</H3>
      <UL>
        <LI>Headers on the wrong row (title text in row 1, blank row 2, actual headers in row 3)</LI>
        <LI>Merged cells that collapse when you try to sort or filter</LI>
        <LI>Totals rows embedded in the data (a row that says "Grand Total" in the middle)</LI>
        <LI>Multiple tables in one sheet with different schemas</LI>
        <LI>Extra columns full of nothing (artifacts of copy-paste)</LI>
      </UL>

      <H3>Encoding and character problems</H3>
      <UL>
        <LI>Non-UTF-8 files that show â€™ instead of an apostrophe</LI>
        <LI>Windows-1252 or Latin-1 encoded files that work on the sender's machine and break on yours</LI>
        <LI>BOM (byte order mark) characters at the start of the file that make the first column name wrong</LI>
        <LI>Hidden non-printable characters embedded in text strings</LI>
      </UL>

      <H3>Data quality problems</H3>
      <UL>
        <LI>Null values represented as "N/A", "na", "null", "NULL", "-", "TBD", blank</LI>
        <LI>Mixed date formats in the same column (some rows "01/05/2026", others "May 1st, 2026")</LI>
        <LI>Numbers stored as text (cell is left-aligned; SUM returns zero)</LI>
        <LI>Leading and trailing whitespace that breaks VLOOKUP and exact matches</LI>
        <LI>Inconsistent capitalisation ("London", "london", "LONDON" in the same column)</LI>
        <LI>Decimal separator issues (European files use comma; UK/US files use dot)</LI>
      </UL>

      <H2>Fixing structural problems</H2>

      <H3>Wrong header row</H3>
      <P>
        In DataHub, upload the file and it detects the likely header row from the data profile. If
        the auto-detection is wrong:
      </P>
      <Callout type="tip">
        "The actual headers are on row 4 — the first three rows are a title block. Skip them."
      </Callout>
      <P>
        DataHub re-reads the file with the correct header row offset and strips the preamble rows.
      </P>

      <H3>Embedded total rows</H3>
      <Callout type="tip">
        "Remove any rows where the first column contains 'Total', 'Grand Total', or 'Subtotal'."
      </Callout>
      <P>
        This uses a filter step with a regex on the first column value. The rows are removed and the
        cleaned file is ready for aggregation without double-counting.
      </P>

      <H3>Empty columns and rows</H3>
      <Callout type="tip">
        "Drop any columns that are more than 90% empty. Drop any rows that are entirely empty."
      </Callout>
      <P>
        DataHub's <InlineCode>drop_null_columns</InlineCode> and <InlineCode>filter_nulls</InlineCode>{" "}
        handle this. The threshold is configurable.
      </P>

      <H2>Fixing encoding and character problems</H2>
      <P>
        DataHub detects encoding on upload using a multi-byte sniff. If a file is not UTF-8, it
        converts automatically to UTF-8 before processing. Non-printable characters are stripped.
        BOM characters are removed from the start of column names.
      </P>
      <P>
        If a file is incorrectly detected, you can specify:
      </P>
      <Callout type="tip">
        "This file is encoded in Windows-1252 — re-read it with that encoding."
      </Callout>

      <MidCTA text="Upload your messy file — DataHub profiles it and suggests fixes automatically." />

      <H2>Fixing data quality problems</H2>

      <H3>Pseudo-null detection and filling</H3>
      <P>
        DataHub's profiling step automatically detects pseudo-nulls — values that look like data but
        represent missing information. Before you even run a cleaning step, the profile shows you how
        many cells contain "N/A", "null", "-", and similar strings.
      </P>
      <Callout type="tip">
        "Treat 'N/A', 'na', 'null', '-', and blank strings as nulls. Then fill numeric nulls with
        the column median and text nulls with 'Unknown'."
      </Callout>

      <H3>Mixed date formats</H3>
      <Callout type="tip">
        "Parse the order_date column as a date. It contains multiple formats — some rows are
        DD/MM/YYYY and some are written out like 'May 1st, 2026'."
      </Callout>
      <P>
        DataHub's <InlineCode>parse_dates</InlineCode> operation uses a multi-format parser that
        handles ISO 8601, DD/MM/YYYY, MM/DD/YYYY, natural language dates, and Unix timestamps. It
        flags rows it couldn't parse so you can review them rather than silently converting them
        incorrectly.
      </P>

      <H3>Numbers stored as text</H3>
      <Callout type="tip">
        "Convert the revenue column to a number. It's currently stored as text — some values have
        commas as thousands separators."
      </Callout>
      <P>
        <InlineCode>cast_column_type</InlineCode> with type <InlineCode>float</InlineCode> strips
        currency symbols, commas, and whitespace before converting. Values that can't be converted
        are flagged as nulls rather than causing errors.
      </P>

      <H3>Whitespace stripping</H3>
      <Callout type="tip">
        "Trim leading and trailing whitespace from all text columns."
      </Callout>
      <P>
        <InlineCode>trim_string_columns</InlineCode> runs across every string column in one step.
        This is the single most common fix for silent VLOOKUP failures.
      </P>

      <H3>Inconsistent capitalisation</H3>
      <Callout type="tip">
        "Standardise the city column — make everything title case."
      </Callout>
      <P>
        DataHub applies <InlineCode>INITCAP</InlineCode> (title case), <InlineCode>UPPER</InlineCode>,
        or <InlineCode>LOWER</InlineCode> depending on what you describe.
      </P>

      <H2>Comparison: fixing messy files manually vs with DataHub</H2>
      <CompareTable
        colA="Excel / Manual"
        colB="DataHub"
        rows={[
          {
            feature: "Wrong header row",
            manual: "Delete rows manually or use Power Query skip rows",
            datahub: "Auto-detected; override with plain-English instruction",
          },
          {
            feature: "Encoding fix",
            manual: "Re-import with correct encoding via Power Query",
            datahub: "Auto-detected and converted on upload",
          },
          {
            feature: "Pseudo-null detection",
            manual: "Find & Replace for each known value separately",
            datahub: "Automatic profiling detects all pseudo-null variants at once",
          },
          {
            feature: "Mixed date formats",
            manual: "Conditional TEXT() formulas; often breaks",
            datahub: "parse_dates with multi-format parser",
          },
          {
            feature: "Numbers as text",
            manual: "Paste Special → Values; multiply by 1",
            datahub: "cast_column_type — strips symbols and converts in one step",
          },
          {
            feature: "Whitespace",
            manual: "TRIM() formula per column",
            datahub: "trim_string_columns — all columns in one step",
          },
          {
            feature: "Repeatable on next file",
            manual: "Redo from scratch",
            datahub: "Saved as pipeline — re-run on new file",
          },
        ]}
      />

      <H2>The cleaning checklist to run on every new file</H2>
      <OL>
        <LI>Upload and read the auto-generated profile (null %, types, duplicate %, top values)</LI>
        <LI>Fix encoding issues if flagged</LI>
        <LI>Correct the header row if needed</LI>
        <LI>Trim whitespace from all string columns</LI>
        <LI>Standardise column names to snake_case</LI>
        <LI>Handle pseudo-nulls — define what counts as missing in this dataset</LI>
        <LI>Parse date columns with explicit format specification</LI>
        <LI>Convert numeric columns stored as text</LI>
        <LI>Run deduplication on the key column</LI>
        <LI>Validate key business rules (no negative amounts, dates in valid range, etc.)</LI>
      </OL>
      <P>
        In DataHub, this entire checklist can be described in natural language and saved as a
        reusable pipeline. Next time you receive the same file, you run the pipeline instead of
        working through the checklist manually.
      </P>

      <FAQ
        items={[
          {
            q: "Can DataHub fix files with multiple tables on one sheet?",
            a: "Yes. DataHub can identify separate table regions on a single sheet based on blank row separators or header row detection. You specify which table you want to work with, and DataHub isolates it before any processing.",
          },
          {
            q: "What file formats are supported?",
            a: "CSV (auto-delimiter detection for comma, tab, semicolon, pipe, colon), Excel (.xlsx, .xls, single and multi-sheet), JSON (flat and nested), and Parquet. JSON and Parquet require Professional plan or above.",
          },
          {
            q: "How do I handle a file where the same column contains both dates and text values?",
            a: "DataHub profiles mixed-type columns and shows the distribution of value types. You can filter to rows of a specific type, parse the date rows separately, or use a conditional cast that applies date parsing only where the value matches a date pattern.",
          },
          {
            q: "Does DataHub work with Excel files that have formulas instead of values?",
            a: "DataHub reads the computed values of formula cells, not the formulas themselves. If a cell contains =SUM(A1:A10), DataHub reads the result. Cells with formula errors (#VALUE!, #REF!, #N/A) are treated as nulls.",
          },
        ]}
      />
    </Article>
  );
}
