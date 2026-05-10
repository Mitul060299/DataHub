import {
  Article, Lead, H2, H3, P, UL, LI, Strong, Callout, InlineCode,
  CompareTable, MidCTA, FAQ,
} from "./_components";

export default function DataCleaningToolForAnalysts() {
  return (
    <Article>
      <Lead>
        The IBM Data Analytics study put a number on something every analyst already knows: 80% of
        analytical work is data preparation, not analysis. The cleaning, fixing, aligning, and
        validating that has to happen before a single chart can be drawn or a single question can be
        answered. The right tool doesn't eliminate this work — but it collapses it from hours to
        minutes.
      </Lead>

      <H2>What data cleaning actually involves</H2>
      <P>
        "Data cleaning" covers a wide range of problems. In practice, it breaks down into these
        categories:
      </P>
      <UL>
        <LI>
          <Strong>Structural issues:</Strong> Inconsistent column names, merged cells, headers on
          the wrong row, mixed data types in a single column
        </LI>
        <LI>
          <Strong>Missing data:</Strong> Null values, empty strings, pseudo-nulls like "N/A",
          "null", "-", "n/a"
        </LI>
        <LI>
          <Strong>Duplicate records:</Strong> Exact duplicates, near-duplicates with slight
          variations in key fields
        </LI>
        <LI>
          <Strong>Type errors:</Strong> Numbers stored as text, dates in multiple formats (DD/MM/YY,
          MM-DD-YYYY, Unix timestamps), booleans stored as "Yes"/"No"/"TRUE"/"1"
        </LI>
        <LI>
          <Strong>Outliers and anomalies:</Strong> Values three standard deviations from the mean,
          date gaps, impossible values (negative ages, future dates for past events)
        </LI>
        <LI>
          <Strong>Encoding issues:</Strong> Non-UTF-8 files that show garbled characters
        </LI>
        <LI>
          <Strong>Whitespace:</Strong> Leading and trailing spaces that make exact matches fail
          silently
        </LI>
      </UL>
      <P>
        A good data cleaning tool should handle all of these — ideally with a way to preview
        changes before committing them and a way to repeat the same cleaning steps on future data.
      </P>

      <H2>Excel: the default tool and its ceiling</H2>
      <P>
        Most analysts clean data in Excel because it's already open. For small files with simple
        problems, it works. The ceiling appears quickly:
      </P>
      <UL>
        <LI>
          Find & Replace for null values — but it won't catch "N/A", "n/a", "null", and "" in one
          operation
        </LI>
        <LI>Text to Columns for splitting — but requires manual delimiter config each time</LI>
        <LI>
          Remove Duplicates — but no fuzzy matching and no preview of what will be removed
        </LI>
        <LI>
          Data validation — but runs after data entry, not as a cleaning step on existing data
        </LI>
        <LI>Power Query — powerful, but Windows-only and requires learning M formula language</LI>
      </UL>
      <P>
        For anything beyond simple column operations, Excel requires writing formulas or VBA. Every
        cleaning step is manual, untraceable, and must be repeated from scratch next time.
      </P>

      <H2>Python: powerful but not for everyone</H2>
      <P>
        Python with pandas is genuinely the most powerful free option for data cleaning. It handles
        every problem listed above, scales to any file size, and can be fully automated. But it
        requires:
      </P>
      <UL>
        <LI>Setting up a Python environment (pip, conda, Jupyter)</LI>
        <LI>
          Knowing pandas — <InlineCode>df.fillna()</InlineCode>,{" "}
          <InlineCode>df.drop_duplicates()</InlineCode>, <InlineCode>pd.to_datetime()</InlineCode>{" "}
          etc.
        </LI>
        <LI>Writing and maintaining code that breaks when the data schema changes</LI>
      </UL>
      <P>
        For data engineers and technical analysts, pandas is the right choice. For business
        analysts and operational staff who work with data but don't code, it's a skill gap that
        creates a dependency on the engineering team for every cleaning job.
      </P>

      <H2>DataHub: plain-English data cleaning for analysts</H2>
      <P>
        DataHub's AI agent accepts plain-English instructions and applies the right cleaning
        operation automatically. No pandas, no formula syntax, no manual step setup.
      </P>

      <H3>Handling null values</H3>
      <Callout type="tip">
        "Fill all null values in the revenue column with the column median. Flag rows where more
        than 3 columns are null."
      </Callout>
      <P>
        DataHub's <InlineCode>fill_nulls</InlineCode> operation supports mean, median, mode, forward
        fill, backward fill, zero, and custom values. Pseudo-null detection catches strings like
        "N/A", "null", "-" and treats them as actual nulls before filling.
      </P>

      <H3>Standardising types</H3>
      <Callout type="tip">
        "Convert the order_date column to a proper date. The format in the file is DD/MM/YYYY."
      </Callout>
      <P>
        <InlineCode>parse_dates</InlineCode> and <InlineCode>cast_column_type</InlineCode>{" "}
        handle date parsing (auto-detecting format), numeric coercion, boolean normalisation, and
        encoding fixes automatically.
      </P>

      <H3>Removing duplicates</H3>
      <Callout type="tip">
        "Find and remove duplicate customers. Use email as the key — keep the most recently updated
        record when there are duplicates."
      </Callout>

      <H3>Outlier detection</H3>
      <Callout type="tip">
        "Flag any rows where the transaction amount is more than 3 standard deviations from the
        mean."
      </Callout>
      <P>
        The <InlineCode>filter_outliers</InlineCode> operation uses z-score by default.
        Flagged rows get a boolean <InlineCode>is_outlier</InlineCode> column for review rather than
        immediate deletion.
      </P>

      <H3>Column standardisation</H3>
      <Callout type="tip">
        "Rename all column headers to snake_case and trim any whitespace."
      </Callout>
      <P>
        <InlineCode>rename_snake_case</InlineCode> and <InlineCode>trim_string_columns</InlineCode>{" "}
        run together in one step.
      </P>

      <MidCTA text="Upload your messy data and describe what needs fixing — DataHub handles the rest." />

      <H2>The feature that makes it worth it: repeatable pipelines</H2>
      <P>
        Every cleaning step you perform in DataHub is recorded as a named pipeline step. When you
        get the same file format next month, run the pipeline again on the new file. The same
        cleaning logic applies automatically — no re-setup, no forgetting what you did last time.
      </P>
      <P>
        This is the part Excel and manual pandas scripts can't easily provide: a cleaning workflow
        that's reproducible, shareable with team members, and auditable (you can see exactly what
        was changed and when).
      </P>

      <H2>Comparison: data cleaning tools for analysts</H2>
      <CompareTable
        colA="Excel / Manual"
        colB="DataHub"
        rows={[
          {
            feature: "Null handling",
            manual: "Find & Replace — misses pseudo-nulls",
            datahub: "fill_nulls with pseudo-null detection (N/A, null, -, etc.)",
          },
          {
            feature: "Type conversion",
            manual: "TEXT(), VALUE(), DATEVALUE() formulas — manual per column",
            datahub: "Auto-detect and cast; handles mixed date formats",
          },
          {
            feature: "Deduplication",
            manual: "Remove Duplicates — no fuzzy matching, no preview",
            datahub: "Exact + fuzzy dedup with similarity threshold and preview",
          },
          {
            feature: "Outlier detection",
            manual: "Manual z-score formula or conditional formatting",
            datahub: "filter_outliers with configurable z-score threshold",
          },
          {
            feature: "Column standardisation",
            manual: "Manual rename one by one",
            datahub: "rename_snake_case — all columns in one step",
          },
          {
            feature: "Repeatable on new data",
            manual: "Must redo steps manually each time",
            datahub: "Saved as a pipeline — re-run on new files with one click",
          },
          {
            feature: "Audit trail",
            manual: "None — changes are not logged",
            datahub: "Every step logged with timestamp, user, and operation",
          },
        ]}
      />

      <FAQ
        items={[
          {
            q: "Does DataHub profile data automatically when I upload a file?",
            a: "Yes. On upload, DataHub runs a column-level profile showing data types, null percentages, unique counts, top values, and flagged anomalies. This appears before you run any cleaning steps, so you know exactly what's in your data before doing anything.",
          },
          {
            q: "Can I clean data from a database connection, not just uploaded files?",
            a: "Yes. Connect to PostgreSQL, MySQL, Snowflake, BigQuery, or another supported source and run cleaning operations directly against the live data. The same pipeline steps work regardless of the data source.",
          },
          {
            q: "How do I share a cleaning pipeline with a colleague?",
            a: "On Team plan and above, pipelines are visible to all project members. Team members can view, run, and fork pipelines. On Business plan, you can require approval before a pipeline runs against production data.",
          },
          {
            q: "Can DataHub validate data against rules before I clean it?",
            a: "Yes. The validate_rules operation checks columns against conditions (not_null, >, >=, <, <=, ==, unique, regex, min_length) and can flag, filter, or report violations. This is useful for catching issues in incoming data before a cleaning pipeline runs.",
          },
        ]}
      />
    </Article>
  );
}
