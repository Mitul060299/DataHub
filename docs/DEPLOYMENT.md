# Deployment

## Docker Compose (Local)
- Configure .env
- Start services with Docker Compose

## Docker Compose (Production)
- Copy .env.production.example to .env.production and replace secrets
- Build and start: `docker compose -f docker-compose.prod.yml up -d --build`
- Frontend is served on port 80 and proxies /api to the backend

## Render (Backend) + Vercel (Frontend) + Supabase + Upstash + S3

### Backend (Render)
- Create a new Render Web Service from the backend repo
- Build command: `pip install -r requirements.txt`
- Start command: see `backend/entrypoint.sh` (runs Alembic then uvicorn on port 10000)

#### Required Environment Variables

**Core**
| Variable | Description |
|---|---|
| `DATABASE_URL` | Supabase Postgres connection string |
| `REDIS_URL` | Upstash Redis connection string |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_JWT_SECRET` | JWT signing secret from Supabase dashboard |
| `SUPABASE_JWT_AUD` | JWT audience (usually `authenticated`) |
| `PUBLIC_BASE_URL` | Vercel frontend URL (share link generation) |
| `CORS_ORIGINS` | Comma-separated allowed origins including Vercel domain |

**Storage**
| Variable | Description |
|---|---|
| `STORAGE_PROVIDER` | `s3` (default) |
| `AWS_ACCESS_KEY_ID` | AWS access key |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key |
| `AWS_REGION` | S3 bucket region (e.g. `ap-south-1`) |
| `S3_BUCKET_NAME` | S3 bucket name |

**AI / LLM**
| Variable | Description |
|---|---|
| `GROQ_API_KEY` | Groq API key — required for AI agent and NL pipeline editing |

**Email (Resend)**
| Variable | Description |
|---|---|
| `RESEND_API_KEY` | Resend API key (starts with `re_...`) — all email notifications |
| `EMAIL_FROM_ADDRESS` | Verified sender address (e.g. `noreply@datahub.org.in`) |

**Billing (Razorpay)**
| Variable | Description |
|---|---|
| `RAZORPAY_KEY_ID` | Razorpay key ID |
| `RAZORPAY_KEY_SECRET` | Razorpay secret (HMAC webhook verification) |

**Cron**
| Variable | Description |
|---|---|
| `CRON_SECRET` | Authorization secret for the scheduled digest endpoint |

**Optional / Security**
| Variable | Description |
|---|---|
| `APP_SECRET_KEY` | Server-side signing secret |
| `METRICS_BEARER_TOKEN` | Protects `/metrics` endpoint |
| `SHARE_SIGNING_SECRET` | HMAC secret for signed share links |
| `SHARE_SCOPE_ALLOWLIST` | Comma-separated acceptable share scopes |
| `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_REDIRECT_URI` | SSO via OIDC |
| `DATASET_CACHE_MAX`, `DATASET_CACHE_TTL` | In-memory dataset cache tuning |
| `PROFILE_CACHE_TTL`, `PROFILE_CACHE_MAX` | Profiling/summary cache tuning |
| `SHARED_RATE_LIMIT_PER_MIN` | Rate limit for shared link views |

### Database Migrations (Supabase)
```bash
DATABASE_URL=<supabase> alembic upgrade head
```
A startup safety-net in `main.py` also applies all DDL idempotently on every deploy.

### Frontend (Vercel)
- Import the frontend project into Vercel
- Build command: `npm run build`
- Output directory: `dist`

| Variable | Description |
|---|---|
| `VITE_API_BASE_URL` | Render backend URL |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key |
| `VITE_ENABLE_BILLING` | `true` or `false` |

## Single VPS (Docker Compose + Caddy)
- Point DNS for `datahub.org.in` and `app.datahub.org.in` to the VPS IP
- Ensure `.env.production` has `DATABASE_URL` pointing to Supabase Postgres
- Bring up the stack (Caddy handles TLS + reverse proxy):
	`docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build`
- Run migrations:
	`docker compose --env-file .env.production -f docker-compose.prod.yml run --rm backend alembic upgrade head`
- Verify the backend health endpoint is reachable after deploy

## Helm (Kubernetes)
- Chart lives in `infra/helm/datahub`; use `values-prod.yaml` as a starting point
- Apply secrets first: `kubectl apply -f infra/k8s/datahub-backend-secret.yaml`
- Install: `helm install datahub infra/helm/datahub -f infra/helm/datahub/values-prod.yaml --namespace datahub --create-namespace`
- Upgrade: `helm upgrade datahub infra/helm/datahub -f infra/helm/datahub/values-prod.yaml --namespace datahub`
- Migrations run via a Job when `backend.migrationJob.enabled=true`

## Release Pipeline
- GitHub Actions builds and pushes backend/frontend images on tags (`v*.*.*`)
- Images pushed to GHCR as `<repo>-backend` and `<repo>-frontend`

## Rollback
- Re-deploy a previous image tag in Render / update `docker-compose.prod.yml`
- Helm: `helm rollback datahub <REVISION>`

## Monitoring
- Prometheus metrics at `/metrics` (requires `METRICS_BEARER_TOKEN` if set)
- Optional monitoring stack:
	`docker compose --env-file .env.production -f docker-compose.prod.yml -f docker-compose.monitoring.yml up -d`
	- Prometheus: http://localhost:9090
	- Grafana: http://localhost:3000 (password via `GRAFANA_ADMIN_PASSWORD`)
- Alert rules in `infra/monitoring/alert.rules.yml`
- Grafana auto-provisions the Prometheus datasource via `infra/monitoring/grafana/provisioning`

## Weekly Digest Cron
Configure via an external scheduler:
- URL: `POST https://<render-backend>/api/cron/weekly-digest`
- Header: a pre-shared secret (value from `CRON_SECRET` environment variable)
- Recommended schedule: every Monday 08:00 UTC

