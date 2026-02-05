from fastapi import APIRouter, HTTPException, Header, Depends
from sqlalchemy.orm import Session
from ..models import TransformationRecipe, DatasetPreview, RecipeVersionOut
from ..services.recipes import recipe_store
from ..services.transformer import apply_steps
from .datasets import get_dataset, get_dataset_from_db, save_dataset
from ..security import get_current_role, require_role
from ..db import get_db
from ..services.audit import audit_store
from ..models import AuditEntry

router = APIRouter(prefix="/transformations", tags=["transformations"])


@router.post("/recipes")
def save_recipe(recipe: TransformationRecipe, authorization: str | None = Header(default=None)) -> dict:
    role = get_current_role(authorization)
    require_role("editor", role)
    recipe_store.save(recipe)
    audit_store.add(
        AuditEntry(
            action="recipe.save",
            actor=authorization or "unknown",
            target=recipe.dataset_id,
            metadata={"steps": len(recipe.steps)},
        )
    )
    return {"status": "saved", "dataset_id": recipe.dataset_id}


@router.get("/recipes/{dataset_id}", response_model=TransformationRecipe)
def get_recipe(dataset_id: str) -> TransformationRecipe:
    recipe = recipe_store.get(dataset_id)
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")
    return recipe


@router.get("/recipes/{dataset_id}/versions", response_model=list[RecipeVersionOut])
def list_recipe_versions(dataset_id: str) -> list[RecipeVersionOut]:
    versions = recipe_store.history(dataset_id)
    return [
        RecipeVersionOut(
            version_id=v.version_id,
            dataset_id=v.dataset_id,
            steps=v.steps,
            notes=v.notes,
            created_at=v.created_at,
        )
        for v in versions
    ]


@router.post("/recipes/{dataset_id}/revert/{version_id}", response_model=TransformationRecipe)
def revert_recipe(
    dataset_id: str,
    version_id: str,
    authorization: str | None = Header(default=None),
) -> TransformationRecipe:
    role = get_current_role(authorization)
    require_role("editor", role)
    recipe = recipe_store.revert(dataset_id, version_id)
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe version not found")
    audit_store.add(
        AuditEntry(
            action="recipe.revert",
            actor=authorization or "unknown",
            target=dataset_id,
            metadata={"version_id": version_id, "steps": len(recipe.steps)},
        )
    )
    return recipe


@router.post("/apply/{dataset_id}", response_model=DatasetPreview)
def apply_recipe(
    dataset_id: str,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> DatasetPreview:
    role = get_current_role(authorization)
    require_role("editor", role)
    try:
        df = get_dataset(dataset_id)
    except KeyError:
        try:
            df = get_dataset_from_db(dataset_id, db)
        except KeyError:
            raise HTTPException(status_code=404, detail="Dataset not found")

    recipe = recipe_store.get(dataset_id)
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")

    transformed = apply_steps(df, recipe.steps)
    new_id = save_dataset(transformed, db, parent_id=dataset_id)
    preview = DatasetPreview(
        dataset_id=new_id,
        columns=list(transformed.columns),
        row_count=int(transformed.shape[0]),
        sample_rows=transformed.head(10).to_dict(orient="records"),
        parent_id=dataset_id,
    )
    audit_store.add(
        AuditEntry(
            action="recipe.apply",
            actor=authorization or "unknown",
            target=dataset_id,
            metadata={"new_dataset_id": new_id, "steps": len(recipe.steps)},
        )
    )
    try:
        from ..services.events import emit_event

        emit_event("recipe.applied", preview.model_dump())
    except Exception:
        pass

    return preview
