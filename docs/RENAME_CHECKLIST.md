# Brand & Domain Rename Checklist

Use this document when the product is renamed and/or moved to a new domain.
Replace every `NEW_NAME` / `new-name` / `newdomain.com` placeholder below with the actual new values before starting.

---

## Variables to decide before you start

| Variable | Current value | New value |
|---|---|---|
| **Brand name** (title case, public-facing) | `DataHub` | `NEW_NAME` |
| **Slug** (lowercase, hyphenated, for code/infra) | `datahub` | `new-name` |
| **Primary domain** | `datahub.org.in` | `newdomain.com` |
| **API subdomain** | `api.datahub.org.in` | `api.newdomain.com` |
| **App subdomain** | `app.datahub.org.in` | `app.newdomain.com` |
| **Docker Hub org/image prefix** | `mitul6299/datahub-` | `mitul6299/new-name-` |
| **Render service name** | `datahub-backend` | `new-name-backend` |
| **S3/R2 bucket names** | `datahub-datasets` | `new-name-datasets` |
| **Contact/support email** | `mitul.srivastava000@gmail.com` | new email |

---

## 1 — External accounts & services (do first, before any code changes)

These require manual action in dashboards — they cannot be done with a code search/replace.

### 1.1 Domain registrar
- [ ] Register the new domain
- [ ] Set up DNS: A records for `@` and `www`, CNAME for `api.` and `app.` subdomains

### 1.2 Vercel (frontend hosting)
- [ ] Add new domain in Vercel project → Domains
- [ ] Remove the old domain after DNS propagates
- [ ] Update **Environment Variables**: `VITE_APP_URL`, any hardcoded domain references

### 1.3 Render (backend hosting)
- [ ] Rename the service in Render dashboard (or create new service)
- [ ] Add new custom domain
- [ ] Note the new `.onrender.com` URL — it changes if you create a new service
- [ ] Update `CORS_ORIGINS` env var in Render to new domain

### 1.4 Supabase
- [ ] Update **Site URL** in Authentication → URL Configuration to `https://newdomain.com`
- [ ] Update **Redirect URLs** allowlist to include `https://newdomain.com/**`
- [ ] Update email templates (confirmation, magic link, password reset) — they embed the old domain name

### 1.5 AWS S3
- [ ] Create new bucket `new-name-datasets` in ap-south-1 (or same region)
- [ ] Copy all existing objects: `aws s3 sync s3://datahub-datasets s3://new-name-datasets`
- [ ] Update bucket CORS policy with new domain
- [ ] Update IAM policy if bucket name is referenced
- [ ] Update `.env` / Render env vars: `S3_BUCKET_NAME=new-name-datasets`
- [ ] After confirming the new bucket works, delete or archive the old one

### 1.6 Cloudflare R2 (if in use)
- [ ] Create new bucket `new-name-datasets`
- [ ] Migrate objects (same as S3 above)
- [ ] Update `R2_BUCKET_NAME` env var

### 1.7 Brevo (email marketing)
- [ ] Rename the contact list from "DataHub Signups" to the new name in the Brevo dashboard
- [ ] Update the sender domain — Brevo requires domain verification; verify the new sending domain
- [ ] Update email templates that reference the old brand name

### 1.8 Resend (transactional email)
- [ ] Verify new sending domain in Resend (DNS TXT/CNAME records)
- [ ] Update `EMAIL_FROM_ADDRESS` env var in all environments
- [ ] Update email templates in `backend/app/services/email_service.py` (see §3.4)

### 1.9 Sentry
- [ ] Rename the Sentry project in Settings → Projects → Project Settings
- [ ] The DSN (`VITE_SENTRY_DSN`) does not change on rename, but update the project display name

### 1.10 PostHog
- [ ] Update project name in PostHog Settings
- [ ] Update `VITE_POSTHOG_HOST` / `VITE_POSTHOG_KEY` if you create a new project

### 1.11 Google Search Console
- [ ] Add new domain as a property
- [ ] Submit the new sitemap: `https://newdomain.com/sitemap.xml`
- [ ] Once old domain is dead, set up a redirect property and mark it as moved

### 1.12 Bing Webmaster Tools
- [ ] Add new site, verify ownership
- [ ] Remove `frontend/public/BingSiteAuth.xml` and replace with new verification file
- [ ] Submit new sitemap

### 1.13 Google Analytics / Tag Manager (if set up)
- [ ] Add new domain to the Analytics property
- [ ] Update cross-domain tracking rules

