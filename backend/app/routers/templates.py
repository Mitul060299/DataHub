from fastapi import APIRouter, HTTPException, Header
from ..services.templates import list_templates
from ..models import DashboardTemplate
from ..security import get_current_role, require_role

router = APIRouter(prefix="/templates", tags=["templates"])


@router.get("/dashboards", response_model=list[DashboardTemplate])
def dashboard_templates(authorization: str | None = Header(default=None)) -> list[DashboardTemplate]:
    role = get_current_role(authorization)
    require_role("viewer", role)
    return list_templates()


@router.post("/dashboards/{template_id}/instantiate", response_model=list[DashboardTemplate])
def instantiate_template(template_id: str, authorization: str | None = Header(default=None)):
    role = get_current_role(authorization)
    require_role("viewer", role)
    templates = list_templates()
    for template in templates:
        if template.template_id == template_id:
            return [template]
    raise HTTPException(status_code=404, detail="Template not found")
