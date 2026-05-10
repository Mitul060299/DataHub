import {
  Article, Lead, H2, H3, P, UL, LI, OL, Strong, Callout, InlineCode,
  CompareTable, MidCTA, FAQ,
} from "./_components";

export default function PrepareRawDataForPowerBi() {
  return (
    <Article>
      <Lead>
        Power BI can build remarkable dashboards. What it can't do is fix your data. Load a file
        where dates are stored as text, nulls are labelled "N/A", and column names have spaces and
        special characters — and your measures will be wrong, your filters will break, and your
        report will be unpresentable. The work happens before you open Power BI Desktop.
      </Lead>

      <H2>Why data preparation matters more than dashboard design</H2>
      <P>
        A beautifully designed Power BI dashboard built on dirty data is a liability, not an asset.
        Stakeholders trust charts. If the underlying data has duplicate records, silent null values
        masquerading as zeros, or incorrectly typed columns, the numbers will be wrong — and the
        dashboard will present wrong numbers with high visual confidence.
      </P>
      <P>
        The most common Power BI support tickets are not about visualisation configuration. They're
        about data: "Why is the total different from the sum of the column?", "Why does the date
        filter not work?", "Why does RELATED() return blank?" These are almost always data quality
        problems upstream, not Power BI problems.
      </P>

      <H2>Step 1: Fix column names before import</H2>
      <P>
        Power BI handles column names with spaces and special characters, but it makes writing DAX
        awkward. A column named <InlineCode>Customer Revenue (GBP)</InlineCode> requires
        square brackets everywhere: <InlineCode>[Customer Revenue (GBP)]</InlineCode>. A column
        named <InlineCode>customer_revenue_gbp</InlineCode> is cleaner in every measure and
        calculated column.
      </P>
      <P>
        Standardise all column names to snake_case before import. In DataHub:
      </P>
      <Callout type="tip">
        "Rename all column headers to snake_case."
      </Callout>
      <P>
        This one step makes every DAX measure, relationship, and calculated column easier to write
        and less error-prone.
      </P>

      <H2>Step 2: Set correct data types</H2>
      <P>
        Power BI tries to detect column types automatically, but it's conservative and frequently
        wrong. Common failures:
      </P>
      <UL>
        <LI>
          <Strong>Dates stored as text:</Strong> Power BI imports them as Text type. Date filters,
          time intelligence (SAMEPERIODLASTYEAR, DATESYTD), and date hierarchies don't work at all.
        </LI>
        <LI>
          <Strong>Numbers with currency symbols or commas:</Strong> Import as Text. SUM returns 0.
        </LI>
        <LI>
          <Strong>Boolean columns stored as "Yes"/"No" or "1"/"0":</Strong> Treated as text; can't
          be used in COUNT or filter logic naturally.
        </LI>
        <LI>
          <Strong>IDs stored as integers:</Strong> Power BI may try to aggregate them (an average
          customer ID is meaningless). Cast to text to prevent this.
        </LI>
      </UL>
      <P>Fix these before import. In DataHub:</P>
      <Callout type="tip">
        "Parse the order_date column as a date in DD/MM/YYYY format. Convert revenue to a decimal
        number — remove any currency symbols or commas. Convert customer_id to text."
      </Callout>

      <H2>Step 3: Handle null and missing values</H2>
      <P>
        Power BI's handling of blanks (nulls) is a frequent source of incorrect aggregations. A
        row with a null revenue value is excluded from AVERAGE but included in COUNT. A null in a
        relationship key breaks RELATED(). A null in a date column breaks time intelligence.
      </P>
      <P>
        Before import, decide what nulls mean in each column and handle them explicitly:
      </P>
      <UL>
        <LI>Revenue null → 0 (no transaction, not missing data)</LI>
        <LI>Date null → flag the row; exclude from time-series analysis</LI>
        <LI>Category null → "Unknown" (so slicers show a category rather than a blank)</LI>
        <LI>Relationship key null → investigate the source; these rows may be orphan records</LI>
      </UL>
      <Callout type="tip">
        "Fill null values in the revenue column with 0. Fill null category values with 'Unknown'.
        Flag rows where order_date is null."
      </Callout>
      <P>
        Also handle pseudo-nulls — strings like "N/A", "none", "-" that look like values but
        represent missing data. DataHub detects these automatically and lets you treat them as
        proper nulls before deciding how to fill them.
      </P>

      <MidCTA text="Clean your data before Power BI import — free, no install needed." />

      <H2>Step 4: Remove duplicates from fact tables</H2>
      <P>
        Duplicate rows in a fact table inflate every measure. A fact table with 1,000 rows where
        200 are duplicates means every SUM, COUNT, and AVERAGE is wrong. Worse, the error is
        invisible in the visual — the numbers look plausible, just slightly inflated.
      </P>
      <P>
        Check for duplicates on the natural key of your fact table (order ID, transaction ID,
        event ID) before loading into Power BI. If you don't have an explicit key, deduplicate on
        the combination of columns that uniquely identify a row.
      </P>
      <Callout type="tip">
        "Remove duplicate rows. Use order_id as the key — keep the most recent version when there
        are duplicates."
      </Callout>

      <H2>Step 5: Validate relationship keys</H2>
      <P>
        Power BI data models use relationships between tables. A relationship breaks — and
        RELATED() returns blank — when fact table keys have no matching record in the dimension
        table.
      </P>
      <P>
        Before import, validate that every foreign key in your fact table exists in the dimension
        table:
      </P>
      <Callout type="tip">
        "Find all rows in the orders table where the customer_id doesn't exist in the customers
        table."
      </Callout>
      <P>
        DataHub finds the orphan records by filtering fact table rows where the key does not appear
        in the dimension table. You can then decide whether to drop them, add a placeholder
        "Unknown" dimension record, or investigate the source.
      </P>

      <H2>Step 6: Fill date gaps before import</H2>
      <P>
        Power BI's time intelligence functions (SAMEPERIODLASTYEAR, TOTALYTD, etc.) require a
        complete, contiguous date series with no gaps. DataHub's{" "}
        <InlineCode>detect_date_gaps</InlineCode> operation reindexes your date column to fill
        missing dates, ensuring your time series is complete before you load it into Power BI.
      </P>
      <Callout type="tip">
        "Fill any missing dates in the order_date column between 2020-01-01 and today."
      </Callout>
      <P>
        DataHub fills the gaps and exports the result as a clean CSV. Import it alongside your fact
        table and create the relationship in Power BI on the date column. For a full date dimension
        table (year, quarter, month name columns), you can add a{" "}
        <InlineCode>add_calculated_column</InlineCode> step for each attribute.
      </P>

      <H2>Comparison: preparing data in Power Query vs DataHub</H2>
      <CompareTable
        colA="Power Query (in Power BI)"
        colB="DataHub (pre-import prep)"
        rows={[
          {
            feature: "Platform",
            manual: "Windows only — no Mac support",
            datahub: "Browser-based — any OS",
          },
          {
            feature: "Column name standardisation",
            manual: "Manual rename or custom M function",
            datahub: "rename_snake_case — one instruction",
          },
          {
            feature: "Pseudo-null detection",
            manual: "Replace Values per value per column",
            datahub: "Automatic detection and batch fill",
          },
          {
            feature: "Fuzzy deduplication",
            manual: "Merge Queries with fuzzy match (limited)",
            datahub: "fuzzy_deduplicate with configurable threshold",
          },
          {
            feature: "Relationship key validation",
            manual: "Manual anti-join in Power Query steps",
            datahub: "Plain-English: find orphan keys — filtered automatically",
          },
          {
            feature: "Reuse across reports",
            manual: "Copy Power Query steps — file-path dependent",
            datahub: "Saved pipeline re-runs on any new file",
          },
          {
            feature: "AI assistance",
            manual: "None",
            datahub: "Full AI agent — describe problems in plain English",
          },
        ]}
      />

      <H2>The pre-import checklist for Power BI</H2>
      <OL>
        <LI>Standardise column names to snake_case</LI>
        <LI>Set explicit data types (especially dates, decimals, and ID columns)</LI>
        <LI>Handle nulls and pseudo-nulls per column</LI>
        <LI>Remove duplicates from fact tables</LI>
        <LI>Validate foreign key integrity across tables</LI>
        <LI>Fill date gaps to ensure a contiguous date series</LI>
        <LI>Export cleaned files as CSV — import those into Power BI, not the raw originals</LI>
      </OL>

      <FAQ
        items={[
          {
            q: "Should I prepare data before importing into Power BI, or do it in Power Query?",
            a: "Both approaches work, but doing preparation before import keeps your Power BI files lighter, faster to refresh, and easier to share. Power Query transformations run on every refresh, which slows reports. DataHub pipelines run once and produce clean files you import directly.",
          },
          {
            q: "Can DataHub connect directly to Power BI?",
            a: "DataHub exports clean data as CSV or connects to databases that Power BI can then query. There's no direct Power BI connector yet. The typical workflow is: clean data in DataHub → export CSV → import into Power BI (or write cleaned data back to a database and connect Power BI to that).",
          },
          {
            q: "How do I handle incremental data — new rows added each week?",
            a: "Save your cleaning steps as a DataHub pipeline. Each week, upload the new file (or connect to the updated database table) and run the same pipeline. Download the clean output and replace the file in Power BI. If you use a database as the source, you can use Power BI's incremental refresh in combination with DataHub's scheduled pipeline runs.",
          },
          {
            q: "What if my data comes from multiple sources that need to be joined before Power BI?",
            a: "DataHub handles cross-source joins before import. Connect to a database and upload a CSV in the same project, describe the join in plain English, and export the merged result. This produces a single, clean, properly-typed dataset that Power BI can import directly — simpler than building the join inside the Power BI data model.",
          },
        ]}
      />
    </Article>
  );
}
