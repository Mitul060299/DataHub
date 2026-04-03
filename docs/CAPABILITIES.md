# DataHub Capabilities Status

Legend: ✅ Implemented | 🟡 Partial/Scaffolded | ➕ Planned

## 1. Data Ingestion & Connectivity
- CSV upload ✅
- Inline CSV connector ✅
- Excel (single-sheet) ✅
- Excel (multi-sheet) ✅ — sheet list endpoint + `sheet_name` param on upload
- CSV delimiter auto-sniffing ✅ — `csv.Sniffer` detects `,` / `\t` / `;` / `|` / `:`
- Non-UTF-8 CSV auto-conversion ✅ — chardet detects encoding, re-encodes to UTF-8 before parse
- JSON / Parquet upload ✅
- DB connectors — PostgreSQL, MySQL, SQLite, MSSQL, Oracle ✅ (Professional tier)
- DB connectors — Snowflake, BigQuery, Redshift ✅ (Team tier)
- SaaS API connectors (Salesforce) ✅ (Enterprise tier)
- Live dataset federation ✅ — query DB/API connector in real time; result cached with TTL
- Batch imports 🟡 (CSV upload)
- Incremental imports 🟡 (sql_query updated_at)
- Schema/type inference ✅ (pandas inference)
- Connector/plugin system ✅ (registry + load/enable/disable)
- Import UI ✅
- File format validation ✅ (allowlist: CSV, Excel, JSON, Parquet; MIME check; magic-byte sniff)
- File size enforcement ✅ (configurable per-plan upload limit)
- File upload preview ✅ (column/row preview before confirming upload)
- Dataset version history ✅ (version_number, version_note columns; upload-version endpoint; UI list)

## 2. AI-Powered Profiling & Cleaning
- Profiling (missing, outliers, types) ✅
- Smart type inference ✅
- Auto-clean suggestions ✅ (rule-based + LLM optional)
- Complete data profile computation ✅ — column stats, outlier counts, top values, duplicate %, null %
- Pseudo-null detection ✅ — strings like "N/A", "null", "" treated as nulls in profiling
- "Did you mean?" suggestions ✅
- Versioned cleaning / undo ✅ — surgical mid-pipeline step undo; recipe history
- NL pipeline editing ✅ — POST /api/pipelines/{id}/nl-edit rewrites steps from plain English (Groq JSON-mode)
- Schema alignment & JOIN assistance ✅ — GET /datasets/compare-schemas; exact/fuzzy column matching; alignment score

## 3. Data Transformation Engine — Pipeline Operations
All operations available via NL pipeline editing and the visual step builder:

### Null handling
- `fill_nulls` ✅ — strategies: mean / median / mode / zero / ffill / bfill / literal value
- `filter_nulls` ✅ — drop rows where a column is null
- `drop_null_columns` ✅ — drop columns with >threshold% nulls

### Type casting & enrichment
- `cast_column_type` ✅ — int / float / str / datetime / bool
- `add_calculated_column` ✅ — arbitrary df.eval formula
- `generate_id` ✅ — surrogate key modes: rownum / uuid4 / md5-hash

### Cleaning & deduplication
- `drop_duplicates` ✅ — exact dedup (keep first / last)
- `deduplicate_by_column` ✅ — subset dedup on a single column
- `fuzzy_deduplicate` ✅ — rapidfuzz ratio threshold; graceful fallback to exact dedup
- `trim_string_columns` ✅ — strip leading/trailing whitespace
- `rename_snake_case` ✅ — normalise all column names to snake_case

### Filtering & outlier removal
- `filter_rows` ✅ — operators: `== != > >= < <=` and `contains / startswith / endswith`
- `filter_outliers` ✅ — zscore threshold; applied per numeric column
- `filter_nulls` ✅ — drop rows where column is null

### Normalisation & encoding
- `normalize_column` ✅ — min-max scaling or z-score standardisation
- `round_numeric` ✅ — round to N decimal places
- `encode_categorical` ✅ — one-hot or label encoding
- `parse_dates` ✅ — auto-detect and parse date columns

### Sorting & aggregation
- `sort_by_column` ✅ — ascending / descending
- `group_by_sum` / `group_by_count` / `group_by_mean` ✅
- `pivot_table` ✅ — index / columns / values / aggfunc
- `resample_timeseries` ✅ — freq (D/W/M) + aggregation function