### 1.14 Social profiles
- [ ] Update LinkedIn company page URL slug and display name
- [ ] Update ProductHunt product name and URL
- [ ] Rename YouTube channel handle (`@new-name`)
- [ ] Update all three URLs in `frontend/index.html` → Organization `sameAs` array (see §2.1)

### 1.15 GitHub repository
- [ ] Rename the repo: Settings → Rename (this changes the clone URL — update local remotes)
- [ ] Update GitHub Actions workflow variable `DATAHUB_API_URL` in repo Settings → Variables

### 1.16 Docker Hub
- [ ] Create repository `mitul6299/new-name-backend`
- [ ] Update CI/CD push steps to use the new image name

---

## 2 — Frontend code changes

### 2.1 `frontend/index.html`
All occurrences of the old domain and brand name are concentrated here.

**Meta tags to update:**
- `<title>` — contains `datahub.org.in –`
- `<meta name="description">` — contains `datahub.org.in generates`
- `<link rel="canonical">` — `https://datahub.org.in/`
- `<link rel="alternate" hreflang="en-IN">` — `https://datahub.org.in/`
- `<link rel="alternate" hreflang="x-default">` — `https://datahub.org.in/`
- `<meta property="og:url">` — `https://datahub.org.in/`
- `<meta property="og:description">` — contains `datahub.org.in cleans`
- `<meta property="og:image">` — `https://datahub.org.in/logo.png`
- `<meta property="og:image:alt">` — `datahub.org.in – AI Data Analysis Platform`
- `<meta name="twitter:description">` — contains `datahub.org.in cleans`
- `<meta name="twitter:image">` — `https://datahub.org.in/logo.png`
- `<meta name="twitter:image:alt">` — `datahub.org.in – AI Data Analysis Platform`

**JSON-LD structured data to update (3 schema objects):**
- Organization: `name`, `alternateName`, `url`, `logo.url`, `sameAs` (3 social URLs), `contactPoint.email`
- WebSite: `name`, `alternateName`, `url`, `potentialAction.target`
- SoftwareApplication: `name`, `alternateName`, `url`

**`<noscript>` block:** contains domain in text, headings, and `mailto:` link

### 2.2 `frontend/public/sitemap.xml`
Every `<loc>` URL uses `https://datahub.org.in/` — find/replace the domain across all 24+ entries.

### 2.3 `frontend/public/robots.txt`
- `Sitemap:` directive references `https://datahub.org.in/sitemap.xml`

### 2.4 `frontend/public/site.webmanifest`
- `name` field: `"DataHub – AI Data Analysis Tool"`
- `short_name` field: `"DataHub"`
- `description` field

### 2.5 `frontend/public/google02c9778de018e640.html`
- Delete this file; replace with new Google Search Console verification file for the new domain.

### 2.6 `frontend/public/BingSiteAuth.xml`
- Delete this file; replace with new Bing verification file from Bing Webmaster Tools.

### 2.7 `frontend/public/logo.png` + `frontend/public/samples/`
- Replace `logo.png` with the new brand logo (same filename is fine).

### 2.8 `frontend/src/pages/HomePage.tsx`
- `SUPPORT_EMAIL` constant — update email address
- All `useSEO` calls — title and description strings mention brand name
- Blog comparison tables use `colB="DataHub"` in `<CompareTable>` — update to new name
- Footer brand name label: `<p className="footer-brand">DataHub</p>`

### 2.9 `frontend/src/pages/FAQPage.tsx`
- All Q&A strings that mention "DataHub" by name (15+ occurrences)
- `useSEO` title and description
- Footer copyright: `© {year} DataHub`

### 2.10 `frontend/src/pages/BlogPostPage.tsx`
- Article structured data: `author.name: "DataHub Team"`, `publisher.name: "DataHub"`
- BreadcrumbList items if they use hardcoded brand name

### 2.11 `frontend/src/pages/PricingPage.tsx`
- `useSEO` title contains brand name
- Pricing schema `publisher` / `brand` fields

### 2.12 `frontend/src/pages/DocsPage.tsx`
- BreadcrumbList schema: `"DataHub"` references
- `useSEO` title

### 2.13 `frontend/src/pages/BlogIndexPage.tsx`
- Page title, useSEO strings

### 2.14 `frontend/src/content/blog/*.tsx` (10 files)
- Every blog article mentions "DataHub" in body text, comparison tables (`colB="DataHub"`, `datahub:` row keys), FAQ answers, and section headings.
- **Fastest approach:** global find/replace `"DataHub"` → `"NEW_NAME"` in the `frontend/src/content/blog/` directory, then manually review comparison tables.

