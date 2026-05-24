/**
 * IndexNow submission script — notifies Bing (and other IndexNow-compatible
 * engines) about all public URLs immediately after a deploy.
 *
 * Usage:
 *   node scripts/indexnow-submit.mjs
 *   npm run indexnow
 *
 * How it works:
 *   Reads every <loc> from sitemap.xml and POSTs them in one batch to the
 *   IndexNow API. Bing then schedules a crawl within minutes instead of
 *   waiting for its regular crawl cycle.
 *
 * Reference: https://www.indexnow.org/documentation
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const INDEXNOW_KEY = "7e6f8a9b0c1d2e3f4a5b9f3e2a1b4c7d";
const HOST = "datahub.org.in";
const KEY_LOCATION = `https://${HOST}/${INDEXNOW_KEY}.txt`;
const API_ENDPOINT = "https://api.indexnow.org/indexnow";

// ── Parse URLs from sitemap.xml ─────────────────────────────
const sitemapPath = join(__dirname, "..", "public", "sitemap.xml");
const sitemapXml = readFileSync(sitemapPath, "utf8");
const urls = [...sitemapXml.matchAll(/<loc>(https?:\/\/[^<]+)<\/loc>/g)].map(
  (m) => m[1].trim(),
);

if (urls.length === 0) {
  console.error("[indexnow] No URLs found in sitemap.xml — aborting.");
  process.exit(1);
}

console.log(`[indexnow] Submitting ${urls.length} URLs to IndexNow…`);
urls.forEach((u) => console.log(`  ${u}`));

// ── Submit batch to IndexNow API ────────────────────────────
const payload = {
  host: HOST,
  key: INDEXNOW_KEY,
  keyLocation: KEY_LOCATION,
  urlList: urls,
};

try {
  const res = await fetch(API_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
  });

  if (res.ok || res.status === 200 || res.status === 202) {
    console.log(`[indexnow] Success — HTTP ${res.status}. Bing will crawl updated pages shortly.`);
  } else if (res.status === 422) {
    console.error("[indexnow] HTTP 422 — One or more URLs are not on the declared host. Check sitemap for cross-domain entries.");
    process.exit(1);
  } else if (res.status === 429) {
    console.warn("[indexnow] HTTP 429 — Rate limited. Wait a few minutes and retry.");
  } else {
    const body = await res.text();
    console.error(`[indexnow] Unexpected HTTP ${res.status}: ${body}`);
    process.exit(1);
  }
} catch (err) {
  console.error("[indexnow] Network error:", err.message);
  process.exit(1);
}
