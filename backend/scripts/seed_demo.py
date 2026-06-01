"""seed_demo.py
==============
One-time script to create the shared public demo project used by
unauthenticated visitors on the workspace page.

After running this script, copy the printed DEMO_PROJECT_ID and
DEMO_DATASET_ID values into your environment variables (Render, .env, etc.)
and redeploy.

Usage (run from the backend/ directory):
    DATABASE_URL=<your-db-url> python scripts/seed_demo.py [--csv path/to/sales.csv]

Arguments:
    --csv <path>      Path to the sales CSV file to upload as the demo dataset.
                      Defaults to ../samples/customers.csv if not provided.
    --force           Re-create the demo project even if DEMO_PROJECT_ID already
                      exists in the environment (will delete the old one first).

Requirements:
    pip install sqlalchemy psycopg pandas pyarrow python-dotenv
"""

import argparse
import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

# Allow running from the backend/ directory without installing the package.
sys.path.insert(0, str(Path(__file__).parent.parent))

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent.parent / ".env")
except ImportError:
    pass  # dotenv optional

import pandas as pd

# ── Database connection ───────────────────────────────────────────────────────

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg://datahub:datahub@localhost:5432/datahub",
)

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)

# ── Demo project constants ────────────────────────────────────────────────────

DEMO_SYSTEM_USER_ID = "demo-system-user"
DEMO_PROJECT_NAME = "Demo"
DEMO_PROJECT_COLOUR = "#5b6af0"
DEMO_PROJECT_ICON = "📊"
DEMO_PROJECT_DESCRIPTION = (
    "12,575 retail store transactions — categories, items, payment methods, "
    "locations and spend. Sign in to upload your own data and use AI."
)
DEMO_DATASET_NAME = "Demo Data"

# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_csv_path(cli_path: str | None) -> Path:
    if cli_path:
        p = Path(cli_path)
        if not p.exists():
            print(f"[error] CSV file not found: {p}")
            sys.exit(1)
        return p
    # Default: frontend/public/samples/retail_store_sales.csv (12k-row retail store dataset)
    default = Path(__file__).parent.parent.parent / "frontend" / "public" / "samples" / "retail_store_sales.csv"
    if default.exists():
        return default
    # Second fallback: the smaller sales_sample.csv
    fallback2 = Path(__file__).parent.parent.parent / "frontend" / "public" / "samples" / "sales_sample.csv"
    if fallback2.exists():
        print("[warn] retail_store_sales.csv not found, falling back to sales_sample.csv")
        return fallback2
    # Third fallback: samples/customers.csv at repo root
    fallback = Path(__file__).parent.parent.parent / "samples" / "customers.csv"
    if fallback.exists():
        print("[warn] retail_store_sales.csv not found, falling back to customers.csv")
        return fallback
    print("[error] No CSV file found. Pass --csv <path>")
    sys.exit(1)


def _load_csv(path: Path) -> pd.DataFrame:
    print(f"[info] Loading CSV: {path}")
    df = pd.read_csv(path)
    print(f"[info] Rows: {len(df):,}, Columns: {list(df.columns)}")
    return df


