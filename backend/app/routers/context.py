from fastapi import APIRouter, HTTPException, Header, Depends
import uuid
from sqlalchemy.orm import Session
from ..models import ContextPayload, ContextVersionOut
from ..services.context_store import context_store
from ..security import get_current_role, require_role
from ..db import get_db
from ..models_db import Context, ContextVersion

router = APIRouter(prefix="/context", tags=["context"])


@router.get("/{project_id}", response_model=ContextPayload)
def get_context(project_id: str, db: Session = Depends(get_db)) -> ContextPayload:
    db_context = db.query(Context).filter(Context.workspace_id == project_id).first()
    if db_context:
        return ContextPayload(
            project_id=project_id,
            glossary=db_context.glossary or {},
            rules=db_context.rules or [],
        )
    payload = context_store.get(project_id)
    if not payload:
        raise HTTPException(status_code=404, detail="Context not found")
    return payload


@router.post("/")
def upsert_context(
    payload: ContextPayload,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    role = get_current_role(authorization)
    require_role("editor", role)
    db_context = db.query(Context).filter(Context.workspace_id == payload.project_id).first()
    if db_context:
        db_context.glossary = payload.glossary
        db_context.rules = [rule.model_dump() for rule in payload.rules]
    else:
        db.add(
            Context(
                id=payload.project_id,
                workspace_id=payload.project_id,
                glossary=payload.glossary,
                rules=[rule.model_dump() for rule in payload.rules],
            )
        )
    db.add(
        ContextVersion(
            id=str(uuid.uuid4()),
            workspace_id=payload.project_id,
            glossary=payload.glossary,
            rules=[rule.model_dump() for rule in payload.rules],
        )
    )
    db.commit()
    context_store.upsert(payload)
    return {"status": "saved", "project_id": payload.project_id}


@router.get("/{project_id}/versions", response_model=list[ContextVersionOut])
def list_versions(project_id: str, db: Session = Depends(get_db)) -> list[ContextVersionOut]:
    versions = (
        db.query(ContextVersion)
        .filter(ContextVersion.workspace_id == project_id)
        .order_by(ContextVersion.created_at.desc())
        .all()
    )
    return [
        ContextVersionOut(
            version_id=version.id,
            project_id=version.workspace_id,
            glossary=version.glossary or {},
            rules=version.rules or [],
            created_at=str(version.created_at),
        )
        for version in versions
    ]


@router.post("/{project_id}/revert/{version_id}", response_model=ContextPayload)
def revert_context(
    project_id: str,
    version_id: str,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> ContextPayload:
    role = get_current_role(authorization)
    require_role("editor", role)

    version = (
        db.query(ContextVersion)
        .filter(ContextVersion.workspace_id == project_id)
        .filter(ContextVersion.id == version_id)
        .first()
    )
    if not version:
        raise HTTPException(status_code=404, detail="Context version not found")

    db_context = db.query(Context).filter(Context.workspace_id == project_id).first()
    if db_context:
        db_context.glossary = version.glossary
        db_context.rules = version.rules
    else:
        db.add(
            Context(
                id=project_id,
                workspace_id=project_id,
                glossary=version.glossary,
                rules=version.rules,
            )
        )
    db.add(
        ContextVersion(
            id=str(uuid.uuid4()),
            workspace_id=project_id,
            glossary=version.glossary,
            rules=version.rules,
        )
    )
    db.commit()

    payload = ContextPayload(
        project_id=project_id,
        glossary=version.glossary or {},
        rules=[rule for rule in (version.rules or [])],
    )
    context_store.upsert(payload)
    return payload
