// Postbuild prerender: generates per-route static HTML files with
// route-specific <title>, <meta description>, <link canonical>, and OG tags
// baked into the initial HTML response. Crawlers see correct metadata
// without executing JavaScript. The React app still hydrates on top.
//
// Vercel serves dist/<route>/index.html when the URL matches because file
// existence wins over rewrites in vercel.json.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, "..", "dist");
const SOURCE = join(DIST, "index.html");
const ORIGIN = "https://datahub.org.in";

// ── JSON-LD helpers ──────────────────────────────────────────
function makeBlogLd(path, title, description, datePublished) {
  const url = `${ORIGIN}/${path}`;
  return [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: title,
      description,
      image: `${ORIGIN}/logo.png`,
      datePublished,
      dateModified: datePublished,
      author: { "@type": "Person", name: "DataHub Team", url: `${ORIGIN}/about` },
      publisher: {
        "@type": "Organization",
        name: "DataHub",
        url: ORIGIN,
        logo: { "@type": "ImageObject", url: `${ORIGIN}/logo.png` },
      },
      mainEntityOfPage: { "@type": "WebPage", "@id": url },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${ORIGIN}/` },
        { "@type": "ListItem", position: 2, name: "Blog", item: `${ORIGIN}/blog` },
        { "@type": "ListItem", position: 3, name: title, item: url },
      ],
    },
  ];
}

if (!existsSync(SOURCE)) {
  console.error(`[prerender] dist/index.html not found at ${SOURCE}`);
  process.exit(1);
}

const baseHtml = readFileSync(SOURCE, "utf8");

/**
 * Per-route SEO data. The homepage (/) keeps the original index.html,
 * so it is not in this list.
 */
const routes = [
  {
    path: "pricing",
    title: "DataHub Pricing – Free, Pro & Team Plans | AI Data Analysis",
    description:
      "Start free forever. Upgrade to Professional from ₹6,999/month. All plans include the AI agent, transparent SQL pipelines, and database connectors. No credit card to get started.",
    ogType: "website",
  },
  {
    path: "docs",
    title: "Documentation – DataHub | AI Data Analysis Guides",
    description:
      "Step-by-step guides to upload data, connect databases, build AI pipelines, and use the DataHub agent. Full reference, connectors, and how-to guides.",
    ogType: "article",
  },
  {
    path: "signup",
    title: "Sign up free – DataHub | AI Data Analysis Tool",
    description:
      "Create your free DataHub account in 30 seconds. 100 AI messages/month, 500 MB storage, CSV & Excel uploads. No credit card required.",
    ogType: "website",
  },
  {
    path: "terms",
    title: "Terms of Service – DataHub",
    description:
      "DataHub Terms of Service: usage rules, account responsibilities, billing, intellectual property, and liability for the DataHub AI data analysis platform.",
    ogType: "article",
  },
  {
    path: "privacy",
    title: "Privacy Policy – DataHub",
    description:
      "How DataHub collects, uses, stores, and protects your data. We never use customer data to train AI models. Full encryption and audit logging.",
    ogType: "article",
  },

  // ── FAQ ────────────────────────────────────────────────────
  {
    path: "faq",
    title: "DataHub FAQ – AI Tool for Analysts | Common Questions Answered",
    description:
      "Answers to common questions about DataHub: how to clean Excel files, merge CSVs, automate monthly reports, prepare data for Power BI, work with accounting exports, pricing plans, and how DataHub compares to Excel, Power Query, and Alteryx.",
    ogType: "website",
    ldJson: [
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: [
          {
            "@type": "Question",
            name: "What is DataHub?",
            acceptedAnswer: { "@type": "Answer", text: "DataHub is your reliable AI agent for data work. You upload CSV, Excel, or JSON files, or connect databases like PostgreSQL and Snowflake, then describe what you need in plain English. DataHub generates a step-by-step SQL plan you review and approve before anything runs — and you can save the whole flow as a visual, reusable pipeline that runs itself on a schedule." },
          },
          {
            "@type": "Question",
            name: "Who is DataHub for?",
            acceptedAnswer: { "@type": "Answer", text: "DataHub is built for business analysts, freelance consultants, small data teams, and managers who need to clean, transform, and analyse data regularly — without writing code or SQL. It is particularly useful for anyone spending hours on repetitive spreadsheet work or who has outgrown Excel but does not need a full enterprise ETL platform." },
          },
          {
            "@type": "Question",
            name: "Can I merge multiple CSV files in DataHub?",
            acceptedAnswer: { "@type": "Answer", text: "Yes. Upload multiple CSV (or Excel) files and describe the merge in plain English — for example, 'Stack all these monthly exports into one table. Match columns by name even if the casing is different. Remove duplicate rows where the order ID appears more than once.' DataHub aligns columns, normalises types, and optionally adds a source_file column so you can trace which row came from which original file." },
          },
          {
            "@type": "Question",
            name: "How do I prepare data for Power BI automatically?",
            acceptedAnswer: { "@type": "Answer", text: "Upload your raw file to DataHub, describe the cleanup and transformation steps in plain English, and export the result as CSV or Excel. Common prep steps — removing blank rows, fixing date formats, splitting combined columns, standardising column names — are handled automatically. You can save these steps as a pipeline and re-run it every time you get a new export, before opening Power BI." },
          },
          {
            "@type": "Question",
            name: "How do I remove duplicates from an Excel file automatically?",
            acceptedAnswer: { "@type": "Answer", text: "Upload your Excel file to DataHub, then type: 'Remove duplicate rows based on [column name].' DataHub generates a SQL deduplication step, shows you how many rows will be removed, and lets you approve before executing. For near-duplicates — where the same record appears with slight variations — DataHub supports fuzzy deduplication using configurable similarity thresholds." },
          },
          {
            "@type": "Question",
            name: "Can DataHub replace Power Query (M) in Excel?",
            acceptedAnswer: { "@type": "Answer", text: "For most analytical cleanup and transformation tasks, yes. DataHub handles the same operations as Power Query — filtering, joining, pivoting, type conversion, column renaming — but through plain English instead of M query language. DataHub also works on Mac, supports much larger files, and lets you schedule the pipeline to run automatically." },
          },
          {
            "@type": "Question",
            name: "Does DataHub work with accounting software exports (QuickBooks, Tally, Xero)?",
            acceptedAnswer: { "@type": "Answer", text: "Yes. DataHub is well suited to accounting exports from QuickBooks, Tally (ERP 9 and TallyPrime), Xero, SAP, and similar tools. It handles common issues in these exports: multi-row headers, subtotal rows mixed in with data, Indian number formats (₹1,23,456), Dr/Cr suffixes, and inconsistent date formats. You can save the cleanup as a reusable pipeline so next month's export is cleaned in one click." },
          },
          {
            "@type": "Question",
            name: "Is DataHub suitable for accountants, consultants, or finance teams?",
            acceptedAnswer: { "@type": "Answer", text: "DataHub is particularly well suited to these roles. Accountants use it for reconciliation, export cleanup, and MIS report automation. Finance analysts use it for actuals-vs-budget comparisons, variance analysis, and aggregated reporting across regions or entities. Consultants use it for onboarding client data quickly and building repeatable cleanup workflows that run across multiple client files." },
          },
        ],
      },
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${ORIGIN}/` },
          { "@type": "ListItem", position: 2, name: "FAQ", item: `${ORIGIN}/faq` },
        ],
      },
    ],
  },

  // ── Blog index ──────────────────────────────────────────────
  {
    path: "blog",
    title: "Blog – DataHub | Data Cleaning, Excel & Analyst Guides",
    description:
      "Practical guides for data analysts: reconcile Excel files, remove CSV duplicates, automate data cleaning, and cut your prep time. No code required.",
    ogType: "website",
  },

  // ── Blog posts ──────────────────────────────────────────────
  {
    path: "blog/why-analysts-spend-more-time-cleaning",
    title: "Why Data Analysts Spend More Time Cleaning Data Than Analysing It | DataHub Blog",
    description:
      "Survey after survey shows analysts spend 60–80% of their time on data preparation. Why hasn't this changed — and what's actually being done about it in 2026?",
    ogType: "article",
    date: "2026-04-22",
  },
  {
    path: "blog/clean-messy-excel-csv-without-coding",
    title: "How to Clean Messy Excel and CSV Files Faster — Without Coding | DataHub Blog",
    description:
      "Leading spaces, mixed date formats, merged cells, pseudo-nulls — messy files are the norm. This guide walks through every common data quality problem and how to fix it fast.",
    ogType: "article",
    date: "2026-04-25",
  },
  {
    path: "blog/remove-duplicates-csv-without-code",
    title: "How to Remove Duplicates from a CSV File Without Code | DataHub Blog",
    description:
      "Duplicate rows corrupt aggregations and erode trust in your data. Remove exact and near-duplicate records from any CSV file without writing code or using Python.",
    ogType: "article",
    date: "2026-04-28",
  },
  {
    path: "blog/standardise-column-names-excel",
    title: "How to Standardise Column Names in Excel Automatically | DataHub Blog",
    description:
      "Inconsistent column headers break every VLOOKUP, pivot table, and downstream report. Here's how to fix column names in bulk — no manual renaming, no formulas.",
    ogType: "article",
    date: "2026-05-01",
  },
  {
    path: "blog/reconcile-excel-files-automatically",
    title: "How to Reconcile Two Excel Files Automatically | DataHub Blog",
    description:
      "Stop comparing spreadsheets row by row. This guide shows you how to automatically reconcile two Excel files — flagging differences, missing rows, and variances — in minutes.",
    ogType: "article",
    date: "2026-05-04",
  },
  {
    path: "blog/prepare-raw-data-for-power-bi",
    title: "How to Prepare Raw Data for Power BI Dashboards | DataHub Blog",
    description:
      "Power BI is powerful — but only if the data going in is clean, typed correctly, and properly structured. This guide covers everything to do before you open Power BI Desktop.",
    ogType: "article",
    date: "2026-05-07",
  },
  {
    path: "blog/alteryx-alternative-cheaper",
    title: "The Best Cheaper Alteryx Alternative in 2026 | DataHub Blog",
    description:
      "Alteryx Designer costs £4,000+ per seat per year. Here are the best Alteryx alternatives with the same data blending, transformation, and automation capabilities at a fraction of the cost.",
    ogType: "article",
    date: "2026-05-09",
  },
  {
    path: "blog/affordable-alteryx-alternative-small-teams",
    title: "Best Affordable Alteryx Alternative for Small Teams and Freelancers | DataHub Blog",
    description:
      "Solo analysts and small teams don't need a £40,000/year enterprise licence. These Alteryx alternatives give you the same data transformation power at prices built for freelancers and growing teams.",
    ogType: "article",
    date: "2026-05-12",
  },
  {
    path: "blog/data-cleaning-tool-for-analysts",
    title: "The Best Data Cleaning Tool for Analysts (No Code Required) | DataHub Blog",
    description:
      "Analysts spend 60–80% of their time cleaning data. The right tool collapses that to minutes. Here's what to use for null handling, deduplication, type conversion, and more.",
    ogType: "article",
    date: "2026-05-14",
  },
  {
    path: "blog/automate-repetitive-data-cleaning-workflows",
    title: "How to Automate Repetitive Data Cleaning and Transformation Workflows | DataHub Blog",
    description:
      "If you're running the same data cleaning steps every week, you're manually doing work a pipeline should handle. Here's how to build reusable, automated cleaning workflows.",
    ogType: "article",
    date: "2026-05-17",
  },
  {
    path: "blog/merge-multiple-csv-files",
    title: "How to Merge Multiple CSV Files Automatically (Without Code) | DataHub Blog",
    description:
      "Combining dozens of CSV exports by hand wastes hours and introduces errors. Here's how to merge multiple CSV files automatically in minutes — no Python, no Power Query.",
    ogType: "article",
    date: "2026-05-19",
  },
  {
    path: "blog/ai-etl-tool-for-analysts",
    title: "The Best AI ETL Tool for Analysts: No Engineering Team Needed | DataHub Blog",
    description:
      "Traditional ETL tools were built for engineers, not analysts. Here's what analysts should use instead — plain English, zero infrastructure, reusable pipelines.",
    ogType: "article",
    date: "2026-05-20",
  },
  {
    path: "blog/no-code-data-transformation",
    title: "No-Code Data Transformation: How Analysts Can Do ETL Without Writing Code | DataHub Blog",
    description:
      "You don't need Python or SQL to clean, join, and transform data. No-code transformation tools let analysts do the same work data engineers do — faster and without a ticket queue.",
    ogType: "article",
    date: "2026-05-21",
  },
  {
    path: "blog/automate-accounting-exports",
    title: "How to Clean and Transform Accounting Software Exports Automatically | DataHub Blog",
    description:
      "QuickBooks, Tally, Xero, and SAP exports are rarely analysis-ready. Here's how to automate the cleanup automatically — multi-row headers, subtotals, text amounts, and all.",
    ogType: "article",
    date: "2026-05-22",
  },
  {
    path: "blog/automate-monthly-excel-reports",
    title: "How to Automate Monthly Excel Reports Without Macros or VBA | DataHub Blog",
    description:
      "If you spend hours every month refreshing the same Excel report, there's a better way. Here's how to automate the whole workflow — clean, transform, aggregate, export — without a single macro.",
    ogType: "article",
    date: "2026-05-24",
  },

  // ── New blog posts ───────────────────────────────────────────
  {
    path: "blog/automate-excel-transformations",
    title: "How to Automate Excel Transformations: Build Reusable Pipelines Without VBA | DataHub Blog",
    description:
      "If you run the same Excel transformations every week, you're doing work a pipeline should handle. Here's how to automate Excel transformations with reusable, scheduled pipelines.",
    ogType: "article",
    date: "2026-05-28",
  },
  {
    path: "blog/clean-csv-files-with-ai",
    title: "How to Clean CSV Files with AI: Fix Formatting, Nulls, and Duplicates Fast | DataHub Blog",
    description:
      "AI tools have made cleaning CSV files dramatically faster. Describe what needs fixing in plain English and get clean results in minutes — no Python, no formulas required.",
    ogType: "article",
    date: "2026-05-29",
  },
  {
    path: "blog/best-data-analysis-tool-small-teams",
    title: "Best Data Analytics Tool for Analysts and Small Teams in 2026 | DataHub Blog",
    description:
      "An honest comparison of the best data analytics tools for analysts in 2026 — DataHub, Power BI, Tableau, Alteryx, and Looker Studio — based on learning curve, depth, automation, and cost.",
    ogType: "article",
    date: "2026-05-30",
  },
  {
    path: "blog/julius-ai-alternative",
    title: "Julius AI Alternative: Reusable Pipelines Instead of One-Off Chat | DataHub Blog",
    description:
      "Julius AI is impressive for ad-hoc data exploration. But if you're repeating the same analysis every week on updated data, you need pipelines — not just chat. Here's what to use instead.",
    ogType: "article",
    date: "2026-05-31",
  },
  {
    path: "blog/copilot-for-excel-alternative",
    title: "Copilot for Excel Alternative: AI Data Preparation That Works Beyond Excel | DataHub Blog",
    description:
      "Copilot for Excel requires a $30/user/month add-on and only works inside Excel files. Here are the best Copilot for Excel alternatives for analysts who need AI across all their data sources.",
    ogType: "article",
    date: "2026-05-31",
  },
  {
    path: "blog/power-query-alternative",
    title: "Power Query Alternative: No M Code, Works Outside Microsoft Tools | DataHub Blog",
    description:
      "Power Query is capable but requires M code for anything non-trivial and is tied to Excel/Power BI. Here are the best Power Query alternatives for analysts who want more flexibility.",
    ogType: "article",
    date: "2026-05-31",
  },
  {
    path: "blog/knime-alternative",
    title: "KNIME Alternative for Analysts: No Installation, No Node Graph Required | DataHub Blog",
    description:
      "KNIME is powerful but requires a Java desktop install, weeks of learning, and expensive Server licensing for scheduling. Here are the best KNIME alternatives for analysts.",
    ogType: "article",
    date: "2026-05-31",
  },
  {
    path: "blog/dataiku-alternative",
    title: "Dataiku Alternative for Small Teams: Analyst-Focused, Not Enterprise-Only | DataHub Blog",
    description:
      "Dataiku is priced at $30,000+/year and designed for data scientists. Here are the best Dataiku alternatives for small teams and analysts who need data preparation without enterprise complexity.",
    ogType: "article",
    date: "2026-05-31",
  },

  // ── Competitor alternative landing pages ──────────────────────
  {
    path: "alteryx-alternative",
    title: "The Best Alteryx Alternative in 2026 | DataHub",
    description:
      "DataHub is the best Alteryx alternative for analysts: AI-powered data preparation, pipeline automation, and no-code ETL — at a fraction of Alteryx's cost. Free plan available.",
    ogType: "website",
  },
  {
    path: "power-query-alternative",
    title: "The Best Power Query Alternative in 2026 | DataHub",
    description:
      "DataHub is the best Power Query alternative: no M code required, works outside Microsoft products, with built-in scheduling and audit trails. Free plan available.",
    ogType: "website",
  },
  {
    path: "excel-ai-alternative",
    title: "The Best Excel AI Alternative in 2026 | DataHub",
    description:
      "DataHub is the best Excel AI alternative and Copilot for Excel alternative: works across all data sources, builds reusable pipelines, and costs less. Free plan available.",
    ogType: "website",
  },
  {
    path: "tableau-prep-alternative",
    title: "The Best Tableau Prep Alternative in 2026 | DataHub",
    description:
      "DataHub is the best Tableau Prep alternative: browser-based data preparation, AI-powered transformations, and pipeline automation — without the Tableau pricing. Free plan available.",
    ogType: "website",
  },
  {
    path: "knime-alternative",
    title: "The Best KNIME Alternative for Analysts in 2026 | DataHub",
    description:
      "DataHub is the best KNIME alternative for analysts: browser-based, no installation, plain-English AI interface, and built-in scheduling. Free plan available.",
    ogType: "website",
  },
  {
    path: "dataiku-alternative",
    title: "The Best Dataiku Alternative for Small Teams | DataHub",
    description:
      "DataHub is the best Dataiku alternative for small teams and analysts: no enterprise contract, no data engineering team required, from $19/month. Free plan available.",
    ogType: "website",
  },
  {
    path: "julius-ai-alternative",
    title: "The Best Julius AI Alternative: Reusable Pipelines, Not Just Chat | DataHub",
    description:
      "DataHub is the best Julius AI alternative: save analysis workflows as reusable pipelines, schedule them on fresh data, and connect to databases — not just file uploads.",
    ogType: "website",
  },

  // ── Category landing pages ────────────────────────────────────
  {
    path: "ai-data-analytics",
    title: "AI Data Analytics Tool for Analysts and Teams | DataHub",
    description:
      "DataHub is an AI data analytics tool that turns plain-English descriptions into SQL-powered analysis. No code required. Connect databases, build pipelines, share dashboards. Free plan available.",
    ogType: "website",
  },
  {
    path: "data-preparation-tool",
    title: "AI Data Preparation & ETL Tool — No Code Required | DataHub",
    description:
      "DataHub is an AI data preparation tool and no-code ETL platform: clean, transform, and automate data pipelines in plain English. 13+ data sources supported. Free plan available.",
    ogType: "website",
  },
  {
    path: "no-code-analytics",
    title: "No-Code Data Analytics Tool | Analyse & Transform Data Without Writing Code | DataHub",
    description:
      "DataHub is the best no-code data analytics tool: clean, transform, and analyse data using plain English — no SQL, no Python. For business analysts and small teams. Free plan available.",
    ogType: "website",
  },
  {
    path: "business-intelligence-tool",
    title: "Business Intelligence Tool for Analysts | AI Analytics Software — No SQL Required | DataHub",
    description:
      "DataHub is an AI analytics tool for business intelligence: prepare data, build dashboards, and automate reporting without SQL or a data engineering team. Free plan available.",
    ogType: "website",
  },
];