def _save_parquet(df: pd.DataFrame, project_id: str, dataset_id: str) -> str | None:
    """Write DataFrame to local Parquet. Returns local path (S3/R2 upload is
    separate and only needed for production deployments). Returns None if
    pyarrow is not installed."""
    try:
        import pyarrow  # noqa: F401
        out_dir = Path(__file__).parent.parent / "data" / "parquet"
        out_dir.mkdir(parents=True, exist_ok=True)
        parquet_path = out_dir / f"{dataset_id}.parquet"
        df.to_parquet(parquet_path, index=False)
        print(f"[info] Parquet written: {parquet_path}")
        return str(parquet_path)
    except ImportError:
        print("[warn] pyarrow not installed — skipping local Parquet write")
        return None


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Seed the shared public demo project")
    parser.add_argument("--csv", help="Path to the sales CSV file")
    parser.add_argument(
        "--force",
        action="store_true",
        help="Delete and recreate the existing demo project",
    )
    args = parser.parse_args()

    csv_path = _get_csv_path(args.csv)
    df = _load_csv(csv_path)

    db = SessionLocal()
    try:
        # Import models inside function to avoid import-time engine binding issues
        from app.models_db import DatasetMetaDB, ProjectDB

        existing_id = os.getenv("DEMO_PROJECT_ID", "").strip()

        if existing_id and not args.force:
            existing = db.query(ProjectDB).filter(ProjectDB.id == existing_id).first()
            if existing:
                print(f"[info] Demo project already exists: {existing_id}")
                print("[info] Pass --force to recreate it.")
                _print_env_instructions(existing_id, os.getenv("DEMO_DATASET_ID", ""))
                return

        if existing_id and args.force:
            print(f"[info] --force: deleting existing demo project {existing_id}")
            db.query(ProjectDB).filter(ProjectDB.id == existing_id).delete()
            db.commit()

        # Create demo project
        project_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        project = ProjectDB(
            id=project_id,
            user_id=DEMO_SYSTEM_USER_ID,
            name=DEMO_PROJECT_NAME,
            colour=DEMO_PROJECT_COLOUR,
            icon=DEMO_PROJECT_ICON,
            description=DEMO_PROJECT_DESCRIPTION,
            is_quickstart=False,
            created_at=now,
            updated_at=now,
        )
        db.add(project)
        db.commit()
        print(f"[ok] Created project: {project_id}")

        # Create dataset metadata
        dataset_id = str(uuid.uuid4())
        columns = list(df.columns)
        row_count = len(df)

        # Try saving Parquet locally for DuckDB fast path
        parquet_path = _save_parquet(df, project_id, dataset_id)

        dataset = DatasetMetaDB(
            id=dataset_id,
            user_id=DEMO_SYSTEM_USER_ID,
            project_id=project_id,
            name=DEMO_DATASET_NAME,
            file_format="csv",
            columns=columns,
            row_count=row_count,
            storage_path=parquet_path,
            import_mode="cached",
            status="ready",
            created_at=now,
        )
        db.add(dataset)
        db.commit()
        print(f"[ok] Created dataset: {dataset_id}  ({row_count:,} rows, {len(columns)} columns)")

        # Store CSV chunks in DB for fallback preview (optional)
        _store_chunks(db, df, dataset_id)

        _print_env_instructions(project_id, dataset_id)

    finally:
        db.close()


def _store_chunks(db, df: pd.DataFrame, dataset_id: str) -> None:
    """Store CSV data as DatasetChunkDB rows so the DB fallback preview works
    even without S3/Parquet. Stores rows in chunks of 500."""
    try:
        from app.models_db import DatasetChunkDB
        chunk_size = 500
        all_rows = df.to_dict(orient="records")
        for chunk_index, start in enumerate(range(0, len(all_rows), chunk_size)):
            batch = all_rows[start : start + chunk_size]
            chunk = DatasetChunkDB(
                id=str(uuid.uuid4()),
                dataset_id=dataset_id,
                chunk_index=chunk_index,
                rows=batch,
            )
            db.add(chunk)
        db.commit()
        print(f"[ok] Stored {len(all_rows):,} rows in {chunk_index + 1} DB chunk(s)")
    except Exception as exc:
        print(f"[warn] Could not store DB chunks: {exc}")
        db.rollback()


def _print_env_instructions(project_id: str, dataset_id: str) -> None:
    print()
    print("=" * 60)
    print("Add these environment variables to your deployment:")
    print()
    print(f"  DEMO_PROJECT_ID={project_id}")
    print(f"  DEMO_DATASET_ID={dataset_id}")
    print()
    print("Then redeploy the backend.")
    print("=" * 60)


if __name__ == "__main__":
    main()
