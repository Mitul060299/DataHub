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
- Rate limiting on all endpoints (per-IP)
- File upload validation (format allowlist, MIME check)
- Feedback form with owner email notification
- User reviews section on homepage

## Phase 6 - Advanced Data Engine ✅ Complete
- **30+ pipeline operations** — fill_nulls (7 strategies), cast_column_type (5 types), add_calculated_column (df.eval formula), normalize_column (minmax/zscore), round_numeric, encode_categorical (onehot/label), filter_rows (8 operators), deduplicate_by_column, filter_nulls, filter_outliers (zscore), sort_by_column, group_by_sum/count/mean, pivot_table, detect_date_gaps (reindex + fill), normalize_timezone, generate_id (rownum/uuid/hash)
- **Fuzzy deduplication** — fuzzy similarity threshold with graceful fallback to exact dedup
- **Validation rule engine** — validate_rules with 9 operators (not_null, >, >=, <, <=, ==, unique, regex, min_length); flag / drop / report modes
- **Schema alignment API** — GET /datasets/compare-schemas; exact/fuzzy column matching; alignment score 0–1
- **CSV auto-detect** — delimiter auto-sniffing; non-UTF-8 encoding auto-conversion
- **Multi-sheet Excel** — sheet list endpoint (POST /import/excel-sheets); upload sheet param
- **Canvas v2.1** — KPI tiles connected to real dataset aggregations (SUM/COUNT/AVG/MIN/MAX); slicer tiles for interactive column filtering; text block formatting; multi-row placement
- **Query folding** — a query optimization layer collapses adjacent pipeline steps into fewer SQL queries
- **Write-back** — pipeline result written to source DB connector via DML; connector credentials encrypted at rest
- **Live dataset federation** — LiveDatasetService queries DB/API connectors in real time; results cached with TTL
- **DB connectors live** — PostgreSQL, MySQL, SQLite, MSSQL, Oracle (Professional); Snowflake, Redshift, BigQuery (Team)
- **Surgical mid-pipeline step undo** — individual step removal preserves surrounding steps and re-runs lineage
- Comprehensive automated test suite covering all core services

## Phase 7 - AI Agent Enrichment ✅ Complete
- **Multi-turn conversation memory** — prior conversation turns are carried across the full request stack; each new request includes the full conversation history
- **Live per-step streaming** — a progress event is emitted before every step with step number, operation, and total steps; frontend shows live progress indicator
- **Schema-aware converse** — `converse` intent includes active dataset schema in the system prompt so column questions are answered accurately
- **Rate-limited AI chat** — AI chat endpoint is rate-limited per user
- **Cost-optimised intent classifier** — lightweight model for single-token intent classification; large model reserved for planning and execution
- **Richer SQL reflection** — `reflect` node includes column statistics and failed operation name in the repair prompt for more targeted SQL rewrites
- **Secondary dataset picker** — “＋ Join” button in AI panel header; workspace datasets loaded and rendered as chip toggle; `secondary_dataset_ids` sent to the agent
- **Expand query results** — result tables default to 20 rows with “Show all / Show less” toggle
- **Copy SQL** — copy button on each plan step’s SQL block with ✓ confirmation flash
- **UX polish** — stop button (AbortController), auto-grow textarea, Markdown rendering, `/` shortcut to focus input, explorer width persistence, chart save error toast

## Phase 8 - AI Intelligence Upgrade ✅ Complete
- **Table name auto-resolution** — intent classifier silently matches user-mentioned table names to the session table registry by name similarity; only asks for clarification when genuinely ambiguous (e.g. multiple tables loaded and none specified)
- **Clarify intent & node** — new `clarify_step` graph node asks exactly ONE focused question with 2–3 concrete examples; sets `needs_clarification: True`; question streamed via SSE `agent.done` event with `intent: "clarify"`; graph ends at `__end__` waiting for user's next turn
- **Clarification bubble styling** — purple left-border + `❓ NEEDS YOUR INPUT` header + `↓ Type your answer below` hint; no follow-up chips shown after clarification
- **Plan modification workflow** — Approve / Modify / Reject three-button UI on both `PlanCard` (linear) and `PlanDAG` (branching); Modify opens inline textarea; Enter submits; Apply disabled when textarea empty; old plan marked rejected (red) in chat
- **Plan modification backend** — `plan_pending_modification` bool threaded from request body through router → controller → agent graph service → `_build_initial_state` → planner; planner builds a `modification_prompt` with the existing plan JSON + user instruction as `HumanMessage` content
- **Data quality two-step plan** — `validate` / `data_quality` intent always generates step 1 (safe null-count SQL using correlated subquery) + step 2 (human-readable summary with null%, duplicate_rows, min/max/mean/outlier_count per numeric column); responder ends with "Want me to automatically fix these issues?"
- **Join key auto-detection** — planner identifies both tables from session registry by name matching; finds common columns; prefers `*_id / id / key / code`; generates complete `LEFT JOIN` SQL with `left_table / right_table / join_key / join_type` in parameters block
- **Proactive insights after every operation** — `RESPONDER_TRANSFORM_PROMPT` appends one domain observation + one "Want me to" / "Shall I" follow-up; outlier callout injected when `outlier_count > 0`
- **`intent` field on `agent.done` SSE event** — `input_state.get("intent")` forwarded in responder SSE payload so frontend follow-up chips are intent-aware
- **`clarify_step` SSE event** — `agent_graph.py` emits `agent.done` with `intent: "clarify"` from `clarify_step` node (previously the question was generated but never streamed)
- **Intent-aware follow-up chips** — `validate` → fix/chart/export chips; `clarify` and `converse` → no chips

## Phase 9 - Enterprise Hardening ➕ Planned
- SSO / SAML integration
- On-premise / air-gapped deployment
- Advanced data lineage and compliance packs (SOC2, GDPR)
- White-label option
- 24/7 dedicated support SLA
- Scheduled pipeline runner (currently store-only)
