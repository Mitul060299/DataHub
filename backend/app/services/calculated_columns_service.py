from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any

import pandas as pd

from ..db import SessionLocal
from ..models import CalculatedColumnDB as CalculatedColumnOut
from ..models_db import CalculatedColumnDB, DatasetMetaDB
from .duckdb_service import DuckDBService


class CalculatedColumnsService:
    @staticmethod
    def _to_out(row: CalculatedColumnDB) -> CalculatedColumnOut:
        return CalculatedColumnOut(
            id=str(row.id),
            dataset_id=str(row.dataset_id),
            name=row.name,
            formula=row.formula,
            column_type=row.column_type,
            cached_value=row.cached_value,
            display_name=row.display_name,
            created_at=row.created_at.isoformat() if row.created_at else datetime.now(timezone.utc).isoformat(),
        )

    @classmethod
    def get_columns_for_dataset(cls, dataset_id: str) -> list[CalculatedColumnOut]:
        db = SessionLocal()
        try:
            rows = (
                db.query(CalculatedColumnDB)
                .filter(CalculatedColumnDB.dataset_id == dataset_id)
                .order_by(CalculatedColumnDB.created_at.asc())
                .all()
            )
            return [cls._to_out(row) for row in rows]
        finally:
            db.close()

    @staticmethod
    def _escape_identifier(name: str) -> str:
        return '"' + (name or "").replace('"', '""') + '"'

    @staticmethod
    def _to_sql_literal_from_cached(cached_value: str | None) -> str:
        if cached_value is None:
            return "NULL"
        try:
            value = json.loads(cached_value)
        except Exception:
            value = cached_value

        if value is None:
            return "NULL"
        if isinstance(value, bool):
            return "TRUE" if value else "FALSE"
        if isinstance(value, (int, float)):
            return str(value)

        text = str(value).replace("'", "''")
        return f"'{text}'"

    @classmethod
    def _validate_formula(cls, dataset_id: str, formula: str) -> Any:
        dataset, rows = DuckDBService._load_dataset_rows(dataset_id)
        if not dataset:
            raise ValueError("Dataset not found")

        connection = DuckDBService._ensure_db()
        frame = pd.DataFrame(rows or [])
        source_name = "calc_source"
        connection.register(source_name, frame)
        try:
            query = f"SELECT {formula} AS _value FROM {source_name} LIMIT 1"
            result = connection.execute(query).fetchone()
            return result[0] if result else None
        except Exception as exc:
            raise ValueError(str(exc)) from exc
        finally:
            try:
                connection.unregister(source_name)
            except Exception:
                pass

    @classmethod
    def create_column(
        cls,
        dataset_id: str,
        name: str,
        formula: str,
        column_type: str,
        display_name: str | None,
    ) -> CalculatedColumnOut:
        normalized_type = (column_type or "dynamic").strip().lower()
        if normalized_type not in {"static", "dynamic"}:
            raise ValueError("column_type must be 'static' or 'dynamic'")

        clean_name = (name or "").strip()
        clean_formula = (formula or "").strip()
        if not clean_name:
            raise ValueError("Column name is required")
        if not clean_formula:
            raise ValueError("Formula is required")

        evaluated = cls._validate_formula(dataset_id, clean_formula)
        cached_value = json.dumps(evaluated) if normalized_type == "static" else None

        db = SessionLocal()
        try:
            dataset = db.query(DatasetMetaDB).filter(DatasetMetaDB.id == dataset_id).first()
            if not dataset:
                raise ValueError("Dataset not found")

            existing = (
                db.query(CalculatedColumnDB)
                .filter(CalculatedColumnDB.dataset_id == dataset_id)
                .filter(CalculatedColumnDB.name == clean_name)
                .first()
            )
            if existing:
                raise ValueError(f"Calculated column already exists: {clean_name}")

            row = CalculatedColumnDB(
                id=str(uuid.uuid4()),
                dataset_id=dataset_id,
                name=clean_name,
                formula=clean_formula,
                column_type=normalized_type,
                cached_value=cached_value,
                display_name=display_name,
            )
            db.add(row)
            db.commit()
            db.refresh(row)
            return cls._to_out(row)
        finally:
            db.close()

    @classmethod
    def delete_column(cls, column_id: str) -> bool:
        db = SessionLocal()
        try:
            row = db.query(CalculatedColumnDB).filter(CalculatedColumnDB.id == column_id).first()
            if not row:
                return False
            db.delete(row)
            db.commit()
            return True
        finally:
            db.close()

    @classmethod
    def inject_calculated_columns(cls, base_sql: str, dataset_id: str) -> str:
        if not dataset_id or not (base_sql or "").strip():
            return base_sql

        columns = cls.get_columns_for_dataset(dataset_id)
        if not columns:
            return base_sql

        projected: list[str] = []
        for column in columns:
            target = cls._escape_identifier(column.name)
            if (column.column_type or "").lower() == "static":
                expr = cls._to_sql_literal_from_cached(column.cached_value)
            else:
                expr = column.formula
            projected.append(f"{expr} AS {target}")

        additions = ", ".join(projected)
        return f"SELECT _base.*, {additions} FROM ({base_sql}) AS _base"
