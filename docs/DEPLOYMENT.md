# Deployment

## Docker Compose (Local)
- Configure .env
- Start services with Docker Compose

## Docker Compose (Production)
- Copy .env.production.example to .env.production and replace secrets
- Build and start:
	- docker compose -f docker-compose.prod.yml up -d --build
- Frontend is served on port 80 and proxies /api to the backend

## Render (Backend) + Vercel (Frontend) + Supabase + Upstash + S3
### Backend (Render)
- Create a new Render Web Service from the backend repo
- Build command: pip install -r requirements.txt
- Start command: uvicorn app.main:app --host 0.0.0.0 --port 10000
- Add environment variables:
	- DATABASE_URL (Supabase Postgres connection string)
	- REDIS_URL (Upstash Redis connection string)
	- SUPABASE_URL
	- SUPABASE_ANON_KEY
	- SUPABASE_JWT_SECRET
	- SUPABASE_JWT_AUD
	- STORAGE_PROVIDER=s3
	- AWS_ACCESS_KEY_ID
	- AWS_SECRET_ACCESS_KEY
	- AWS_REGION
	- S3_BUCKET_NAME
	- PUBLIC_BASE_URL (your Vercel frontend URL)
	- CORS_ORIGINS (comma-separated list including your Vercel domain)
	- METRICS_BEARER_TOKEN (optional)
	- SHARE_SIGNING_SECRET (recommended for signed share links)

### Database Migrations (Supabase)
- Run once against Supabase:
	- DATABASE_URL=<supabase> python -m alembic upgrade head

### Frontend (Vercel)
- Import the frontend project into Vercel
- Build command: npm run build
- Output directory: dist
- Environment variables:
	- VITE_API_BASE_URL (Render backend URL)
	- VITE_SUPABASE_URL
	- VITE_SUPABASE_ANON_KEY
	- VITE_ENABLE_BILLING=false

## Single VPS (Docker Compose + Caddy)
- Point Cloudflare DNS records for `datahub.org.in` and `app.datahub.org.in` to the VPS IP
- Ensure `.env.production` uses the Supabase Postgres connection string for `DATABASE_URL`
- Bring up the stack (Caddy handles TLS and reverse proxy):
	- docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
- Run migrations against Supabase:
	- docker compose --env-file .env.production -f docker-compose.prod.yml run --rm backend alembic upgrade head
- Verify:
	- https://app.datahub.org.in
	- https://app.datahub.org.in/api/health

## Helm (Placeholder)
### Helm (Kubernetes)
- Helm chart lives in infra/helm/datahub
- Backend and frontend are deployed from the same chart
- Use infra/helm/datahub/values-prod.yaml as a starting point

Secrets (recommended):
- Use infra/k8s/datahub-backend-secret.yaml as a template
- Replace RELEASE_NAME and REPLACE_ME values
- Apply before Helm install:
	- kubectl apply -f infra/k8s/datahub-backend-secret.yaml

Example install:
- helm install datahub infra/helm/datahub -f infra/helm/datahub/values-prod.yaml --namespace datahub --create-namespace

Example upgrade:
- helm upgrade datahub infra/helm/datahub -f infra/helm/datahub/values-prod.yaml --namespace datahub

Key values:
- backend.image.repository/tag
- frontend.image.repository/tag
- backend.env (DATABASE_URL, REDIS_URL, CHROMA_URL, CORS_ORIGINS, PUBLIC_BASE_URL)
- backend.secretEnv (APP_SECRET_KEY, OIDC_CLIENT_SECRET, SHARE_SIGNING_SECRET)
- backend.ingress + frontend.ingress
- frontend.env.VITE_API_BASE_URL

## Database Migrations
- Helm runs migrations via a Job when backend.migrationJob.enabled=true
- For manual migrations (or non-Helm setups):
	- Set DATABASE_URL in environment
	- Run: alembic upgrade head

## Production Notes
- Replace default secrets in values-prod.yaml
- Use Supabase Postgres and Upstash Redis in managed deployments
- Enable TLS and reverse proxy
- Set CORS_ORIGINS to your production domains
- Use .env.production.example as a template
- Configure OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET, OIDC_REDIRECT_URI for SSO
- Set OIDC_REDIRECT_URI to https://app.yourdomain.com/ and ensure the IdP allows it
- Tune DATASET_CACHE_MAX and DATASET_CACHE_TTL for in-memory dataset caching
- Tune PROFILE_CACHE_TTL and PROFILE_CACHE_MAX for profiling/summary caches
- Set PUBLIC_BASE_URL to generate share links for dashboards
- Configure SHARED_RATE_LIMIT_PER_MIN to protect shared links
- Set SHARE_SIGNING_SECRET to require signed share links
- Set SHARE_SCOPE_ALLOWLIST to restrict acceptable share scopes
- Configure SHARE_SCOPE_POLICY_* to require roles for specific scopes

## Release Pipeline
- A GitHub Actions workflow builds and pushes backend/frontend images on tags (v*.*.*)
- Images are pushed to GHCR as <repo>-backend and <repo>-frontend

## Rollback
- Re-deploy a previous image tag in your orchestrator or update docker-compose.prod.yml to the prior tag
- For Helm, run: helm rollback datahub <REVISION>

## Monitoring
- Prometheus metrics are exposed at /metrics on the backend
- Optional monitoring stack:
	- docker compose --env-file .env.production -f docker-compose.prod.yml -f docker-compose.monitoring.yml up -d
	- Prometheus: http://localhost:9090
	- Grafana: http://localhost:3000 (admin password via GRAFANA_ADMIN_PASSWORD)
- Alert rules are defined in infra/monitoring/alert.rules.yml
- If METRICS_BEARER_TOKEN is set, Prometheus uses it to authenticate to /metrics
- Grafana auto-provisions the Prometheus datasource via infra/monitoring/grafana/provisioning

## Beta Deployment Smoke Checklist
- Confirm Vercel domain and Render backend URL are set
- Confirm REDIS_URL points to Upstash and cache health is connected
- Confirm S3 credentials and bucket are configured for dataset object storage
- Run migrations against Supabase
- Verify health: https://<render-backend>/health
- Verify auth flow and core actions: login, upload dataset, preview, insights
- Verify shared links if enabled: https://<vercel-app>/shared/{token}
- If monitoring enabled: open Prometheus and Grafana, confirm datahub-backend target is UP
