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
