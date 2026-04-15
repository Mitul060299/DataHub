from fastapi import APIRouter, Depends, Header, HTTPException
import uuid
from sqlalchemy.orm import Session
from ..models import ApprovalRequestIn, ApprovalRequestOut
from ..models_db import ApprovalRequestDB
from ..db import get_db
from ..security import get_current_role, get_current_user_id, require_role
from ..services.audit import audit_store
from ..models import AuditEntry

router = APIRouter(prefix="/approvals", tags=["approvals"])


@router.post("/", response_model=ApprovalRequestOut)
def create_request(
    payload: ApprovalRequestIn,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> ApprovalRequestOut:
    role = get_current_role(authorization)
    require_role("editor", role)
    request_id = str(uuid.uuid4())
    request = ApprovalRequestDB(
        id=request_id,
        requester=payload.requester,
        resource_type=payload.resource_type,
        resource_id=payload.resource_id,
        summary=payload.summary,
        status="pending",
    )
    db.add(request)
    db.commit()
    db.refresh(request)
    audit_store.add(
        AuditEntry(
            action="approval.request.create",
            actor=authorization or "unknown",
            target=request_id,
            metadata={
                "resource_type": payload.resource_type,
                "resource_id": payload.resource_id,
                "requester": payload.requester,
            },
        )
    )
    return ApprovalRequestOut(
        request_id=request.id,
        requester=request.requester,
        resource_type=request.resource_type,
        resource_id=request.resource_id,
        summary=request.summary,
        status=request.status,
        created_at=str(request.created_at),
    )


@router.get("/", response_model=list[ApprovalRequestOut])
def list_requests(
    status: str | None = None,
    resource_type: str | None = None,
    resource_id: str | None = None,
    limit: int = 200,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> list[ApprovalRequestOut]:
    role = get_current_role(authorization)
    require_role("viewer", role)
    # Always scope to the authenticated user's own requests.
    requester = get_current_user_id(authorization)
    query = db.query(ApprovalRequestDB).filter(ApprovalRequestDB.requester == requester)
    if status:
        query = query.filter(ApprovalRequestDB.status == status)
    if resource_type:
        query = query.filter(ApprovalRequestDB.resource_type == resource_type)
    if resource_type:
        query = query.filter(ApprovalRequestDB.resource_type == resource_type)
    if resource_id:
        query = query.filter(ApprovalRequestDB.resource_id == resource_id)
    safe_limit = max(1, min(limit, 1000))
    rows = query.order_by(ApprovalRequestDB.created_at.desc()).limit(safe_limit).all()
    return [
        ApprovalRequestOut(
            request_id=row.id,
            requester=row.requester,
            resource_type=row.resource_type,
            resource_id=row.resource_id,
            summary=row.summary,
            status=row.status,
            created_at=str(row.created_at),
        )
        for row in rows
    ]


@router.post("/{request_id}/approve", response_model=ApprovalRequestOut)
def approve_request(
    request_id: str,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> ApprovalRequestOut:
    role = get_current_role(authorization)
    require_role("admin", role)
    request = db.query(ApprovalRequestDB).filter(ApprovalRequestDB.id == request_id).first()
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")
    request.status = "approved"
    db.commit()
    db.refresh(request)
    audit_store.add(
        AuditEntry(
            action="approval.request.approve",
            actor=authorization or "unknown",
            target=request_id,
            metadata={"status": request.status},
        )
    )
    return ApprovalRequestOut(
        request_id=request.id,
        requester=request.requester,
        resource_type=request.resource_type,
        resource_id=request.resource_id,
        summary=request.summary,
        status=request.status,
        created_at=str(request.created_at),
    )


@router.post("/{request_id}/reject", response_model=ApprovalRequestOut)
def reject_request(
    request_id: str,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> ApprovalRequestOut:
    role = get_current_role(authorization)
    require_role("admin", role)
    request = db.query(ApprovalRequestDB).filter(ApprovalRequestDB.id == request_id).first()
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")
    request.status = "rejected"
    db.commit()
    db.refresh(request)
    audit_store.add(
        AuditEntry(
            action="approval.request.reject",
            actor=authorization or "unknown",
            target=request_id,
            metadata={"status": request.status},
        )
    )
    return ApprovalRequestOut(
        request_id=request.id,
        requester=request.requester,
        resource_type=request.resource_type,
        resource_id=request.resource_id,
        summary=request.summary,
        status=request.status,
        created_at=str(request.created_at),
    )
