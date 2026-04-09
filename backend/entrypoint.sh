#!/usr/bin/env sh
set -e

PORT_VALUE="${PORT:-8000}"
WORKERS_VALUE="${UVICORN_WORKERS:-${WEB_CONCURRENCY:-1}}"

echo "[entrypoint] Starting backend (port=${PORT_VALUE}, workers=${WORKERS_VALUE}, run_migrations=${RUN_MIGRATIONS:-0})"

if [ "${RUN_MIGRATIONS:-}" = "1" ]; then
	MIGRATION_TIMEOUT_SECONDS="${MIGRATION_TIMEOUT_SECONDS:-600}"
	echo "[entrypoint] Running alembic upgrade head (timeout=${MIGRATION_TIMEOUT_SECONDS}s)"

	# If alembic_version has more than one row (split-brain from a previous
	# deploy that produced two heads), delete all but the lexicographically
	# highest revision so alembic sees exactly one current head.
	python3 - <<'PYDEDUP'
import os, sys
try:
    import sqlalchemy as _sa
    _url = os.environ.get("DATABASE_URL", "")
    if not _url:
        sys.exit(0)
    _eng = _sa.create_engine(_url, poolclass=_sa.pool.NullPool, connect_args={"prepare_threshold": None})
    with _eng.connect() as _c:
        _rows = [r[0] for r in _c.execute(_sa.text("SELECT version_num FROM alembic_version"))]
    if len(_rows) > 1:
        _keep = sorted(_rows)[-1]
        with _eng.connect() as _c:
            _c.execute(_sa.text("DELETE FROM alembic_version WHERE version_num != :v"), {"v": _keep})
            _c.commit()
        print(f"[entrypoint] alembic_version deduplicated: removed {len(_rows)-1} extra row(s), kept {_keep}")
    else:
        print(f"[entrypoint] alembic_version OK ({len(_rows)} row(s))")
except Exception as _e:
    print(f"[entrypoint] alembic_version dedup skipped: {_e}")
PYDEDUP

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
			set +e
			_run_alembic > /tmp/_alembic_out2.txt 2>&1
			_stamp_retry_status=$?
			set -e
			cat /tmp/_alembic_out2.txt
			if [ "${_stamp_retry_status}" != "0" ] && ! grep -qE "already exists|DuplicateTable|DuplicateColumn" /tmp/_alembic_out2.txt; then
				echo "[entrypoint] Migration still failing after stamp+retry — aborting"
				exit 1
			fi
			echo "[entrypoint] Schema is consistent after stamp — continuing"
		elif grep -qE "LockNotAvailable|lock timeout|canceling statement due to lock" /tmp/_alembic_out.txt; then
			# Retry up to 2 times with increasing delays to let the blocking
			# connection from the previous Render instance drain.
			_lock_retry=0
			_lock_ok=0
			for _wait in 30 60; do
				_lock_retry=$((_lock_retry + 1))
				echo "[entrypoint] Migration blocked by lock (attempt ${_lock_retry}) — sleeping ${_wait}s then retrying"
				sleep "${_wait}"
				set +e
				_run_alembic > /tmp/_alembic_out2.txt 2>&1
				_retry_status=$?
				set -e
				cat /tmp/_alembic_out2.txt
				if [ "${_retry_status}" = "0" ]; then
					_lock_ok=1
					break
				fi
				if ! grep -qE "LockNotAvailable|lock timeout|canceling statement due to lock" /tmp/_alembic_out2.txt; then
					# Different error — stop retrying
					break
				fi
				cp /tmp/_alembic_out2.txt /tmp/_alembic_out.txt
			done
			if [ "${_lock_ok}" != "1" ]; then
				echo "[entrypoint] Migration still failing after ${_lock_retry} lock-retries — aborting"
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
  --limit-concurrency 4 \
  --timeout-keep-alive 65 \
  --lifespan on
