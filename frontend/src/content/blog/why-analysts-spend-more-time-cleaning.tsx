import {
  Article, Lead, H2, H3, P, UL, LI, Strong, Callout,
  MidCTA, FAQ,
} from "./_components";

export default function WhyAnalystsSpendMoreTimeCleaning() {
  return (
    <Article>
      <Lead>
        The IBM Data Analytics study found that data scientists spend 60–80% of their time on data
        preparation rather than actual analysis. That figure has been quoted for years. In 2026, it
        hasn't changed. The tools have improved; the problem hasn't. This is why — and what's
        actually being done about it.
      </Lead>

      <H2>The number that should have changed by now</H2>
      <P>
        "80% of data work is data preparation" entered the industry conversation around 2016. In the
        decade since, we've seen the rise of cloud data warehouses, no-code BI tools, AI-assisted
        analytics, and a proliferation of ETL and data preparation products. The market has invested
        heavily in tools to solve this problem.
      </P>
      <P>
        And yet the surveys keep returning the same number. Anaconda's 2022 State of Data Science
        report found 45% of time spent on data prep. Kaggle's annual ML & Data Science Survey
        showed data cleaning as the most time-consuming task for four consecutive years. Gartner
        estimated 60% of analytics project time goes to data preparation.
      </P>
      <P>
        The number isn't moving because the tools aren't addressing the right part of the problem.
      </P>

      <H2>Why data is messier than it should be</H2>

      <H3>Data is captured by systems optimised for input, not output</H3>
      <P>
        CRM systems are designed to capture sales activity. ERP systems are designed to process
        transactions. Survey tools are designed to collect responses. None of them are designed with
        data analysis in mind. The result: inconsistent field names across modules, free-text fields
        where structured inputs would help, nullable columns that should be required, date formats
        that differ between export types.
      </P>
      <P>
        The analyst receives data shaped by the input system's priorities, not their own.
      </P>

      <H3>Data moves through many hands</H3>
      <P>
        A typical analyst's dataset has passed through: the source system, an export step, an email
        attachment or file share, possibly a manual copy-paste into another file, and finally the
        analyst's desktop. Each handoff is an opportunity for corruption: encoding changes, row
        truncation, extra header rows added, cells reformatted by Excel's auto-type detection.
      </P>

      <H3>Manual data entry is unavoidable</H3>
      <P>
        Despite automation, a significant portion of business data still involves human input. And
        humans are inconsistent: "United Kingdom", "UK", "U.K.", "England" all mean the same thing
        and appear in the same column in the same dataset. No system prevents this unless input
        validation is rigorously enforced at the point of entry — which it rarely is.
      </P>

      <H3>The schema changes without notice</H3>
      <P>
        A supplier changes their export format. A SaaS tool updates and renames fields in its API
        response. A colleague adds three columns to a shared spreadsheet. Downstream pipelines and
        cleaning scripts break silently. The analyst discovers this when a report number is wrong —
        which could be days after the change happened.
      </P>

      <H2>Why existing tools haven't solved it</H2>

      <H3>The problem isn't the cleaning — it's the discovery</H3>
      <P>
        Most data cleaning tools excel at applying transformations once you know what needs to be
        done. The hard part is finding out what needs to be done: which columns have null values,
        which are mistyped, where the duplicates are, which values are inconsistent. This discovery
        work is manual — scrolling through data, building summary statistics, running ad hoc queries
        — and it happens before the cleaning tool is even opened.
      </P>

      <H3>One-off scripts don't scale</H3>
      <P>
        Many analysts clean data by writing a pandas script or a series of Excel formulas that work
        for the current file. Next week, a slightly different file arrives and the script breaks.
        The cleaning isn't repeatable, so the same work is done again from scratch.
      </P>

      <H3>The tool-skill gap</H3>
      <P>
        The most powerful data cleaning tools — Python, SQL, dbt — require technical skills that
        most business analysts don't have. The tools accessible to business analysts — Excel, Power
        Query — have significant limitations for complex cleaning tasks. This gap means either the
        analyst uses the wrong tool slowly, or they depend on engineering support that isn't always
        available.
      </P>

      <MidCTA text="See what automated data cleaning looks like in practice — free, no install." />

      <H2>What's actually changing in 2026</H2>

      <H3>AI-assisted data profiling</H3>
      <P>
        The first meaningful breakthrough is AI-assisted profiling — tools that look at a dataset
        and immediately surface what's wrong: "Column 3 has 34% nulls and appears to be a date
        column stored as text. Column 7 has 12% near-duplicate values. Column 9 contains what looks
        like pseudo-nulls: 'N/A', '-', 'unknown'."
      </P>
      <P>
        This replaces the discovery step — the part that previously required manual exploration —
        with an automated audit that happens in seconds.
      </P>

      <H3>Plain-English cleaning instructions</H3>
      <P>
        The second breakthrough is the ability to describe cleaning operations in natural language
        rather than code or tool-specific formulas. "Remove duplicates based on email, keep the
        most recent record" is executed directly, without the analyst needing to know which menu to
        use or which function to call.
      </P>
      <P>
        This closes the tool-skill gap: business analysts can now access operations that previously
        required Python or SQL knowledge, described in the same language they'd use to explain the
        task to a colleague.
      </P>

      <H3>Repeatable pipelines</H3>
      <P>
        The third breakthrough is repeatability. Tools that record cleaning steps as named,
        re-runnable pipelines mean that the same cleaning work is done once and then applied
        automatically to every subsequent file. The first run takes the same effort as before.
        Every subsequent run takes seconds.
      </P>

      <H2>Why 80% is still the number in 2026</H2>
      <P>
        The tools exist to reduce the 80% significantly. The reason the surveys still show the same
        number is adoption: most analysts are still using the tools they learned when they started
        their career — Excel for business analysts, pandas for technical analysts. These tools are
        powerful, but they don't have automatic profiling, AI-assisted cleaning, or repeatable
        pipelines.
      </P>
      <P>
        The gap between "what the best tools now offer" and "what most analysts are actually using"
        represents the real opportunity for individual analysts to gain a significant productivity
        advantage by switching tools before their peers do.
      </P>
      <P>
        The analysts who close the gap soonest spend 20–30% of their time on data prep instead of
        80%, and redirect the rest to the analysis that actually generates insight.
      </P>

      <FAQ
        items={[
          {
            q: "Is 80% of time on data prep really accurate, or is it an exaggerated figure?",
            a: "It's a rough average across a range of roles and industries. Technical data scientists with mature pipelines may spend closer to 30–40% on prep. Business analysts working with ad hoc data and no engineering support often spend more than 80%. The number that matters is your own — most analysts who track their time for a week are surprised by how much of it goes to preparation vs analysis.",
          },
          {
            q: "Can AI tools genuinely reduce data cleaning time, or is it marketing?",
            a: "For the common cases — null handling, type conversion, deduplication, column standardisation — AI-assisted tools genuinely cut cleaning time from hours to minutes. The harder cases (data with complex business logic, schema mismatches requiring domain knowledge, regulatory data quality requirements) still require human judgment. The AI handles the routine work; you handle the judgment calls.",
          },
          {
            q: "What's the most impactful single change an analyst can make to reduce prep time?",
            a: "Make your cleaning steps repeatable. The biggest time waste is redoing the same cleaning work every time a new file arrives. Tools that save cleaning steps as pipelines — including DataHub — mean the first run is the only hard one. Every subsequent run is automated.",
          },
          {
            q: "Does reducing prep time actually improve the quality of analysis?",
            a: "Yes, in two ways. First, analysts who spend less time on prep have more time to explore the data and ask better questions — the analysis phase gets more attention. Second, repeatable pipelines applied consistently produce cleaner data than manual cleaning done under time pressure, which reduces errors in the final output.",
          },
        ]}
      />
    </Article>
  );
}
