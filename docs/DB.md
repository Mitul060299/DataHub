# Database & Migrations

## Overview
DataHub uses PostgreSQL (Supabase-hosted) for all transactional and metadata storage. Alembic manages schema migrations. A startup safety-net in `backend/app/main.py` re-applies all DDL idempotently to handle stalled migrations on Render free-tier.

## Migrations
Alembic is configured in `backend/alembic.ini`.

Typical workflow:
```bash
DATABASE_URL=<postgres_url> alembic upgrade head
```

### Migration History
| Revision | Description |
|---|---|
| 0001–0014 | Initial schema, users, datasets, transformations, recipes, agents |
| 0015 | workspace_scope on datasets |
| 0016 | transformation_history table |
| 0017 | visualisation tables (dashboards, widgets, themes) |
| 0018 | fix visualisation column types |
| 0019–0027 | pipelines_v2, pipeline_runs, pipeline_steps, artifacts, calculated_columns, billing |
| 0028 | user onboarding flags (`has_completed_onboarding`, `has_uploaded_first_file`) |
| 0029 | `projects` table; `project_id` FK on pipelines_v2, dashboards_v2, data_sources |
| 0030 | pipeline step artifacts |
| 0031 | fix user onboarding column types |
| 0032 | ensure user onboarding columns (idempotent guard) |
| 0033 | `user_usage` table (monthly usage tracking per user) |
| 0034 | `version_number`, `version_note` columns on `dataset_meta` |
| 0035 | `dashboard_comments` table |
| 0036 | `reviews` table |

## Table Inventory

### Core Users & Auth
| Table | Key Columns | Notes |
|---|---|---|
| `users` | id, username, role, plan, has_completed_onboarding, has_uploaded_first_file, notification_prefs | `notification_prefs` is JSONB: `{pipeline_complete, usage_warning, weekly_digest}` |
| `user_usage` | user_id, period (YYYY-MM), api_calls, pipeline_runs, datasets_uploaded, storage_bytes_used | Monthly bucket; UNIQUE(user_id, period) |

### Workspaces & Projects
| Table | Key Columns | Notes |
|---|---|---|
| `workspaces` | id, owner_id, share_token, scope, expires_at | Share link state |
| `projects` | id, user_id, workspace_id, name, description, colour, icon | User-scoped grouping for pipelines + dashboards |

### Datasets
| Table | Key Columns | Notes |
|---|---|---|
| `dataset_meta` | id, workspace_id, user_id, filename, row_count, col_count, parent_id, version_number, version_note | `parent_id` links version chain; `version_number` starts at 1 |
| `dataset_data` | id, dataset_id, data (JSONB) | Raw row storage (small datasets) |
| `dataset_chunks` | id, dataset_id, chunk_index, data | Chunked storage for larger datasets |
| `import_tables` | id, workspace_id, table_name, source_type | Imported external tables |
| `import_connections` | id, workspace_id, connector, config (JSONB) | Saved connector configs |
| `calculated_columns` | id, dataset_id, name, formula, result_type | Formula-derived columns |

### Pipelines
| Table | Key Columns | Notes |
|---|---|---|
| `pipelines_v2` | id, user_id, workspace_id, project_id, name, steps (JSONB), version_number, is_public | `project_id` nullable FK |
| `pipeline_runs` | id, pipeline_id, user_id, status, triggered_by, started_at, finished_at, runtime_params (JSONB) | |
| `pipeline_steps` | id, run_id, step_id, status, output_preview (JSONB) | Per-step execution state |
| `artifacts` | id, run_id, step_id, storage_path, row_count | Parquet artifact references |

### Dashboards
| Table | Key Columns | Notes |
|---|---|---|
| `dashboards_v2` | id, user_id, workspace_id, project_id, name, layout (JSONB), share_token | |
| `viz_dashboards` | id, name, workspace_id, widgets (JSONB) | Legacy widget-based dashboards |
| `viz_widgets` | id, dashboard_id, type, config (JSONB) | Legacy widgets |
| `viz_themes` | id, name, config (JSONB) | Colour themes |
| `dashboard_comments` | id, dashboard_id, user_id, author_name, body, created_at, updated_at | Threaded comments on v2 dashboards |

### Governance & Audit
| Table | Key Columns | Notes |
|---|---|---|
| `audit_logs` | id, action, actor, target, metadata (JSONB), created_at | Written by `audit_store.add()` and per-user audit endpoint |
| `approval_requests` | id, requester, resource_type, resource_id, summary, status, created_at | |

### Webhooks & Jobs
| Table | Key Columns | Notes |
|---|---|---|
| `webhooks` | id, workspace_id, target_url, event, created_at | |
| `scheduled_jobs` | id, workspace_id, name, cron, action, created_at | Store only; no built-in runner |

### Pipelines (legacy)
| Table | Key Columns | Notes |
|---|---|---|
| `pipelines` | id, workspace_id, name, steps (JSONB) | Superseded by pipelines_v2 |
| `pipeline_runs` (legacy) | id, pipeline_id, status | |

### Transformation History
| Table | Key Columns | Notes |
|---|---|---|
| `transformation_history` | id, dataset_id, recipe (JSONB), applied_at | |

### Feedback & Reviews
| Table | Key Columns | Notes |
|---|---|---|
| `feedback` | id (UUID), name, email, subject, message, created_at | Homepage contact/feedback form |
| `reviews` | id (UUID), name, role, rating (1–5), body, approved, created_at | Homepage user reviews |

### Billing
| Table | Key Columns | Notes |
|---|---|---|
| `billing_subscriptions` | id, user_id, plan, razorpay_subscription_id, status, created_at | |

### Chat
| Table | Key Columns | Notes |
|---|---|---|
| `chat_sessions` | id, dataset_id, user_id, messages (JSONB), created_at | |