### Time-series & temporal
- `detect_date_gaps` ✅ — reindex to complete date range; gap fill with ffill / bfill
- `normalize_timezone` ✅ — `tz_localize` source TZ → `tz_convert` target TZ

### Validation
- `validate_rules` ✅ — rule engine with operators: `not_null / > / >= / < / <= / == / unique / regex / min_length`; modes: `flag` (add boolean column) / `drop` (remove failing rows) / `report` (flag with custom column name)

### AI transforms
- `sentiment` ✅ — Groq LLM batch (with keyword-based fallback)
- `keywords` ✅ — top-k frequency extraction
- `anomaly_detection` ✅ — zscore-based, per numeric column

### Custom
- `custom` ✅ — raw DuckDB SQL with `{{dataset}}` placeholder

## 5. Business Context & Memory
- Glossary/rules API ✅
- Persistence ✅ (Postgres + Chroma optional)
- Context-aware agents ✅
- Versioned context ✅ (versions list + revert)

## 6. AI Agents & Intelligence
- Suggestions/insights ✅ (rule-based + optional LLM via Groq)
- Anomaly detection ✅ (outliers, duplicates, cardinality)
- Explainable insights ✅ (quality score + rationale)
- Insight narratives 🟡 (LLM summary when configured)
- Auto-actions from insights ✅ (missing + duplicates fixes)
- Auto-apply recipes ✅
- Learn from feedback 🟡 (feedback collection API)
- Conversational interface ✅ (streaming SSE chat + Markdown rendering)
- NL pipeline editing ✅ — 30+ supported operations; schema-aware; auto-retry on LLM parse failure
- LangGraph agent state machine ✅ — 8-node graph (context_loader → intent_classifier → planner → plan_presenter → execute_step → reflect → pipeline_recorder → responder)
- Multi-turn conversation memory ✅ — full `conversation_history` threaded through the agent stack; LangChain `HumanMessage`/`AIMessage` history prepended to every request
- Live per-step streaming progress ✅ — `agent.step.start` SSE event emitted before each `execute_step` node; frontend shows "Step N/M: operation" in real time
- Schema-aware converse ✅ — `converse` intent receives active dataset schema so questions like “what columns do I have?” get accurate answers
- Cheaper intent classifier ✅ — `llama-3.1-8b-instant` (via `GROQ_INTENT_MODEL`) used for single-token intent classification; 70B only used for planning/execution
- Richer SQL repair ✅ — `reflect` node receives column stats + failed operation name alongside schema for more targeted SQL rewrites
- Secondary dataset picker ✅ — UI “＋ Join” button lets users select additional datasets; `secondary_dataset_ids` forwarded to the agent for JOIN/UNION steps
- Expand query results ✅ — query result tables show first 20 rows with a “Show all / Show less” toggle
- Copy SQL from plan steps ✅ — each step in the execution plan has a “Copy” button with a ✓ confirmation flash
- Stop generation ✅ — “■ Stop” button aborts the SSE stream via `AbortController`
- Rate-limited chat ✅ — `/cleaning/datasets/{id}/chat` limited to 20 requests/minute per user

## 7. Analytics & Visualizations
- Summary charts ✅
- Dashboards CRUD ✅
- Widget system ✅
- Canvas v2 ✅ — text/markdown tiles, KPI tiles, data slicer tiles, share link
- Canvas v2.1 ✅ — inline KPI/slicer editing, text formatting, multi-row tile placement
- KPI tiles connected to real dataset aggregations ✅ (SUM / COUNT / AVG / MIN / MAX)
- Slicer tiles connected to dataset column values ✅ (interactive cross-filter)
- Drag/drop builder ✅
- Export PDF/SVG/PNG ✅
- Usage analytics ✅ (audit-based summary)
- Correlation insights ✅
- Interactive chart controls 🟡 (bins/top-N implemented)
- Configurable widget settings ✅
- Dashboard templates ✅
- Widget theming ✅
- Dashboard comments ✅ (GET/POST/DELETE /api/dashboards/{id}/comments with auth)