## Beta Deployment Smoke Checklist
- Confirm Vercel domain and Render backend URL are set
- Confirm `REDIS_URL` points to Upstash and cache health is connected
- Confirm S3 credentials and bucket are configured
- Confirm `GROQ_API_KEY` is set (AI features silently degrade otherwise)
- Confirm `RESEND_API_KEY` and `EMAIL_FROM_ADDRESS` are set (email silently no-ops otherwise)
- Confirm `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET` are set if billing is enabled
- Confirm `CRON_SECRET` is set if using weekly digest cron
- Run migrations against Supabase
- Verify health: `https://<render-backend>/health`
- Verify auth flow and core actions: login, upload dataset, preview, insights
- Verify shared links: `https://<vercel-app>/shared/{token}`
- If monitoring enabled: open Prometheus/Grafana, confirm `datahub-backend` target is UP
- After 15 min, grep Render logs for `DUCKDB_CLEANUP_RUN` — confirms background session cleanup thread is alive
- Hit `GET /health/sessions` and confirm `active_sessions` and `process_rss_mb` look sane

## Render Scaling & Session State

### Why you must not run multiple Render instances yet

DuckDB sessions are stored in `_sessions` — an in-process Python dict on each Render worker.
If you scale to 2+ instances without session state in Redis, two requests from the same user can land on different instances and get `SessionExpiredError` because each instance has its own separate `_sessions`.

**Do not increase Render instances until Redis session reconstruction is implemented.**

### Scaling ladder

| Stage | DAU | Action |
|---|---|---|
| Current | 1–20 | 1 Render instance, 512 MB RAM |
| Upgrade RAM | 20–50 | Upgrade Render instance to 1 GB RAM. Still 1 instance. Lower cost than adding an instance, no session split risk. |
| Add Redis session state | 50–100 | Move DuckDB session reconstruction to Redis (Upstash). On session miss, rebuild from last S3 checkpoint artifact. Then safe to run 2 instances. |
| Horizontal scale | 100+ | 2–3 instances + Redis + session reconstruction. At this point use Kubernetes (Helm chart in `infra/helm/datahub`). |

### Signal to act

Use `GET /health/sessions` (add to your Render health check or post-deploy smoke test):

```json
{
  "active_sessions": 3,
  "oldest_session_age_minutes": 12.4,
  "process_rss_mb": 280.5,
  "high_memory_threshold_mb": 400.0,
  "under_memory_pressure": false,
  "session_ttl_seconds": 1800,
  "cleanup_interval_seconds": 900
}
```

- `process_rss_mb` consistently > 350 between cleanup runs → upgrade instance RAM (not add instances)
- `under_memory_pressure: true` in logs → sessions are already being evicted at half TTL; upgrade instance immediately
- `active_sessions` growing unbounded → cleanup thread may have died; grep logs for `DUCKDB_CLEANUP_ERROR`

### Memory pressure tuning

The `DUCKDB_HIGH_MEMORY_MB` env var (default `400`) sets the RSS threshold above which session TTL is halved from 30 min to 15 min to prevent OOM. Tune this to ~80% of your instance's RAM:

| Render instance RAM | Set DUCKDB_HIGH_MEMORY_MB |
|---|---|
| 512 MB | 400 (default) |
| 1 GB | 800 |
| 2 GB | 1600 |

### S3 credential rotation

`StorageService._s3_client()` creates a fresh boto3 client on every call, so it re-reads env vars each time.
Rotating AWS credentials via the Render environment variable dashboard takes effect on the **next upload/download** — no restart or session flush needed.
For production AWS: prefer IAM instance roles over static access keys to eliminate manual rotation entirely.

### Cleanup thread monitoring

The background cleanup thread logs `DUCKDB_CLEANUP_RUN` every 15 minutes unconditionally.
If this log line is absent in Render logs for > 20 minutes after deploy, the thread has died silently.
**Fix**: redeploy. The thread restarts with the process.

To search in Render: Dashboard → Logs → filter `DUCKDB_CLEANUP_RUN`.
