export interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  date: string; // ISO 8601 YYYY-MM-DD
  readTime: number; // minutes
  tags: string[];
}

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "reconcile-excel-files-automatically",
    title: "How to Reconcile Two Excel Files Automatically",
    excerpt:
      "If you're comparing two spreadsheets row by row, highlighting differences by hand, you're doing it the hard way. Here's how to automate Excel reconciliation in minutes — no formulas, no VBA.",
    date: "2026-05-10",
    readTime: 9,
    tags: ["Excel", "Reconciliation", "Data Cleaning"],
  },
  {
    slug: "remove-duplicates-csv-without-code",
    title: "How to Remove Duplicates from a CSV File Without Code",
    excerpt:
      "Duplicate rows corrupt aggregations, bloat reports, and erode trust in your data. This guide shows you the fastest ways to deduplicate a CSV — including fuzzy matching for near-duplicates — without writing a single line of code.",
    date: "2026-05-10",
    readTime: 8,
    tags: ["CSV", "Deduplication", "Data Cleaning"],
  },
  {
    slug: "alteryx-alternative-cheaper",
    title: "The Best Cheaper Alteryx Alternative in 2026",
    excerpt:
      "Alteryx Designer costs £4,000+ per seat per year. If you need the same data blending, transformation, and automation capabilities at a fraction of the cost, here's what to look at instead.",
    date: "2026-05-10",
    readTime: 10,
    tags: ["Alteryx", "Comparison", "Data Tools"],
  },
  {
    slug: "data-cleaning-tool-for-analysts",
    title: "The Best Data Cleaning Tool for Analysts (No Code Required)",
    excerpt:
      "Analysts spend 60–80% of their time cleaning data — filling nulls, fixing types, standardising formats, removing outliers. The right tool collapses that to minutes. Here's what to use.",
    date: "2026-05-10",
    readTime: 9,
    tags: ["Data Cleaning", "Analysts", "Productivity"],
  },
  {
    slug: "standardise-column-names-excel",
    title: "How to Standardise Column Names in Excel Automatically",
    excerpt:
      "Inconsistent column headers — 'Customer ID', 'customer_id', 'CustID', 'cust id' — break every VLOOKUP, pivot table, and downstream report. Here's how to fix them in bulk without manual renaming.",
    date: "2026-05-10",
    readTime: 7,
    tags: ["Excel", "Column Names", "Data Cleaning"],
  },
  {
    slug: "clean-messy-excel-csv-without-coding",
    title: "How to Clean Messy Excel and CSV Files Faster — Without Coding",
    excerpt:
      "Leading spaces, mixed date formats, merged cells, hidden characters, inconsistent nulls — messy files are the norm, not the exception. This guide walks through every common problem and how to fix it fast.",
    date: "2026-05-10",
    readTime: 10,
    tags: ["Excel", "CSV", "Data Cleaning"],
  },
  {
    slug: "affordable-alteryx-alternative-small-teams",
    title: "Best Affordable Alteryx Alternative for Small Teams and Freelancers",
    excerpt:
      "Solo analysts and small teams don't need a £40,000/year enterprise licence. These Alteryx alternatives give you the same data transformation power at prices that make sense for freelancers and growing teams.",
    date: "2026-05-10",
    readTime: 9,
    tags: ["Alteryx", "Small Teams", "Freelancers"],
  },
  {
    slug: "prepare-raw-data-for-power-bi",
    title: "How to Prepare Raw Data for Power BI Dashboards",
    excerpt:
      "Power BI is powerful — but only if the data going in is clean, properly typed, and structured correctly. This guide covers everything you need to do before you open Power BI Desktop.",
    date: "2026-05-10",
    readTime: 9,
    tags: ["Power BI", "Data Preparation", "Analytics"],
  },
  {
    slug: "why-analysts-spend-more-time-cleaning",
    title: "Why Data Analysts Spend More Time Cleaning Data Than Analysing It",
    excerpt:
      "Survey after survey shows the same thing: analysts spend 60–80% of their time on data preparation, not analysis. Why is this still true in 2026, and what can be done about it?",
    date: "2026-05-10",
    readTime: 8,
    tags: ["Data Cleaning", "Productivity", "Industry"],
  },
  {
    slug: "automate-repetitive-data-cleaning-workflows",
    title: "How to Automate Repetitive Data Cleaning and Transformation Workflows",
    excerpt:
      "If you're running the same data cleaning steps every week — loading a file, fixing nulls, standardising columns, exporting — you're manually doing work a pipeline should handle. Here's how to automate it.",
    date: "2026-05-10",
    readTime: 9,
    tags: ["Automation", "Pipelines", "Data Cleaning"],
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
