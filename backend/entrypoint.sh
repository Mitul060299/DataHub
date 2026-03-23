#!/usr/bin/env sh
set -e

PORT_VALUE="${PORT:-8000}"
WORKERS_VALUE="${UVICORN_WORKERS:-${WEB_CONCURRENCY:-1}}"

echo "[entrypoint] Starting backend (port=${PORT_VALUE}, workers=${WORKERS_VALUE}, run_migrations=${RUN_MIGRATIONS:-0})"

if [ "${RUN_MIGRATIONS:-}" = "1" ]; then
	MIGRATION_TIMEOUT_SECONDS="${MIGRATION_TIMEOUT_SECONDS:-600}"
	echo "[entrypoint] Running alembic upgrade head (timeout=${MIGRATION_TIMEOUT_SECONDS}s)"

	_run_alembic() {
		if command -v timeout >/dev/null 2>&1; then
			timeout "${MIGRATION_TIMEOUT_SECONDS}" alembic upgrade head
		else
			alembic upgrade head
		fi
	}

	# First attempt — redirect to temp file for error classification; cat after
	# so output still appears in the deploy log.
	set +e
	_run_alembic > /tmp/_alembic_out.txt 2>&1
	_alembic_status=$?
	set -e
	cat /tmp/_alembic_out.txt

	if [ "${_alembic_status}" != "0" ]; then
		if grep -qE "already exists|DuplicateTable|DuplicateColumn" /tmp/_alembic_out.txt; then
			echo "[entrypoint] Duplicate schema objects detected — stamping alembic_version to head and retrying once"
			alembic stamp head
			if ! _run_alembic; then
				echo "[entrypoint] Migration still failing after stamp+retry — aborting"
				exit 1
			fi
		elif grep -qE "LockNotAvailable|lock timeout|canceling statement due to lock" /tmp/_alembic_out.txt; then
			echo "[entrypoint] Migration blocked by lock — sleeping 10s and retrying once"
			sleep 10
			set +e
			_run_alembic > /tmp/_alembic_out2.txt 2>&1
			_retry_status=$?
			set -e
			cat /tmp/_alembic_out2.txt
			if [ "${_retry_status}" != "0" ]; then
				echo "[entrypoint] Migration still failing after lock-retry — aborting"
				exit 1
			fi
		elif grep -qE "timed out" /tmp/_alembic_out.txt 2>/dev/null || [ "${_alembic_status}" = "124" ]; then
			echo "[entrypoint] Migration timed out after ${MIGRATION_TIMEOUT_SECONDS}s"
			exit "${_alembic_status}"
		else
			exit "${_alembic_status}"
		fi
	fi
fi

echo "[entrypoint] Launching uvicorn"
export PYTHONUNBUFFERED=1
exec uvicorn app.main:app \
  --host 0.0.0.0 \
  --port "${PORT_VALUE}" \
  --workers "${WORKERS_VALUE}" \
  --lifespan on
