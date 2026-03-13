#!/usr/bin/env sh
set -e

PORT_VALUE="${PORT:-8000}"
WORKERS_VALUE="${UVICORN_WORKERS:-${WEB_CONCURRENCY:-1}}"

echo "[entrypoint] Starting backend (port=${PORT_VALUE}, workers=${WORKERS_VALUE}, run_migrations=${RUN_MIGRATIONS:-0})"

if [ "${RUN_MIGRATIONS:-}" = "1" ]; then
	MIGRATION_TIMEOUT_SECONDS="${MIGRATION_TIMEOUT_SECONDS:-600}"
	echo "[entrypoint] Running alembic upgrade head (timeout=${MIGRATION_TIMEOUT_SECONDS}s)"
	if command -v timeout >/dev/null 2>&1; then
		if ! timeout "${MIGRATION_TIMEOUT_SECONDS}" alembic upgrade head; then
			status="$?"
			if [ "${status}" = "124" ]; then
				echo "[entrypoint] Migration timed out after ${MIGRATION_TIMEOUT_SECONDS}s"
			fi
			exit "${status}"
		fi
	else
		alembic upgrade head
	fi
fi

echo "[entrypoint] Launching uvicorn"
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT_VALUE}" --workers "${WORKERS_VALUE}"
