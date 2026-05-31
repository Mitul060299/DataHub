export interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  date: string; // ISO 8601 YYYY-MM-DD
  readTime: number; // minutes
  tags: string[];
  faqItems?: { q: string; a: string }[]; // optional — injected as FAQPage schema
}

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "why-analysts-spend-more-time-cleaning",
    title: "Why Data Analysts Spend More Time Cleaning Data Than Analysing It",
    excerpt:
      "Survey after survey shows the same thing: analysts spend 60–80% of their time on data preparation, not analysis. Why is this still true in 2026, and what can be done about it?",
    date: "2026-04-22",
    readTime: 8,
    tags: ["Data Cleaning", "Productivity", "Industry"],
  },
  {
    slug: "clean-messy-excel-csv-without-coding",
    title: "How to Clean Messy Excel and CSV Files Faster — Without Coding",
    excerpt:
      "Leading spaces, mixed date formats, merged cells, hidden characters, inconsistent nulls — messy files are the norm, not the exception. This guide walks through every common problem and how to fix it fast.",
    date: "2026-04-25",
    readTime: 10,
    tags: ["Excel", "CSV", "Data Cleaning"],
  },
  {
    slug: "remove-duplicates-csv-without-code",
    title: "How to Remove Duplicates from a CSV File Without Code",
    excerpt:
      "Duplicate rows corrupt aggregations, bloat reports, and erode trust in your data. This guide shows you the fastest ways to deduplicate a CSV — including fuzzy matching for near-duplicates — without writing a single line of code.",
    date: "2026-04-28",
    readTime: 8,
    tags: ["CSV", "Deduplication", "Data Cleaning"],
  },
  {
    slug: "standardise-column-names-excel",
    title: "How to Standardise Column Names in Excel Automatically",
    excerpt:
      "Inconsistent column headers — 'Customer ID', 'customer_id', 'CustID', 'cust id' — break every VLOOKUP, pivot table, and downstream report. Here's how to fix them in bulk without manual renaming.",
    date: "2026-05-01",
    readTime: 7,
    tags: ["Excel", "Column Names", "Data Cleaning"],
  },
  {
    slug: "reconcile-excel-files-automatically",
    title: "How to Reconcile Two Excel Files Automatically",
    excerpt:
      "If you're comparing two spreadsheets row by row, highlighting differences by hand, you're doing it the hard way. Here's how to automate Excel reconciliation in minutes — no formulas, no VBA.",
    date: "2026-05-04",
    readTime: 9,
    tags: ["Excel", "Reconciliation", "Data Cleaning"],
  },
  {
    slug: "prepare-raw-data-for-power-bi",
    title: "How to Prepare Raw Data for Power BI Dashboards",
    excerpt:
      "Power BI is powerful — but only if the data going in is clean, properly typed, and structured correctly. This guide covers everything you need to do before you open Power BI Desktop.",
    date: "2026-05-07",
    readTime: 9,
    tags: ["Power BI", "Data Preparation", "Analytics"],
  },
  {
    slug: "alteryx-alternative-cheaper",
    title: "The Best Cheaper Alteryx Alternative in 2026",
    excerpt:
      "Alteryx Designer costs £4,000+ per seat per year. If you need the same data blending, transformation, and automation capabilities at a fraction of the cost, here's what to look at instead.",
    date: "2026-05-09",
    readTime: 10,
    tags: ["Alteryx", "Comparison", "Data Tools"],
  },
  {
    slug: "affordable-alteryx-alternative-small-teams",
    title: "Best Affordable Alteryx Alternative for Small Teams and Freelancers",
    excerpt:
      "Solo analysts and small teams don't need a £40,000/year enterprise licence. These Alteryx alternatives give you the same data transformation power at prices that make sense for freelancers and growing teams.",
    date: "2026-05-12",
    readTime: 9,
    tags: ["Alteryx", "Small Teams", "Freelancers"],
  },
  {
    slug: "data-cleaning-tool-for-analysts",
    title: "The Best Data Cleaning Tool for Analysts (No Code Required)",
    excerpt:
      "Analysts spend 60–80% of their time cleaning data — filling nulls, fixing types, standardising formats, removing outliers. The right tool collapses that to minutes. Here's what to use.",
    date: "2026-05-14",
    readTime: 9,
    tags: ["Data Cleaning", "Analysts", "Productivity"],
  },
  {
    slug: "automate-repetitive-data-cleaning-workflows",
    title: "How to Automate Repetitive Data Cleaning and Transformation Workflows",
    excerpt:
      "If you're running the same data cleaning steps every week — loading a file, fixing nulls, standardising columns, exporting — you're manually doing work a pipeline should handle. Here's how to automate it.",
    date: "2026-05-17",
    readTime: 9,
    tags: ["Automation", "Pipelines", "Data Cleaning"],
  },
  {
    slug: "merge-multiple-csv-files",
    title: "How to Merge Multiple CSV Files Automatically (Without Code)",
    excerpt:
      "Combining dozens of CSV exports by hand — copy-pasting into one sheet, hoping the columns align — wastes hours and introduces errors. Here's how to merge multiple CSV files automatically in minutes.",
    date: "2026-05-19",
    readTime: 8,
    tags: ["CSV", "Merge", "Data Cleaning"],
    faqItems: [
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
    ],
  },
  {
    slug: "ai-etl-tool-for-analysts",
    title: "The Best AI ETL Tool for Analysts: No Engineering Team Needed",
    excerpt:
      "Traditional ETL tools were built for data engineers, not analysts. They require pipelines written in Python or SQL, infrastructure to maintain, and weeks to set up. Here's what analysts should use instead.",
    date: "2026-05-20",
    readTime: 9,
    tags: ["ETL", "Analysts", "Data Tools"],
    faqItems: [
      {
        q: "Does DataHub replace dbt or Airflow?",
        a: "No. DataHub is designed for analysts doing analytical ETL — cleaning files, joining tables, scheduling reports. dbt and Airflow are engineering tools for large-scale production pipelines. They solve different problems at different scales.",
      },
      {
        q: "Can DataHub connect to Salesforce or HubSpot?",
        a: "DataHub connects to databases (PostgreSQL, MySQL, Snowflake, BigQuery, etc.) and file uploads. For SaaS tools like Salesforce, export your data as CSV and upload it. Native SaaS connectors are on the roadmap.",
      },
      {
        q: "What transformation operations does DataHub support?",
        a: "30+ built-in operations: null handling, type casting, deduplication (exact and fuzzy), column standardisation, filtering, aggregation, joins, pivots, date parsing, and more. You can also write custom SQL if needed.",
      },
      {
        q: "Is DataHub suitable for finance or accounting teams?",
        a: "Yes. Finance and accounting teams are among the heaviest users of analytical ETL. DataHub handles accounting software exports (QuickBooks, Tally, Xero), reconciliation workflows, and scheduled monthly reporting.",
      },
    ],
  },
  {
    slug: "no-code-data-transformation",
    title: "No-Code Data Transformation: How Analysts Can Do ETL Without Writing Code",
    excerpt:
      "You don't need to know Python or SQL to reshape, clean, and transform data. No-code data transformation tools let analysts do the same work data engineers do — faster and without a ticket queue.",
    date: "2026-05-21",
    readTime: 8,
    tags: ["No-Code", "ETL", "Data Transformation"],
    faqItems: [
      {
        q: "Is DataHub really no-code?",
        a: "Yes. You describe transformations in plain English and DataHub generates the SQL. You can see and edit the SQL if you want to, but you never have to write it.",
      },
      {
        q: "What if I need a transformation DataHub doesn't support natively?",
        a: "DataHub supports custom SQL steps. If you need a specific transformation that isn't in the 30+ built-in operations, you can write the SQL directly and add it as a pipeline step.",
      },
      {
        q: "How is this different from Power Query in Excel?",
        a: "Power Query requires you to understand M query language, manage connections manually, and works only on Windows. DataHub runs in the browser, uses plain English, handles much larger datasets, and supports scheduling and team collaboration.",
      },
      {
        q: "Does it work with databases, or just files?",
        a: "Both. DataHub connects to PostgreSQL, MySQL, Snowflake, BigQuery, Redshift, MSSQL, and Oracle — as well as CSV, Excel, JSON, and Parquet file uploads.",
      },
    ],
  },
  {
    slug: "automate-accounting-exports",
    title: "How to Clean and Transform Accounting Software Exports Automatically",
    excerpt:
      "QuickBooks, Tally, Xero, and SAP exports are rarely analysis-ready. They come with merged headers, inconsistent date formats, blank rows, and columns that shift between exports. Here's how to fix that automatically.",
    date: "2026-05-22",
    readTime: 9,
    tags: ["Accounting", "Automation", "Data Cleaning"],
    faqItems: [
      {
        q: "Does DataHub work with Indian accounting software like Tally and Zoho Books?",
        a: "Yes. DataHub handles CSV and Excel exports from any accounting software. It automatically detects Indian number formats (₹1,23,456) and date formats (DD-Mon-YY, DD/MM/YYYY) used by Tally and similar tools.",
      },
      {
        q: "How does DataHub handle the debit/credit suffix in Tally exports?",
        a: "You can describe the parsing logic in plain English: 'The Amount column has Dr and Cr suffixes — treat Cr as negative and Dr as positive, then convert to a number.' DataHub generates the correct SQL transformation.",
      },
      {
        q: "Can I schedule the cleanup to run automatically?",
        a: "Yes. Once you've saved a cleanup pipeline, you can schedule it to run daily, weekly, or monthly. Connect a cloud storage folder and DataHub picks up new exports automatically.",
      },
      {
        q: "Is the cleanup logic reusable if the format changes slightly next month?",
        a: "Pipelines are editable. If the export format changes slightly — an extra column appears, or the date format changes — you can update the relevant step without rebuilding the whole pipeline.",
      },
    ],
  },
  {
    slug: "automate-monthly-excel-reports",
    title: "How to Automate Monthly Excel Reports Without Macros or VBA",
    excerpt:
      "If you spend hours every month running the same Excel report — refreshing pivot tables, cleaning source data, reformatting columns — there's a better way. Here's how to automate the whole workflow without writing a single macro.",
    date: "2026-05-24",
    readTime: 9,
    tags: ["Excel", "Automation", "Reporting"],
    faqItems: [
      {
        q: "Do I need to know SQL to use DataHub for reports?",
        a: "No. You describe what you want in plain English and DataHub generates the SQL. You can see and edit it, but you never have to write it from scratch.",
      },
      {
        q: "Can DataHub replace Excel for reporting entirely?",
        a: "For the data transformation and aggregation parts of a report, yes. DataHub produces clean, analysis-ready tables. You can download as Excel or push to a dashboard. For complex formatting — custom charts, print layouts — Excel or a BI tool handles the final presentation step.",
      },
      {
        q: "What if I have 20 source files that merge each month?",
        a: "DataHub supports merging multiple files in a single pipeline step. Upload all files, describe the merge logic, and it handles column alignment, deduplication, and stacking automatically.",
      },
      {
        q: "Can I send the output to someone automatically?",
        a: "Scheduled pipelines can push output to a shared dashboard link, a download URL, or a cloud storage folder. Email delivery of reports is on the product roadmap.",
      },
    ],
  },
  {
    slug: "automate-excel-transformations",
    title: "How to Automate Excel Transformations: Build Reusable Pipelines Without VBA",
    excerpt:
      "If you run the same Excel transformations every week — cleaning a report, reformatting a column, joining two files — you're doing work a pipeline should handle. Here's how to automate Excel transformations so the data arrives clean without you touching it.",
    date: "2026-05-28",
    readTime: 8,
    tags: ["Excel", "Automation", "Pipelines"],
    faqItems: [
      {
        q: "Can DataHub automate transformations on Excel files I receive via email?",
        a: "Not automatically from email. You upload the file to DataHub manually, then run your saved pipeline on it — which takes seconds rather than the minutes of manual work.",
      },
      {
        q: "What if the columns change in a new file?",
        a: "DataHub will flag any column name mismatches when you upload a new file against a saved pipeline. You can update the column mapping step without rebuilding the whole workflow.",
      },
      {
        q: "How many transformation steps can a pipeline have?",
        a: "There's no hard limit. Real-world pipelines typically have 5–20 steps. Each step is named, ordered, and fully editable after the pipeline is saved.",
      },
    ],
  },
  {
    slug: "clean-csv-files-with-ai",
    title: "How to Clean CSV Files with AI: Fix Formatting, Nulls, and Duplicates Fast",
    excerpt:
      "AI tools have made cleaning CSV files dramatically faster — you describe what needs fixing in plain English, the AI generates the transformation logic, and the file comes out clean. Here's how to use AI to fix the most common CSV data quality problems in minutes.",
    date: "2026-05-29",
    readTime: 9,
    tags: ["CSV", "AI", "Data Cleaning"],
    faqItems: [
      {
        q: "Does DataHub change my original CSV file?",
        a: "No. DataHub works on a copy of your uploaded data. Your original file is never modified. You export the clean results as a new file.",
      },
      {
        q: "Can I clean CSV files with different column orders?",
        a: "Yes. DataHub operations work by column name, not position. If the column order changes between files, the same pipeline still works correctly.",
      },
      {
        q: "Is AI CSV cleaning accurate?",
        a: "DataHub's AI generates SQL transformations that you review before they run. The accuracy depends on how precisely you describe the problem. For ambiguous cases, DataHub flags rows for your review rather than making assumptions.",
      },
    ],
  },
  {
    slug: "best-data-analysis-tool-small-teams",
    title: "Best Data Analytics Tool for Analysts and Small Teams in 2026",
    excerpt:
      "The best data analytics tool for your team depends on what your team actually is. For analysts without a data engineering background, tools that require Python, SQL expertise, or complex setup often get abandoned. Here's an honest comparison of the best options for analysts in 2026.",
    date: "2026-05-30",
    readTime: 11,
    tags: ["Data Analytics", "Comparison", "Small Teams"],
    faqItems: [
      {
        q: "What is the best free data analytics tool?",
        a: "DataHub's free plan for data preparation and analysis; Google Looker Studio for free visualisation; Google Sheets or Excel Online for basic spreadsheet analytics.",
      },
      {
        q: "What's the best data analysis tool for small teams?",
        a: "DataHub — affordable (free plan + $19/month), requires no data engineering skills to operate, and reduces manual weekly data work through automation.",
      },
    ],
  },
  {
    slug: "julius-ai-alternative",
    title: "Julius AI Alternative: Reusable Pipelines Instead of One-Off Chat",
    excerpt:
      "Julius AI is impressive for one-off data exploration. But if you're doing the same analysis every week on updated data, one-off chat isn't enough. Here's why analysts look for Julius AI alternatives with pipeline automation.",
    date: "2026-05-31",
    readTime: 8,
    tags: ["Julius AI", "Comparison", "Pipelines"],
    faqItems: [
      {
        q: "Is DataHub a Julius AI replacement?",
        a: "They serve different use cases. Julius AI is excellent for ad-hoc conversational exploration. DataHub is designed for recurring analytical workflows — building pipelines that run automatically on fresh data.",
      },
      {
        q: "Can DataHub do AI-powered analysis like Julius AI?",
        a: "Yes. DataHub accepts plain-English analysis requests — 'show me revenue by region', 'identify top customers by spend' — and generates SQL queries that run against your data.",
      },
    ],
  },
  {
    slug: "copilot-for-excel-alternative",
    title: "Copilot for Excel Alternative: AI Data Preparation That Works Beyond Excel",
    excerpt:
      "Copilot for Excel adds AI to Microsoft Excel — but requires a $30/user/month add-on, works only inside Excel files, and doesn't automate workflows or connect to external databases. Here are the best alternatives for analysts who need more.",
    date: "2026-05-31",
    readTime: 9,
    tags: ["Copilot for Excel", "Microsoft 365", "Comparison"],
    faqItems: [
      {
        q: "Is DataHub a good Copilot for Excel alternative?",
        a: "If you need AI-powered data preparation that works across multiple data sources and builds reusable pipelines — yes. If you need deep Excel formula assistance within Microsoft 365, Copilot for Excel is more convenient.",
      },
      {
        q: "What is the cheapest AI data analysis tool?",
        a: "DataHub has a free plan. Paid plans start at $19/month. Copilot for Excel requires an additional $30/user/month on top of Microsoft 365.",
      },
    ],
  },
  {
    slug: "power-query-alternative",
    title: "Power Query Alternative: No M Code, Works Outside Microsoft Tools",
    excerpt:
      "Power Query is Microsoft's built-in data transformation tool for Excel and Power BI. It's capable, but complex transformations require M code and it doesn't schedule independently. Here are the best Power Query alternatives for analysts who want more.",
    date: "2026-05-31",
    readTime: 9,
    tags: ["Power Query", "Microsoft 365", "Comparison"],
    faqItems: [
      {
        q: "Can DataHub replace Power Query entirely?",
        a: "For data preparation workflows that feed into Power BI, yes — DataHub can replace Power Query as the transformation layer while Power BI remains the visualisation tool.",
      },
      {
        q: "Does DataHub work with Power BI?",
        a: "Yes. DataHub can export clean, transformed data to CSV, a connected database, or directly to Power BI-compatible formats.",
      },
    ],
  },
  {
    slug: "knime-alternative",
    title: "KNIME Alternative for Analysts: No Installation, No Node Graph Required",
    excerpt:
      "KNIME is a powerful open-source data analytics platform but requires a Java desktop installation, weeks of learning, and expensive Server licensing for scheduling. Here are the best KNIME alternatives for analysts who need capable data preparation without the complexity.",
    date: "2026-05-31",
    readTime: 9,
    tags: ["KNIME", "Comparison", "Data Tools"],
    faqItems: [
      {
        q: "Is there a free KNIME alternative?",
        a: "DataHub has a free plan with 50 AI messages/month, 10 pipeline runs, and 500 MB storage. For browser-based, no-install KNIME-like capability, DataHub's free tier is the most accessible starting point.",
      },
      {
        q: "What's a good KNIME alternative for non-data-scientists?",
        a: "DataHub — designed for analysts who work with data daily but don't have machine learning or data engineering backgrounds.",
      },
    ],
  },
  {
    slug: "dataiku-alternative",
    title: "Dataiku Alternative for Small Teams: Analyst-Focused, Not Enterprise-Only",
    excerpt:
      "Dataiku is a leading enterprise AI platform — excellent for large organisations running complex ML workflows, but priced at $30,000+/year and designed for data scientists. Here are the best Dataiku alternatives for small teams and analysts.",
    date: "2026-05-31",
    readTime: 9,
    tags: ["Dataiku", "Comparison", "Small Teams"],
    faqItems: [
      {
        q: "What is the best Dataiku alternative for small teams?",
        a: "DataHub for data preparation, pipeline automation, and analyst-focused workflows at a price point that's practical for teams of 1–50 people.",
      },
      {
        q: "Is Dataiku overkill for a small analytics team?",
        a: "For most small analytics teams doing data preparation, reporting, and dashboard work — yes. Dataiku's pricing and complexity reflect the enterprise market it's designed for.",
      },
    ],
  },
];

export function getPostBySlug(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((p) => p.slug === slug);
}

export function getRelatedPosts(slug: string, count = 3): BlogPost[] {
  const post = getPostBySlug(slug);
  if (!post) return BLOG_POSTS.slice(0, count);
  return BLOG_POSTS.filter(
    (p) =>
      p.slug !== slug &&
      p.tags.some((t) => post.tags.includes(t)),
  ).slice(0, count);
}
