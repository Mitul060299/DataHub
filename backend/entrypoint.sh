#!/usr/bin/env sh
set -e

if [ "${RUN_MIGRATIONS:-}" = "1" ]; then
	alembic upgrade head
fi

exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers ${UVICORN_WORKERS:-2}
