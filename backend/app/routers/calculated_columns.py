from __future__ import annotations

from fastapi import APIRouter, Header, HTTPException

from ..models import CalculatedColumnCreate, CalculatedColumnDB
from ..security import get_current_role, require_role
from ..services.calculated_columns_service import CalculatedColumnsService

router = APIRouter(prefix="/datasets", tags=["calculated-columns"])


@router.get("/{dataset_id}/columns", response_model=list[CalculatedColumnDB])
def list_columns(
    dataset_id: str,
    authorization: str | None = Header(default=None),
) -> list[CalculatedColumnDB]:
    role = get_current_role(authorization)
    require_role("viewer", role)
    return CalculatedColumnsService.get_columns_for_dataset(dataset_id)


@router.post("/{dataset_id}/columns", response_model=CalculatedColumnDB)
def create_column(
    dataset_id: str,
    payload: CalculatedColumnCreate,
    authorization: str | None = Header(default=None),
) -> CalculatedColumnDB:
    role = get_current_role(authorization)
    require_role("editor", role)
    try:
        return CalculatedColumnsService.create_column(
            dataset_id=dataset_id,
            name=payload.name,
            formula=payload.formula,
            column_type=payload.column_type,
            display_name=payload.display_name,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/{dataset_id}/columns/{column_id}")
def delete_column(
    dataset_id: str,
    column_id: str,
    authorization: str | None = Header(default=None),
) -> dict[str, bool | str]:
    _ = dataset_id
    role = get_current_role(authorization)
    require_role("editor", role)
    deleted = CalculatedColumnsService.delete_column(column_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Calculated column not found")
    return {"success": True, "column_id": column_id}
