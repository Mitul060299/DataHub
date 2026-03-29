# DataHub Platform – Capabilities, Architecture, Workflow, and Deployment

## 1. Capabilities

### Messy Data Handling
- AI-assisted profiling, auto-cleaning of missing/invalid values.
- Schema repair, smart type inference, outlier detection, pseudo-null detection.
- User feedback loop to correct/confirm fixes.
- Chart-ready profiling summaries available per column (column stats, outlier counts, top values, duplicate %, null %).
- Dataset listing and CSV export for downstream usage.
- CSV delimiter auto-detected via `csv.Sniffer` (comma / tab / semicolon / pipe / colon).
- Non-UTF-8 CSV files are automatically re-encoded to UTF-8 on upload (chardet detection).
- Multi-sheet Excel: UI lists sheets before upload; `POST /import/excel-sheets` to retrieve sheet names programmatically.

### 30+ Pipeline Transformation Operations
All operations are addressable by name in the NL pipeline editor and visual step builder:
- **Null handling:** `fill_nulls` (mean/median/mode/zero/ffill/bfill/value), `filter_nulls`, `drop_null_columns`
- **Type casting:** `cast_column_type`, `add_calculated_column`, `generate_id` (rownum/uuid/hash)
- **Deduplication:** `drop_duplicates`, `deduplicate_by_column`, `fuzzy_deduplicate` (rapidfuzz)
- **Filtering:** `filter_rows` (8 operators), `filter_outliers` (zscore)
- **Normalisation:** `normalize_column` (minmax/zscore), `round_numeric`, `encode_categorical` (onehot/label)
- **Aggregation:** `sort_by_column`, `group_by_sum/count/mean`, `pivot_table`, `resample_timeseries`
- **Time-series:** `detect_date_gaps` (reindex + fill), `normalize_timezone`
- **Validation:** `validate_rules` (9 operators; flag/drop/report modes)
- **AI transforms:** `sentiment`, `keywords`, `anomaly_detection`
- **Custom:** raw DuckDB SQL with `{{dataset}}` placeholder

### Schema Alignment
- `GET /datasets/compare-schemas?ids=id1,id2` returns exact matches, unmatched columns per side, fuzzy column suggestions (rapidfuzz), and an alignment score 0–1.

### Proactive, Autonomous AI Agents
- LLM-assisted suggestions supported via Groq API when configured.
- Fallback rule-based suggestions if no LLM is configured.

### Business Context Memory
- Context API with optional Chroma-backed persistence.
- Default workspace context used for agent prompts.
- Context persisted in Supabase Postgres with optional local JSON fallback.

### Deep Transformation Recipes
- Recipe API supports multi-step definitions and apply.
- Provenance and reversibility are tracked for applied transformations.

### Rich, Interactive Visualizations
- Dashboard CRUD and widget configuration are available.
- Dashboards are persisted in Supabase Postgres.
- Exports and shared read-only views are supported.
- **Canvas v2.1:** text/markdown tiles, KPI tiles (data-connected aggregations: SUM/COUNT/AVG/MIN/MAX), and slicer tiles (interactive column filter).
- Share links with expiry, scopes, and optional cryptographic signing.

### Open Ecosystem & Integration
- Plugin interface and plugin listing endpoint are available.
- Webhooks and scheduled job APIs are available.
- Connector import API with inline CSV connector available.

### Enterprise-Grade Security & Deployment
- Audit logging middleware and RBAC enforcement are available.
- Supabase JWT auth is used for session identity.
- OIDC is configurable for enterprise SSO requirements.
- Compliance scaffolds are available in docs/COMPLIANCE.md.
- User/workspace records and audit logs are stored in Supabase Postgres.

## 2. Architecture Snapshot

- Frontend: React + Vite on Vercel.
- Backend API: FastAPI on Render.
- Identity + relational data: Supabase Auth + Supabase Postgres.
- Cache: Redis (Upstash in managed deployments via REDIS_URL).
- SQL execution engine: embedded DuckDB in backend services.
- Object storage: Amazon S3 (default provider) for dataset parquet artifacts.
- Optional memory service: Chroma for vector context use cases.

## 3. Underlying Solutions / Tech Map

| Capability | Solution / Tech |
| --- | --- |
| Data Cleaning & Profiling | Pandas, pyjanitor, AI/LLM agents |
| Auto Insight/Trends | Rule-based insights + optional Groq-backed generation |
| Context/Memory | Supabase Postgres + optional Chroma |
| AI Agents/Autowrangling | FastAPI orchestration + DuckDB SQL execution |
| Visualization | React + charting libraries |
| API + Connectors | FastAPI, REST, plugins/adapters |
| Permissions & Security | Supabase JWT, RBAC, audit logging |
| Deployment | Vercel + Render + Supabase + Upstash + S3 |

## 4. Typical User Workflow
1. Connect data sources via UI or API.
2. Profile and clean with AI-assisted suggestions.
3. Teach business context and validate rules.
4. Analyze and transform with recipes.
5. Visualize and iterate via dashboards.
6. Export or deploy outputs with automation.
7. Monitor with governance and audit trails.

## 5. Deployment Approach
- Managed cloud topology (current):
	- Frontend on Vercel.
	- Backend on Render.
	- Auth and primary Postgres on Supabase.
	- Redis on Upstash.
	- Dataset objects on S3.
- Local/self-hosted topology:
	- Docker Compose with local Postgres/Redis/optional Chroma.
	- Storage provider is configurable (S3 default, optional R2/GCS/Azure/local).
- Kubernetes/Helm artifacts remain available for infrastructure-managed deployments.

## 6. How It Works (Under the Hood)
- Profiling and transformation pipelines run in FastAPI backend services.
- Dataset parquet files are stored in object storage and queried through DuckDB.
- Query results use Redis acceleration with persisted cache metadata in Postgres.
- Context and governance records are persisted in Supabase Postgres.
- Frontend consumes API endpoints for previews, transformations, dashboards, sharing, and governance workflows.