### 2.15 `frontend/src/hooks/useSEO.ts`
- No brand name hardcoded — but verify the hook injects canonical URLs correctly for the new domain.

### 2.16 `frontend/src/hooks/useTour.ts`
- `STORAGE_KEY = "datahub_tour_done"` — rename to `"new-name_tour_done"`.
  Note: existing users who completed the tour will see it again once; this is acceptable.

### 2.17 `frontend/src/api.ts` + `frontend/src/App.tsx` + `frontend/src/AppShell.tsx` + `frontend/src/contexts/AuthContext.tsx` + `frontend/src/components/TeamPanel.tsx`
- Custom event names: `"datahub:rate-limited"`, `"datahub:session-expired"`, `"datahub:plan-upgrade-required"` — these are internal browser events, not user-facing. Rename for consistency but this is low priority since they are not public-facing.

### 2.18 `frontend/src/lib/posthog.ts`
- No hardcoded brand name, but update `VITE_POSTHOG_KEY` / `VITE_POSTHOG_HOST` env vars if you create a new PostHog project.

### 2.19 `frontend/package.json`
- `"name": "datahub-frontend"` → `"new-name-frontend"` (not user-facing, low priority)

### 2.20 `frontend/vercel.json` and root `vercel.json`
- Render proxy URL: `https://datahub-0dbp.onrender.com` → new Render URL

### 2.21 `frontend/vite.config.ts`
- Dev proxy target: `https://datahub-0dbp.onrender.com` → new Render URL

---

## 3 — Backend code changes

### 3.1 `backend/app/config.py` and `backend/app/config/__init__.py`
Both files are near-identical (the duplicate is a known issue — see `/memories/repo/config-file-duplication.md`). Update in both:
- `CORS_ORIGINS` default list: `https://datahub.org.in`, `https://www.datahub.org.in`
- `email_from_address` default: `"DataHub <noreply@datahub.org.in>"`

### 3.2 `backend/app/services/email_service.py`
- 8 function signatures with `app_url: str = "https://datahub.org.in"` default arguments
- All email HTML templates that embed the brand name or domain in body text, links, and footers

### 3.3 `backend/app/services/weekly_digest_service.py`
- `_build_html` function default: `app_url: str = "https://datahub.org.in"`

### 3.4 `backend/app/services/support_chat_service.py`
- System prompt strings that say `"DataHub (datahub.org.in) is an AI-powered data platform..."` — update both the name and the domain

### 3.5 `backend/app/routers/billing.py`
- Error message string: `"contact support@datahub.org.in"` — update to new contact email

### 3.6 `backend/app/routers/project_members.py` and `backend/app/routers/organization_members.py`
- Fallback URL: `"https://datahub.org.in"` used when `settings.public_base_url` is not set

---

## 4 — Infrastructure & deployment changes

### 4.1 Environment files — `.env`, `.env.example`, `.env.production.example`
- `CORS_ORIGINS` — update domain in all three files
- `S3_BUCKET_NAME` / `R2_BUCKET_NAME` — update to new bucket name
- All three files should be updated in lockstep

### 4.2 `Caddyfile`
- Host entries: `app.datahub.org.in, datahub.org.in {` → new domains

### 4.3 `render.yaml`
- `name: datahub-backend` → `new-name-backend`

### 4.4 `infra/helm/datahub/` (Helm chart)
- `Chart.yaml`: `name: datahub`, `description: DataHub Helm chart`
- `values-prod.yaml`:
  - `repository: mitul6299/datahub-backend` → new Docker image name
  - All `host:` and `secretName:` fields containing `datahub.org.in`
  - `CORS_ORIGINS`, `PUBLIC_BASE_URL`, `VITE_API_BASE_URL` env vars
- Rename the chart directory itself: `infra/helm/datahub/` → `infra/helm/new-name/`

### 4.5 `infra/k8s/` (Kubernetes manifests)
- `datahub-backend-secret.yaml`: `name`, `namespace` fields
- `datapro-backend-secret.yaml`: same (this file is deprecated but references old names)
- Rename `datahub-backend-secret.yaml` → `new-name-backend-secret.yaml`

### 4.6 `infra/monitoring/prometheus.yml`
- `job_name: datahub-backend` → `new-name-backend`

