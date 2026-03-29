# Roadmap

## Phase 1 - MVP ✅ Complete
- FastAPI backend with dataset upload, profiling, and recipe endpoints
- React frontend shell with upload and table preview
- Docker Compose deployment

## Phase 2 - AI Integration ✅ Complete
- AI-driven profiling and cleanup suggestions (Groq LLM)
- Context memory for business rules (Postgres + Chroma)
- RAG workflows and conversational dataset chat

## Phase 3 - Advanced Analytics & UX ✅ Complete
- Interactive dashboard builder (v2 dashboards with drag-drop layout)
- Dashboard comments
- Collaboration and sharing (signed share links, scopes, rate limits)
- RBAC (viewer/editor/admin), audit logs, per-user audit trail UI
- File version history (version_number, version_note, upload-version endpoint)

## Phase 4 - Extensibility & Automation ✅ Complete
- Plugin/connector API (Supabase, SQL, Sheets, Excel, HTTP CSV)
- Webhooks and scheduled jobs
- Pipeline templates and NL pipeline editing (Groq JSON-mode)
- Approval workflows

## Phase 5 - Monetisation & Growth ✅ Complete
- Five-tier pricing (Free / Professional / Team / Business / Enterprise)
- Razorpay billing (plans, subscriptions, HMAC webhooks)
- Hard usage limits enforced per plan (API calls, pipeline runs, datasets, storage)
- Email notifications via Resend (pipeline complete, 80% usage warning, weekly digest)
- Notification preferences (per-user toggles)
- Rate limiting on all endpoints (slowapi, per-IP)
- File upload validation (format allowlist, MIME check)
- Feedback form with owner email notification
- User reviews section on homepage

## Phase 6 - Advanced Data Engine ✅ Complete
- **30+ pipeline operations** — fill_nulls (7 strategies), cast_column_type (5 types), add_calculated_column (df.eval formula), normalize_column (minmax/zscore), round_numeric, encode_categorical (onehot/label), filter_rows (8 operators), deduplicate_by_column, filter_nulls, filter_outliers (zscore), sort_by_column, group_by_sum/count/mean, pivot_table, detect_date_gaps (reindex + fill), normalize_timezone, generate_id (rownum/uuid/hash)
- **Fuzzy deduplication** — rapidfuzz ratio threshold with graceful fallback to exact dedup
- **Validation rule engine** — validate_rules with 9 operators (not_null, >, >=, <, <=, ==, unique, regex, min_length); flag / drop / report modes
- **Schema alignment API** — GET /datasets/compare-schemas; exact/fuzzy column matching; alignment score 0–1
- **CSV auto-detect** — csv.Sniffer delimiter sniffing; chardet non-UTF-8 encoding auto-conversion
- **Multi-sheet Excel** — sheet list endpoint (POST /import/excel-sheets); upload sheet param
- **Canvas v2.1** — KPI tiles connected to real dataset aggregations (SUM/COUNT/AVG/MIN/MAX); slicer tiles for interactive column filtering; text block formatting; multi-row placement
- **Query folding** — QueryFoldOptimizer collapses adjacent pipeline steps into single DuckDB SQL queries
- **Write-back** — pipeline result written to source DB connector via DML; connector credentials encrypted at rest
- **Live dataset federation** — LiveDatasetService queries DB/API connectors in real time; results cached with TTL
- **DB connectors live** — PostgreSQL, MySQL, SQLite, MSSQL, Oracle (Professional); Snowflake, Redshift, BigQuery (Team)
- **Surgical mid-pipeline step undo** — individual step removal preserves surrounding steps and re-runs lineage
- **134 automated tests** — 40 original + 94 new workstream tests; 100% passing

## Phase 7 - Enterprise Hardening ➕ Planned
- SSO / SAML (OIDC partially scaffolded)
- On-premise / air-gapped deployment
- Advanced data lineage and compliance packs (SOC2, GDPR)
- White-label option
- 24/7 dedicated support SLA
- Scheduled pipeline runner (currently store-only)
