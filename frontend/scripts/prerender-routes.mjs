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
    path: "blog/reconcile-excel-files-automatically",
    title: "How to Reconcile Two Excel Files Automatically | DataHub Blog",
    description:
      "Stop comparing spreadsheets row by row. This guide shows you how to automatically reconcile two Excel files — flagging differences, missing rows, and variances — in minutes.",
    ogType: "article",
  },
  {
    path: "blog/remove-duplicates-csv-without-code",
    title: "How to Remove Duplicates from a CSV File Without Code | DataHub Blog",
    description:
      "Duplicate rows corrupt aggregations and erode trust in your data. Remove exact and near-duplicate records from any CSV file without writing code or using Python.",
    ogType: "article",
  },
  {
    path: "blog/alteryx-alternative-cheaper",
    title: "The Best Cheaper Alteryx Alternative in 2026 | DataHub Blog",
    description:
      "Alteryx Designer costs £4,000+ per seat per year. Here are the best Alteryx alternatives with the same data blending, transformation, and automation capabilities at a fraction of the cost.",
    ogType: "article",
  },
  {
    path: "blog/data-cleaning-tool-for-analysts",
    title: "The Best Data Cleaning Tool for Analysts (No Code Required) | DataHub Blog",
    description:
      "Analysts spend 60–80% of their time cleaning data. The right tool collapses that to minutes. Here's what to use for null handling, deduplication, type conversion, and more.",
    ogType: "article",
  },
  {
    path: "blog/standardise-column-names-excel",
    title: "How to Standardise Column Names in Excel Automatically | DataHub Blog",
    description:
      "Inconsistent column headers break every VLOOKUP, pivot table, and downstream report. Here's how to fix column names in bulk — no manual renaming, no formulas.",
    ogType: "article",
  },
  {
    path: "blog/clean-messy-excel-csv-without-coding",
    title: "How to Clean Messy Excel and CSV Files Faster — Without Coding | DataHub Blog",
    description:
      "Leading spaces, mixed date formats, merged cells, pseudo-nulls — messy files are the norm. This guide walks through every common data quality problem and how to fix it fast.",
    ogType: "article",
  },
  {
    path: "blog/affordable-alteryx-alternative-small-teams",
    title: "Best Affordable Alteryx Alternative for Small Teams and Freelancers | DataHub Blog",
    description:
      "Solo analysts and small teams don't need a £40,000/year enterprise licence. These Alteryx alternatives give you the same data transformation power at prices built for freelancers and growing teams.",
    ogType: "article",
  },
  {
    path: "blog/prepare-raw-data-for-power-bi",
    title: "How to Prepare Raw Data for Power BI Dashboards | DataHub Blog",
    description:
      "Power BI is powerful — but only if the data going in is clean, typed correctly, and properly structured. This guide covers everything to do before you open Power BI Desktop.",
    ogType: "article",
  },
  {
    path: "blog/why-analysts-spend-more-time-cleaning",
    title: "Why Data Analysts Spend More Time Cleaning Data Than Analysing It | DataHub Blog",
    description:
      "Survey after survey shows analysts spend 60–80% of their time on data preparation. Why hasn't this changed — and what's actually being done about it in 2026?",
    ogType: "article",
  },
  {
    path: "blog/automate-repetitive-data-cleaning-workflows",
    title: "How to Automate Repetitive Data Cleaning and Transformation Workflows | DataHub Blog",
    description:
      "If you're running the same data cleaning steps every week, you're manually doing work a pipeline should handle. Here's how to build reusable, automated cleaning workflows.",
    ogType: "article",
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
