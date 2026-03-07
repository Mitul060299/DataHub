from __future__ import annotations

import sqlite3
import uuid
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "pricing_live.db"


def _exec_many(cursor: sqlite3.Cursor, statements: list[str]) -> None:
    for statement in statements:
        cursor.execute(statement)


def main() -> int:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    _exec_many(
        cur,
        [
            "DROP TABLE IF EXISTS users",
            "DROP TABLE IF EXISTS webhooks",
            "DROP TABLE IF EXISTS scheduled_jobs",
            "DROP TABLE IF EXISTS pipelines",
            "DROP TABLE IF EXISTS workspaces",
            "DROP TABLE IF EXISTS dashboards_v2",
            "DROP TABLE IF EXISTS dataset_meta",
        ],
    )

    _exec_many(
        cur,
        [
            """
            CREATE TABLE users (
                id TEXT PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                role TEXT NOT NULL,
                plan TEXT NOT NULL
            )
            """,
            """
            CREATE TABLE webhooks (
                id TEXT PRIMARY KEY,
                target_url TEXT NOT NULL,
                event TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
            """,
            """
            CREATE TABLE scheduled_jobs (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                cron TEXT NOT NULL,
                action TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'scheduled',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
            """,
            """
            CREATE TABLE pipelines (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                cadence TEXT NOT NULL,
                time_of_day TEXT,
                day_of_week INTEGER,
                day_of_month INTEGER,
                dataset_id TEXT,
                connector TEXT,
                connector_config TEXT,
                apply_recipe INTEGER NOT NULL DEFAULT 0,
                run_profile INTEGER NOT NULL DEFAULT 1,
                run_insights INTEGER NOT NULL DEFAULT 1,
                enabled INTEGER NOT NULL DEFAULT 1,
                last_run_at TEXT,
                next_run_at TEXT,
                last_run_metadata TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
            """,
            """
            CREATE TABLE workspaces (
                id TEXT PRIMARY KEY,
                name TEXT UNIQUE NOT NULL,
                is_shared INTEGER NOT NULL DEFAULT 0,
                share_token TEXT,
                share_expires_at TEXT,
                share_scope TEXT
            )
            """,
            """
            CREATE TABLE dashboards_v2 (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                workspace_id TEXT NOT NULL DEFAULT 'default',
                dataset_id TEXT,
                name TEXT NOT NULL,
                description TEXT,
                layout TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
            """,
            """
            CREATE TABLE dataset_meta (
                id TEXT PRIMARY KEY,
                user_id TEXT,
                workspace_id TEXT NOT NULL DEFAULT 'default',
                name TEXT,
                description TEXT,
                source_type TEXT,
                storage_provider TEXT,
                storage_path TEXT,
                file_format TEXT,
                schema_json TEXT,
                stats_json TEXT,
                columns TEXT,
                row_count INTEGER NOT NULL DEFAULT 0,
                status TEXT,
                error_message TEXT,
                last_queried_at TEXT,
                query_count INTEGER,
                access_tier TEXT,
                parent_id TEXT,
                file_size_bytes INTEGER,
                compressed_size_bytes INTEGER,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
            """,
        ],
    )

    seeded_users = [
        (str(uuid.uuid4()), "qa.free@datahub.local", "editor", "Free"),
        (str(uuid.uuid4()), "qa.professional@datahub.local", "editor", "Professional"),
        (str(uuid.uuid4()), "qa.team@datahub.local", "editor", "Team"),
        (str(uuid.uuid4()), "qa.business@datahub.local", "editor", "Business"),
        (str(uuid.uuid4()), "qa.enterprise@datahub.local", "editor", "Enterprise"),
    ]

    cur.executemany(
        "INSERT INTO users (id, username, role, plan) VALUES (?, ?, ?, ?)",
        seeded_users,
    )

    cur.execute(
        "INSERT INTO workspaces (id, name, is_shared) VALUES (?, ?, ?)",
        ("ws-live", "Live QA Workspace", 0),
    )

    conn.commit()
    conn.close()

    print(f"Seeded live matrix DB at: {DB_PATH}")
    print("Users:")
    for _, username, _, plan in seeded_users:
        print(f"- {username} ({plan})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
