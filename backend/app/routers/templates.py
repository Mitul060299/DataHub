from fastapi import APIRouter, HTTPException
from ..services.templates import list_templates
from ..models import DashboardTemplate

router = APIRouter(prefix="/templates", tags=["templates"])


@router.get("/dashboards", response_model=list[DashboardTemplate])
def dashboard_templates() -> list[DashboardTemplate]:
    return list_templates()


@router.post("/dashboards/{template_id}/instantiate", response_model=list[DashboardTemplate])
def instantiate_template(template_id: str):
    templates = list_templates()
    for template in templates:
        if template.template_id == template_id:
            return [template]
    raise HTTPException(status_code=404, detail="Template not found")