/**
 * Replace meta tags in the base HTML for a specific route.
 * @param {object} route
 * @param {string} canonical
 */
function rewriteHtml(route, canonical) {
  let html = baseHtml;

  // <title>
  html = html.replace(
    /<title>[\s\S]*?<\/title>/,
    `<title>${escapeHtml(route.title)}</title>`,
  );

  // primary description
  html = html.replace(
    /<meta name="description" content="[^"]*" \/>/,
    `<meta name="description" content="${escapeAttr(route.description)}" />`,
  );

  // canonical
  html = html.replace(
    /<link rel="canonical" href="[^"]*" \/>/,
    `<link rel="canonical" href="${canonical}" />`,
  );

  // hreflang en-IN
  html = html.replace(
    /<link rel="alternate" hreflang="en-IN" href="[^"]*" \/>/,
    `<link rel="alternate" hreflang="en-IN" href="${canonical}" />`,
  );

  // hreflang x-default
  html = html.replace(
    /<link rel="alternate" hreflang="x-default" href="[^"]*" \/>/,
    `<link rel="alternate" hreflang="x-default" href="${canonical}" />`,
  );

  // og:type
  html = html.replace(
    /<meta property="og:type" content="[^"]*" \/>/,
    `<meta property="og:type" content="${route.ogType}" />`,
  );

  // og:url
  html = html.replace(
    /<meta property="og:url" content="[^"]*" \/>/,
    `<meta property="og:url" content="${canonical}" />`,
  );

  // og:title
  html = html.replace(
    /<meta property="og:title" content="[^"]*" \/>/,
    `<meta property="og:title" content="${escapeAttr(route.title)}" />`,
  );

  // og:description
  html = html.replace(
    /<meta property="og:description" content="[^"]*" \/>/,
    `<meta property="og:description" content="${escapeAttr(route.description)}" />`,
  );

  // twitter:title
  html = html.replace(
    /<meta name="twitter:title" content="[^"]*" \/>/,
    `<meta name="twitter:title" content="${escapeAttr(route.title)}" />`,
  );

  // twitter:description
  html = html.replace(
    /<meta name="twitter:description" content="[^"]*" \/>/,
    `<meta name="twitter:description" content="${escapeAttr(route.description)}" />`,
  );

  // Inject per-route JSON-LD (blog posts: Article + BreadcrumbList)
  if (route.date) {
    const ld = makeBlogLd(route.path, route.title, route.description, route.date);
    const ldScript = `\n    <script type="application/ld+json" id="__prerender-ld-json__">\n    ${JSON.stringify(ld, null, 2).replace(/\n/g, "\n    ")}\n    </script>`;
    html = html.replace("</head>", `${ldScript}\n  </head>`);
  }

  // Inject arbitrary JSON-LD for non-blog routes (e.g. FAQ page)
  if (route.ldJson) {
    const ldScript = `\n    <script type="application/ld+json" id="__prerender-ld-json__">\n    ${JSON.stringify(route.ldJson, null, 2).replace(/\n/g, "\n    ")}\n    </script>`;
    html = html.replace("</head>", `${ldScript}\n  </head>`);
  }

  return html;
}

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escapeAttr(s) {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

let written = 0;
for (const route of routes) {
  const canonical = `${ORIGIN}/${route.path}`;
  const html = rewriteHtml(route, canonical);
  const outDir = join(DIST, route.path);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "index.html"), html, "utf8");
  written++;
  console.log(`[prerender] /${route.path} -> dist/${route.path}/index.html`);
}

console.log(`[prerender] wrote ${written} route HTML files`);