## 8. AI Chat UX
- Streaming SSE chat with live typing indicator ✅
- Markdown rendering in AI responses (bold, lists, code blocks) ✅
- Auto-grow textarea (expands up to 160 px, no manual resize) ✅
- Stop generation button (aborts SSE stream via `AbortController`) ✅
- Live per-step progress indicator while agent executes (shows "Step N/M: operation") ✅
- Secondary dataset picker — "＋ Join" header button pre-loads datasets for JOIN steps ✅
- Query result tables with "Show all / Show less" toggle (default: first 20 rows) ✅
- Copy SQL button on each plan step with ✓ confirmation flash ✅
- Follow-up suggestion chips after each AI response ✅
- Data quality report inline in chat ✅
- Chart rendering inline in chat (with ☁ Save to Visualizations button) ✅
- `/` keyboard shortcut focuses AI chat input from anywhere on the page ✅
- Explorer panel width drag-to-resize persisted to `localStorage` ✅

## 9. Query Folding & Write-Back
- Query folding ✅ — QueryFoldOptimizer collapses compatible pipeline steps into fewer DuckDB SQL queries
- Write-back ✅ — POST /api/pipelines/{id}/write-back; encrypted connector credentials; DML execution

## 10. Collaboration & Automation
- Webhooks ✅
- Scheduled jobs 🟡 (database-backed store; no runner yet)
- Approval workflows ✅
- Approval filters ✅
- Real-time collaboration ✅ (presence/chat with auth token)
- Dashboard sharing ✅
- Shared dashboard view ✅
- Workspace sharing ✅
- Shared workspace view ✅
- Share link expiry ✅
- Shared link rate limiting ✅
- Signed share links ✅
- Share access auditing ✅
- Share scopes ✅
- Bulk revoke shared links ✅
- Admin share management ✅
- Weekly digest email ✅ (per-user 7-day activity summary via cron endpoint + Resend)
- Email — pipeline complete notification ✅ (Resend; respects user pref)
- Email — 80% usage warning ✅ (Resend; respects user pref)
- Notification preferences ✅ (GET/PUT /users/me/notification-preferences; 3 toggles)
- Projects ✅ (user-scoped project grouping for pipelines, dashboards, data sources)

## 11. Extensibility & Integration
- REST API ✅
- Plugin framework ✅
- External connectors ✅ (Supabase, SQL, Sheets, Excel, HTTP CSV)
- Two-way sync ✅
- Schema comparison API ✅ — GET /datasets/compare-schemas?ids=id1,id2

## 12. Security & Compliance
- Audit viewer UI ✅ (settings page with pagination + filter)
- Per-user audit log API ✅ (GET /users/me/audit-log; paginated, filterable)
- Role-based access ✅ (viewer/editor/admin)
- OIDC SSO 🟡 (requires configuration)
- Rate limiting ✅ (slowapi; per-IP, per-endpoint limits; 429 + Retry-After)
- File upload validation ✅ (format allowlist, MIME check, content sniff)
- Usage enforcement ✅ (hard limits per plan; 429 on exceed)

## 13. Billing & Monetisation
- Pricing tiers ✅ (Free / Professional / Team / Business / Enterprise)
- Razorpay integration ✅ (plans, subscriptions, HMAC-verified webhooks)
- Usage tracking ✅ (user_usage table, monthly period buckets)
- Plan limit enforcement ✅ (API calls, pipeline runs, datasets, storage)
- Usage UI ✅ (settings page usage panel with progress bars)

## 14. Community & Feedback
- Homepage feedback form ✅ (POST /feedback; name, email, subject, message)
- Feedback email notifications ✅ (sent to owner via Resend on submission)
- User reviews ✅ (POST /api/reviews; star rating 1–5; owner-approved before display)
- Reviews homepage section ✅ (public display of approved reviews + submit form)

## 15. Deployment & DevOps
- Docker Compose ✅
- Helm placeholders ✅
- CI build ✅
- Deploy/rollback pipeline ✅
- Monitoring ✅ (Prometheus/Grafana compose)
- Performance optimisations ✅ (dataset cache with TTL/LRU)
- Query caching ✅ (profiling/summary cache + invalidation)
- Startup schema safety-net ✅ (DDL guards in main.py; bypasses stalled Alembic migrations)

## 15. Supabase Integration
- Supabase connector ✅
- Supabase JWT validation ✅

## 16. Test Coverage
- 134 automated tests ✅ — 40 original + 94 workstream tests
- Covers: all 30+ pipeline operations, DB connectors, file ingestion, NL editing, profiling, validation rules, schema comparison, and security hardening
