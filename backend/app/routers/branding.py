"""branding.py — White-label branding API.

Endpoints
---------
GET    /organization/branding          public endpoint returning branding for the caller's org
PUT    /organization/branding          owner-only: create or update branding settings
DELETE /organization/branding          owner-only: reset branding to DataHub defaults

Design
------
- Each organization has at most one branding row (``organization_branding``).
- PUT is idempotent — creates a row if none exists, patches it otherwise.
- Fields that are omitted from a PUT payload are left unchanged.
- ``hide_datahub_branding`` requires Business/Enterprise plan.
- ``custom_css`` requires Enterprise plan.
- GET is authenticated but does NOT require owner role — any org member may
  fetch branding so the frontend can apply the theme on login.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..db import get_db
from ..models_db import OrganizationDB, OrganizationBrandingDB
from ..security import get_current_subject, get_current_user_id
from ..services.plan_guard import resolve_user_plan

router = APIRouter(prefix="/organization/branding", tags=["branding"])
logger = logging.getLogger(__name__)

_HIDE_BRANDING_PLANS = {"Business", "Enterprise"}
_CUSTOM_CSS_PLANS = {"Enterprise"}


class BrandingPayload(BaseModel):
    product_name: str | None = None
    logo_url: str | None = None
    favicon_url: str | None = None
    primary_color: str | None = None
    support_email: str | None = None
    hide_datahub_branding: bool | None = None
    custom_css: str | None = None


def _get_org_for_user(user_id: str, db: Session) -> OrganizationDB | None:
    return db.query(OrganizationDB).filter(OrganizationDB.owner_user_id == user_id).first()


def _branding_dict(b: OrganizationBrandingDB) -> dict[str, Any]:
    return {
        "product_name": b.product_name,
        "logo_url": b.logo_url,
        "favicon_url": b.favicon_url,
        "primary_color": b.primary_color,
        "support_email": b.support_email,
        "hide_datahub_branding": b.hide_datahub_branding,
        "custom_css": b.custom_css,
    }


@router.get("")
def get_branding(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    """Return current branding settings for the caller's organization.

    Returns default (all-null) object when the org has no branding configured.
    """
    subject = get_current_subject(authorization)
    if not subject:
        raise HTTPException(status_code=401, detail="Unauthorized")

    user_id = get_current_user_id(authorization) or ""
    org = _get_org_for_user(user_id, db)
    if not org:
        return {"product_name": None, "logo_url": None, "favicon_url": None,
                "primary_color": None, "support_email": None,
                "hide_datahub_branding": False, "custom_css": None}

    branding = db.query(OrganizationBrandingDB).filter(
        OrganizationBrandingDB.org_id == org.id
    ).first()
    if not branding:
        return {"product_name": None, "logo_url": None, "favicon_url": None,
                "primary_color": None, "support_email": None,
                "hide_datahub_branding": False, "custom_css": None}

    return _branding_dict(branding)


@router.put("")
def upsert_branding(
    payload: BrandingPayload,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    """Create or update the branding settings for the caller's organization.

    Requires org owner. Fields not included in the payload are unchanged.
    ``hide_datahub_branding`` requires Business/Enterprise plan.
    ``custom_css`` requires Enterprise plan.
    """
    subject = get_current_subject(authorization)
    if not subject:
        raise HTTPException(status_code=401, detail="Unauthorized")

    user_id = get_current_user_id(authorization) or ""
    plan = resolve_user_plan(db, authorization)

    org = _get_org_for_user(user_id, db)
    if not org:
        raise HTTPException(status_code=404, detail="No organization found for this account")

    # Plan gating
    if payload.hide_datahub_branding and plan not in _HIDE_BRANDING_PLANS:
        raise HTTPException(
            status_code=402,
            detail="Hiding DataHub branding requires Business or Enterprise plan",
        )
    if payload.custom_css is not None and plan not in _CUSTOM_CSS_PLANS:
        raise HTTPException(
            status_code=402,
            detail="Custom CSS injection requires Enterprise plan",
        )

    # Validate hex color
    if payload.primary_color is not None:
        color = payload.primary_color.strip()
        if color and not (color.startswith("#") and len(color) in (4, 7)):
            raise HTTPException(status_code=400, detail="primary_color must be a hex color e.g. #1A73E8")
        payload.primary_color = color or None

    branding = db.query(OrganizationBrandingDB).filter(
        OrganizationBrandingDB.org_id == org.id
    ).first()

    if not branding:
        branding = OrganizationBrandingDB(org_id=org.id)
        db.add(branding)

    # Patch only provided fields
    if payload.product_name is not None:
        branding.product_name = payload.product_name or None
    if payload.logo_url is not None:
        branding.logo_url = payload.logo_url or None
    if payload.favicon_url is not None:
        branding.favicon_url = payload.favicon_url or None
    if payload.primary_color is not None:
        branding.primary_color = payload.primary_color or None
    if payload.support_email is not None:
        branding.support_email = payload.support_email or None
    if payload.hide_datahub_branding is not None:
        branding.hide_datahub_branding = payload.hide_datahub_branding
    if payload.custom_css is not None:
        branding.custom_css = payload.custom_css or None

    db.commit()
    db.refresh(branding)
    return _branding_dict(branding)


@router.delete("", status_code=204, response_class=Response)
def reset_branding(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> Response:
    """Delete branding settings, reverting to DataHub defaults.

    Requires org owner.
    """
    subject = get_current_subject(authorization)
    if not subject:
        raise HTTPException(status_code=401, detail="Unauthorized")

    user_id = get_current_user_id(authorization) or ""
    org = _get_org_for_user(user_id, db)
    if not org:
        return Response(status_code=204)

    branding = db.query(OrganizationBrandingDB).filter(
        OrganizationBrandingDB.org_id == org.id
    ).first()
    if branding:
        db.delete(branding)
        db.commit()
    return Response(status_code=204)
