from ..state import AgentState
from ...duckdb_service import DuckDBService
from ....db import SessionLocal
from ....models_db import ChatTemplateDB, DatasetMetaDB


def _load_available_templates(dataset_id: str) -> list[dict]:
    db = SessionLocal()
    try:
        dataset = db.query(DatasetMetaDB).filter(DatasetMetaDB.id == dataset_id).first()
        workspace_id = dataset.workspace_id if dataset and dataset.workspace_id else "default"
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
        return {"schema": {}, "stats": {}, "sample_rows": [], "available_templates": []}

    available_templates = _load_available_templates(dataset_id)

    if state.get("schema"):
        return {"available_templates": available_templates}

    try:
        return {
            "schema": DuckDBService.get_schema(dataset_id),
            "stats": DuckDBService.get_column_stats(dataset_id),
            "sample_rows": DuckDBService.get_sample_rows(dataset_id, limit=10),
            "available_templates": available_templates,
        }
    except Exception as exc:
        return {
            "schema": {},
            "stats": {},
            "sample_rows": [],
            "available_templates": available_templates,
            "error": str(exc),
        }