### 4.7 `infra/monitoring/alert.rules.yml`
- `name: datahub-alerts`
- Prometheus metric names `datahub_http_request_duration_seconds_bucket` and `datahub_http_requests_total` — these are emitted by the backend; check `backend/app/main.py` for where they are defined and update the metric prefix there too

### 4.8 `.github/workflows/pipeline-scheduler.yml`
- Comment: `DATAHUB_API_URL`
- Variable name `DATAHUB_API_URL` used in the workflow step
- Also update the GitHub Actions repo variable in Settings → Variables → `DATAHUB_API_URL`

---

## 5 — SEO & redirect strategy (critical for existing traffic)

### 5.1 Set up 301 redirects from old domain
All URLs at `datahub.org.in/*` must 301-redirect to `newdomain.com/*`.

**On Vercel:** Add a redirect in the old project's `vercel.json`:
```json
{
  "redirects": [
    { "source": "/(.*)", "destination": "https://newdomain.com/$1", "permanent": true }
  ]
}
```
Keep the old Vercel project live for at least 12 months.

### 5.2 Update Google Search Console
- Submit the new sitemap immediately
- Use the **Change of Address** tool in Search Console (old property → new property)

### 5.3 Update canonical tags
All `<link rel="canonical">` and `og:url` values in `index.html` and the `useSEO` hook calls across page components must point to the new domain.

### 5.4 Update blog post canonicals
Each blog post sets its canonical via `useSEO` using `https://datahub.org.in/blog/[slug]`. Search `frontend/src/pages/BlogPostPage.tsx` and `frontend/src/hooks/useSEO.ts` for hardcoded domain references.

### 5.5 Update social profile links
The `sameAs` array in `frontend/index.html`'s Organization schema must be updated to the new LinkedIn/ProductHunt/YouTube profile URLs (you will need to update the profiles themselves first — see §1.14).

### 5.6 Update backlinks where possible
For any backlinks you control (ProductHunt listing description, LinkedIn about section, YouTube channel description), update them to point to the new domain.

---

## 6 — Post-rename verification checklist

Run through these checks after deploying:

- [ ] `https://newdomain.com/` loads and the brand name shows correctly everywhere
- [ ] `https://datahub.org.in/` 301-redirects to `https://newdomain.com/` (check with `curl -I`)
- [ ] Google Rich Results Test passes for `/`, `/faq`, and a blog post on the new domain
- [ ] `https://newdomain.com/sitemap.xml` is valid and all 24+ URLs resolve
- [ ] `https://newdomain.com/robots.txt` is correct
- [ ] Auth flow works end-to-end (Supabase redirect URLs updated — see §1.4)
- [ ] Email confirmation links in sign-up emails point to new domain
- [ ] Billing webhooks (Razorpay) point to new domain — update in Razorpay dashboard
- [ ] CORS: API accepts requests from new frontend domain (test login, data fetch)
- [ ] S3 bucket is accessible from the backend under the new name
- [ ] Brevo signup flow adds users to the correct list with new domain sender
- [ ] Sentry is receiving errors from the new deployment
- [ ] PostHog is capturing events from the new domain
- [ ] GitHub Actions `pipeline-scheduler.yml` hits the new API URL successfully

---

## Quick find/replace targets (for IDE global search)

Run these in order in VS Code **Find in Files** (`Ctrl+Shift+H`), restricted to the relevant directories:

| Find | Replace with | Scope |
|---|---|---|
| `datahub.org.in` | `newdomain.com` | everywhere |
| `DataHub` | `NEW_NAME` | `frontend/src/`, `backend/app/` |
| `datahub-0dbp.onrender.com` | `new-render-url.onrender.com` | `frontend/` |
| `datahub-backend` | `new-name-backend` | `infra/`, `render.yaml` |
| `datahub-datasets` | `new-name-datasets` | `.env*`, `infra/` |
| `datahub_tour_done` | `new-name_tour_done` | `frontend/src/` |
| `datahub:rate-limited` | `new-name:rate-limited` | `frontend/src/` |
| `datahub:session-expired` | `new-name:session-expired` | `frontend/src/` |
| `datahub:plan-upgrade-required` | `new-name:plan-upgrade-required` | `frontend/src/` |
| `mitul6299/datahub-` | `mitul6299/new-name-` | `infra/` |
| `"name": "datahub"` | `"name": "new-name"` | `infra/helm/` |

**Do NOT blindly find/replace** `datahub` everywhere — it also appears in the local Postgres credentials (`datahub:datahub@postgres:5432/datahub`) and Docker container names which are internal-only and can stay as-is unless you want to rename them too.
