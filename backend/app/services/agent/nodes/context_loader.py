from ..state import AgentState
from ...duckdb_service import DuckDBService
from ...calculated_columns_service import CalculatedColumnsService
from ...dashboards_v2_service import DashboardsV2Service
from ....db import SessionLocal
from ....models_db import ChatTemplateDB, DatasetMetaDB
import re as _re


def _sanitize_alias(name: str) -> str:
    s = _re.sub(r"[^A-Za-z0-9_]", "_", name.strip()).lower()
    s = _re.sub(r"_+", "_", s).strip("_")
    if not s or s[0].isdigit():
        s = "ds_" + s
    return s or "dataset_extra"


def _load_available_templates(dataset_id: str, fallback_workspace_id: str | None = None) -> list[dict]:
    db = SessionLocal()
    try:
        dataset = db.query(DatasetMetaDB).filter(DatasetMetaDB.id == dataset_id).first()
        workspace_id = dataset.workspace_id if dataset and dataset.workspace_id else (fallback_workspace_id or "default")
        templates = (
            db.query(ChatTemplateDB)
            .filter(ChatTemplateDB.workspace_id == workspace_id)
            .order_by(ChatTemplateDB.updated_at.desc())
            .limit(5)
            .all()
        )
        return [
            {
                "id": str(template.id),
                "name": template.name,
                "description": template.description,
                "step_count": len(template.execution_flow or []) if isinstance(template.execution_flow, list) else 0,
            }
            for template in templates
        ]
    finally:
        db.close()


async def context_loader(state: AgentState) -> dict:
    dataset_id = state.get("dataset_id")
    if not dataset_id:
        return {"schema": {}, "stats": {}, "sample_rows": [], "available_templates": [], "calculated_columns": [], "dashboards": []}

    db = SessionLocal()
    try:
        dataset = db.query(DatasetMetaDB).filter(DatasetMetaDB.id == dataset_id).first()
    finally:
        db.close()

    user_id = state.get("user_id") or (dataset.user_id if dataset and dataset.user_id else "agent")
    workspace_id = state.get("workspace_id") or (dataset.workspace_id if dataset and dataset.workspace_id else "default")

    available_templates = _load_available_templates(dataset_id, workspace_id)
    calculated_columns = [column.model_dump() for column in CalculatedColumnsService.get_columns_for_dataset(dataset_id)]
    dashboards = [
        {
            "id": dashboard.id,
            "name": dashboard.name,
            "workspace_id": dashboard.workspace_id,
            "tile_count": len(dashboard.tiles),
        }
        for dashboard in DashboardsV2Service.list_dashboards(user_id=user_id, workspace_id=workspace_id)
    ]

    if state.get("schema"):
        return {
            "available_templates": available_templates,
            "calculated_columns": calculated_columns,
            "dashboards": dashboards,
        }

    # Load secondary dataset schemas so the planner can generate cross-dataset SQL
    secondary_schemas: dict = {}
    secondary_ids: list[str] = list(state.get("secondary_dataset_ids") or [])
    if secondary_ids:
        sec_db = SessionLocal()
        try:
            for sec_id in secondary_ids:
                sec_meta = sec_db.query(DatasetMetaDB).filter(DatasetMetaDB.id == sec_id).first()
                if sec_meta:
                    alias = _sanitize_alias(str(sec_meta.name or sec_id))
                    try:
                        secondary_schemas[alias] = {
                            "dataset_id": sec_id,
                            "columns": list(sec_meta.columns or []),
                            "row_count": int(sec_meta.row_count or 0),
                            "schema": DuckDBService.get_schema(sec_id),
                        }
                    except Exception:
                        secondary_schemas[alias] = {
                            "dataset_id": sec_id,
                            "columns": list(sec_meta.columns or []),
                            "row_count": int(sec_meta.row_count or 0),
                            "schema": {},
                        }
        finally:
            sec_db.close()

    try:
        base = {
            "schema": DuckDBService.get_schema(dataset_id),
            "stats": DuckDBService.get_column_stats(dataset_id),
            "sample_rows": DuckDBService.get_sample_rows(dataset_id, limit=10),
            "available_templates": available_templates,
            "calculated_columns": calculated_columns,
            "dashboards": dashboards,
        }
        if secondary_schemas:
            base["secondary_schemas"] = secondary_schemas
        return base
    except Exception as exc:
        base_err: dict = {
            "schema": {},
            "stats": {},
            "sample_rows": [],
            "available_templates": available_templates,
            "calculated_columns": calculated_columns,
            "dashboards": dashboards,
            "error": str(exc),
        }
        if secondary_schemas:
            base_err["secondary_schemas"] = secondary_schemas
        return base_err
