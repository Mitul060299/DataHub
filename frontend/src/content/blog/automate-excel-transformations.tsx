import {
  Article, Lead, H2, H3, P, UL, LI, Strong, Callout, MidCTA, FAQ,
} from "./_components";

export default function AutomateExcelTransformations() {
  return (
    <Article>
      <Lead>
        If you run the same Excel transformations every week — cleaning a report, reformatting a
        column, joining two files — you're doing work a pipeline should handle. Here's how to
        automate Excel transformations so the data arrives clean without you touching it.
      </Lead>

      <H2>Why analysts keep doing the same Excel transformations manually</H2>
      <P>
        Most Excel transformations aren't complex. They're repetitive. The same export arrives
        every Monday. The same columns need renaming. The same duplicates need removing. The same
        join with the customer master table needs running.
      </P>
      <P>
        The tools to automate this exist — Power Query, VBA macros, Python scripts — but each
        requires a learning investment most analysts haven't had time to make. So the manual work
        continues.
      </P>
      <P>
        AI-powered tools have changed this. You can now describe your transformation in plain
        English, have the AI build the logic, review it, approve it, and save it as a pipeline
        that runs itself every week.
      </P>

      <H2>The five Excel transformations most analysts automate first</H2>

      <H3>1. Column standardisation</H3>
      <P>
        Every export from a different system uses slightly different column names. "Customer ID",
        "customer_id", "CustID", "cust id" — four names for the same thing. Standardising them
        manually before every join wastes hours each week.
      </P>
      <P>
        Automation approach: define a column name mapping once ("CustID → customer_id"), save it
        as a pipeline step. Every time a new file arrives, the mapping runs automatically.
      </P>

      <H3>2. Duplicate removal</H3>
      <P>
        Duplicate rows accumulate in CRM exports, billing data, and multi-source merges. Manual
        deduplication in Excel (Data → Remove Duplicates) works for simple cases but doesn't
        handle fuzzy duplicates — rows that are the same record but spelled slightly differently.
      </P>
      <P>
        Automated deduplication includes both exact matching (same row values) and fuzzy matching
        (similar names, transposed digits in phone numbers). Set the rules once, apply them to
        every file.
      </P>

      <H3>3. Date format normalisation</H3>
      <P>
        Exports from different systems use different date formats: "01/05/2026", "2026-05-01",
        "1 May 2026", "May 1st 2026". Power BI and Tableau need a consistent format — ISO 8601
        (YYYY-MM-DD) is the safest.
      </P>
      <P>
        Automation approach: a single transformation step that detects and normalises any date
        format to ISO 8601. Build it once, it runs every week.
      </P>

      <H3>4. Multi-file merge</H3>
      <P>
        Weekly or monthly exports from regional offices, departments, or time periods pile up as
        individual files. Combining them manually means opening each file, copy-pasting, and
        hoping the columns align.
      </P>
      <P>
        Automated merge: drop new files into a folder (or connect the source), and the pipeline
        unions them automatically, handling column order differences and schema mismatches.
      </P>

      <H3>5. Calculated columns</H3>
      <P>
        Adding a gross margin column, a year-over-year variance column, or a categorical flag
        ("high value", "medium", "low") is the same formula run on every new dataset. Save it as
        a pipeline step once — it applies automatically to every incoming file.
      </P>

      <MidCTA text="Automate your own Excel transformations — free, no install needed." />

      <H2>How to automate Excel transformations with DataHub</H2>
      <P>
        DataHub turns manual Excel transformation steps into reusable, scheduled pipelines. Here's
        the workflow:
      </P>
      <UL>
        <LI>
          <Strong>Upload your Excel file</Strong> — DataHub reads .xlsx and .xls files including
          multi-sheet workbooks, auto-detects data types, and flags quality issues immediately.
        </LI>
        <LI>
          <Strong>Describe each transformation</Strong> — "Rename 'CustID' to 'customer_id'",
          "Remove duplicate rows based on order_id", "Add a gross_margin column = (revenue -
          cost) / revenue". DataHub generates SQL for each step.
        </LI>
        <LI>
          <Strong>Review and approve</Strong> — you see the exact SQL before it runs. Approve,
          edit, or reject each step.
        </LI>
        <LI>
          <Strong>Save as a pipeline</Strong> — all approved steps become a reusable pipeline you
          can replay on any new file or schedule to run automatically.
        </LI>
        <LI>
          <Strong>Schedule it</Strong> — for database-connected sources, connect your database and
          schedule the pipeline to run daily, weekly, or monthly on fresh data.
        </LI>
      </UL>

      <Callout type="tip">
        For file-based sources (Excel uploads), run the saved pipeline manually when a new file
        arrives — it applies all your approved transformations in seconds. For database-connected
        sources, schedule the pipeline to run automatically.
      </Callout>

      <H2>What about Power Query and VBA?</H2>
      <P>
        Power Query is Microsoft's built-in transformation tool and it's good for automating
        transformations within Excel and Power BI. Its main limitations are that it requires
        learning M code for anything beyond basic clicks, it's embedded in .xlsx or .pbix files
        rather than being standalone, and it doesn't schedule itself without Power BI Premium.
      </P>
      <P>
        VBA macros are very flexible but require programming knowledge and are tied to specific
        Excel files. They break when column structures change and can't run independently of Excel.
      </P>
      <P>
        DataHub uses plain-English AI to build the transformation logic, stores pipelines
        independently of the data file, and can schedule against database sources. For analysts
        who don't want to learn M or VBA, it's the fastest path to automation.
      </P>

      <FAQ items={[
        {
          q: "Can DataHub automate transformations on Excel files I receive via email?",
          a: "Not automatically from email. You upload the file to DataHub manually, then run your saved pipeline on it — which takes seconds rather than the minutes of manual work. Webhook integrations for automated file ingestion are on the roadmap.",
        },
        {
          q: "What if the columns change in a new file?",
          a: "DataHub will flag any column name mismatches when you upload a new file against a saved pipeline. You can update the column mapping step in the pipeline to match the new structure without rebuilding the whole workflow.",
        },
        {
          q: "How many transformation steps can a pipeline have?",
          a: "There's no hard limit. Real-world pipelines typically have 5–20 steps. Each step is named, ordered, and fully editable after the pipeline is saved.",
        },
      ]} />
    </Article>
  );
}
