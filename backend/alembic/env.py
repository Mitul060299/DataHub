from logging.config import fileConfig
from sqlalchemy import engine_from_config
from sqlalchemy import pool
from sqlalchemy import text
from alembic import context
import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(__file__)))

from app.db import Base
from app import models_db

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def get_url() -> str:
    return os.getenv("DATABASE_URL", "postgresql+psycopg://datahub:datahub@localhost:5432/datahub")


def _env_timeout_ms(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None:
        return default
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    return max(0, parsed)


def run_migrations_offline() -> None:
    url = get_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        {"sqlalchemy.url": get_url()},
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        if connection.dialect.name == "postgresql":
            lock_timeout_ms = _env_timeout_ms("ALEMBIC_LOCK_TIMEOUT_MS", 15000)
            statement_timeout_ms = _env_timeout_ms("ALEMBIC_STATEMENT_TIMEOUT_MS", 300000)
            connection.execute(text(f"SET lock_timeout = '{lock_timeout_ms}ms'"))
            connection.execute(text(f"SET statement_timeout = '{statement_timeout_ms}ms'"))

        version_len = connection.execute(
            text(
                """
                SELECT character_maximum_length
                FROM information_schema.columns
                WHERE table_schema = current_schema()
                  AND table_name = 'alembic_version'
                  AND column_name = 'version_num'
                """
            )
        ).scalar_one_or_none()

        if isinstance(version_len, int) and version_len < 255:
            connection.execute(
                text("ALTER TABLE alembic_version ALTER COLUMN version_num TYPE VARCHAR(255)")
            )

        context.configure(connection=connection, target_metadata=target_metadata)

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
