param(
  [ValidateSet("up","down","logs","ps","restart")]
  [string]$Action = "up"
)

$ErrorActionPreference = "Stop"

switch ($Action) {
  "up" { docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build }
  "down" { docker compose --env-file .env.production -f docker-compose.prod.yml down }
  "restart" { docker compose --env-file .env.production -f docker-compose.prod.yml up -d }
  "logs" { docker compose --env-file .env.production -f docker-compose.prod.yml logs -f }
  "ps" { docker compose --env-file .env.production -f docker-compose.prod.yml ps }
}
