import {
  Article, Lead, H2, H3, P, UL, LI, OL, Strong, Callout, InlineCode, CodeBlock,
  CompareTable, MidCTA, FAQ,
} from "./_components";

export default function StandardiseColumnNamesExcel() {
  return (
    <Article>
      <Lead>
        "Customer ID", "customer_id", "CustID", "cust id", "CUSTOMER_ID". Same data, five different
        column headers across five different files. Every VLOOKUP fails. Every SUMIF breaks. Every
        Power Query merge needs manual mapping. There is a faster way to fix this.
      </Lead>

      <H2>Why inconsistent column names cause so many problems</H2>
      <P>
        Column name inconsistency is one of the most common and most avoidable sources of data
        integration failures. It appears when:
      </P>
      <UL>
        <LI>Multiple teams or departments maintain their own versions of the same dataset</LI>
        <LI>Data is exported from different systems that don't share a naming convention</LI>
        <LI>Files are created manually by different people over time</LI>
        <LI>Software updates change column names in exports</LI>
        <LI>Someone renames a column "to make it clearer" without updating downstream files</LI>
      </UL>
      <P>
        The downstream effects cascade quickly. A VLOOKUP referencing{" "}
        <InlineCode>Customer ID</InlineCode> silently fails when the column is named{" "}
        <InlineCode>CustID</InlineCode> in the source. A Power Query merge needs manual column
        matching every time. A database INSERT rejects the file because the header doesn't match the
        table schema.
      </P>
      <P>
        The solution is to standardise column names to a consistent format before any of this
        downstream processing happens.
      </P>

      <H2>The Excel approach: manual rename</H2>
      <P>
        In Excel, you rename columns by clicking the header cell and typing. For a file with 8
        columns, that's 8 manual edits. For a file with 80 columns — a standard CRM or ERP export
        — it's 80 manual edits, each with a risk of typo introducing the same inconsistency you
        were trying to fix.
      </P>
      <P>
        You can use Find & Replace on the header row to do bulk replacements, but it won't convert
        "Customer Revenue (GBP)" to "customer_revenue_gbp" in one step. You need multiple passes:
        lowercase, replace spaces with underscores, remove special characters, remove parentheses.
      </P>
      <P>
        In Python, you'd write something like:
      </P>
      <CodeBlock>{`import re
df.columns = [
    re.sub(r'[^a-z0-9]+', '_', col.lower().strip()).strip('_')
    for col in df.columns
]`}</CodeBlock>
      <P>
        This works perfectly, but it requires opening Python, loading the file, running the script,
        and exporting the result. For a one-off fix, the overhead is worth it. For a recurring
        process, you need this automated.
      </P>

      <H2>Standardising column names automatically in DataHub</H2>
      <P>
        Upload your file and run a single instruction:
      </P>
      <Callout type="tip">
        "Standardise all column names to snake_case."
      </Callout>
      <P>
        DataHub's <InlineCode>rename_snake_case</InlineCode> operation does the following in one
        step:
      </P>
      <OL>
        <LI>Converts all characters to lowercase</LI>
        <LI>Replaces spaces, hyphens, and special characters with underscores</LI>
        <LI>Collapses consecutive underscores to one</LI>
        <LI>Strips leading and trailing underscores</LI>
        <LI>Removes characters not allowed in column names</LI>
      </OL>
      <P>So these column names:</P>
      <CodeBlock>{`Customer ID
Revenue (GBP)
First Name
Date of Purchase
EMAIL ADDRESS
Product-Code`}</CodeBlock>
      <P>Become:</P>
      <CodeBlock>{`customer_id
revenue_gbp
first_name
date_of_purchase
email_address
product_code`}</CodeBlock>

      <H3>Trimming whitespace at the same time</H3>
      <P>
        A silent column name problem is whitespace: the column is named{" "}
        <InlineCode>"Customer ID "</InlineCode> (trailing space) in one file and{" "}
        <InlineCode>"Customer ID"</InlineCode> in another. They look identical visually but don't
        match in a join. DataHub's <InlineCode>trim_string_columns</InlineCode> strips leading and
        trailing whitespace from all string columns, including header names.
      </P>

      <H3>Renaming specific columns to your convention</H3>
      <P>
        If you need specific column names rather than auto-generated snake_case:
      </P>
      <Callout type="tip">
        "Rename 'CustID' to 'customer_id', 'Rev GBP' to 'revenue_gbp', and 'Dt Purch' to
        'purchase_date'."
      </Callout>
      <P>
        The agent applies individual renames via <InlineCode>rename_columns</InlineCode>. You can
        combine this with snake_case normalisation if you want: normalise everything first, then
        apply specific overrides.
      </P>

      <MidCTA text="Upload your file and standardise column names in seconds — free, no install." />

      <H2>Handling column name mismatches when joining files</H2>
      <P>
        The most common scenario where column name inconsistency is painful is when joining two
        files. DataHub's schema comparison API helps here: upload both files and ask:
      </P>
      <Callout type="tip">
        "Compare the column names in these two files and tell me which columns match."
      </Callout>
      <P>
        DataHub returns:
      </P>
      <UL>
        <LI>Exact matches (same name in both files)</LI>
        <LI>Fuzzy matches (similar names that likely refer to the same column, with a similarity score)</LI>
        <LI>Columns only in file A or only in file B</LI>
      </UL>
      <P>
        You confirm the fuzzy matches, then DataHub standardises both files before performing the
        join — so the merge works without any manual column mapping.
      </P>

      <H2>Comparison: manual vs automated column standardisation</H2>
      <CompareTable
        colA="Excel / Manual"
        colB="DataHub"
        rows={[
          {
            feature: "Bulk rename to snake_case",
            manual: "Multiple Find & Replace passes + manual formula",
            datahub: "rename_snake_case — one instruction, all columns",
          },
          {
            feature: "Whitespace stripping in headers",
            manual: "Not visible; causes silent join failures",
            datahub: "Auto-stripped on upload and via trim_string_columns",
          },
          {
            feature: "Specific column renames",
            manual: "Click each cell, type new name — error-prone at scale",
            datahub: "rename_columns — describe in plain English",
          },
          {
            feature: "Cross-file column matching",
            manual: "Manual column-by-column comparison",
            datahub: "Schema comparison API with fuzzy match suggestions",
          },
          {
            feature: "Repeatable on new files",
            manual: "Must redo every time",
            datahub: "Saved as pipeline step — re-run on next file",
          },
        ]}
      />

      <H2>Making column standardisation part of your regular workflow</H2>
      <P>
        If you receive the same file format monthly but the column names drift between exports, add
        a <InlineCode>rename_snake_case</InlineCode> step at the start of your cleaning pipeline.
        Every time a new file arrives, the pipeline normalises the headers before any downstream
        processing. The rest of the pipeline always receives consistent column names, regardless of
        what the source exported.
      </P>

      <FAQ
        items={[
          {
            q: "Does snake_case standardisation change the actual data, or just the headers?",
            a: "Only the column headers change. The values in each column are untouched. If you want to also standardise string values within a column (e.g. normalise 'CustomerID' values that appear inconsistently in the data), use a separate trim or case-normalisation step on that column.",
          },
          {
            q: "What if two columns get the same name after standardisation?",
            a: "DataHub detects naming collisions and appends a suffix (_2, _3) to disambiguate. It shows you the collision before confirming the rename so you can choose a custom name for one of the conflicting columns.",
          },
          {
            q: "Can I define a custom naming convention instead of snake_case?",
            a: "Yes. You can describe the convention in plain English ('rename all columns to camelCase', 'prefix all column names with the table name followed by an underscore') and the agent will generate the rename mapping. For complex conventions, you can also provide the mapping as a key-value list.",
          },
          {
            q: "Does DataHub handle multi-level column headers (as appear in some Excel exports)?",
            a: "Yes. DataHub detects multi-row headers and prompts you to confirm which row is the header row. It then flattens multi-level headers by concatenating levels with an underscore, then applies snake_case normalisation.",
          },
        ]}
      />
    </Article>
  );
}
