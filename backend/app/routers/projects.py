"""
projects.py
===========
CRUD endpoints for user-scoped projects, plus a workspace-recent feed.

All endpoints are protected by get_current_user and filter by user_id —
consistent with every other router in the codebase (no Postgres RLS).
"""

import uuid
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func, text as _sql_text
from sqlalchemy.orm import Session

from ..db import get_db
from ..dependencies import CurrentUser, get_current_user
from ..models import (
    ProjectCreate,
    ProjectDetailOut,
    ProjectDashboardOut,
    ProjectOut,
    ProjectPipelineOut,
    ProjectSourceOut,
    ProjectUpdate,
    WorkspaceRecentOut,
    RecentDashboardRow,
    RecentPipelineRow,
)
from ..models_db import (
    DashboardTileDB,
    DashboardV2DB,
    DataSourceDB,
    DatasetMetaDB,
    PipelineRunV2DB,
    PipelineScheduleDB,
    PipelineV2DB,
    ProjectDB,
)
from ..services.workspace_access import get_visible_user_ids
from ..services.plan_guard import resolve_workspace_plan, enforce_project_limit

router = APIRouter(prefix="/projects", tags=["projects"])
recent_router = APIRouter(prefix="/workspace", tags=["workspace"])


# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────

def _fmt(dt: datetime | None) -> str | None:
    return dt.isoformat() if dt else None


def _project_out(project: ProjectDB, db: Session) -> ProjectOut:
    pipeline_count = (
        db.query(func.count(PipelineV2DB.id))
        .filter(PipelineV2DB.project_id == project.id)
        .scalar()
    ) or 0
    dashboard_count = (
        db.query(func.count(DashboardV2DB.id))
        .filter(DashboardV2DB.project_id == project.id)
        .scalar()
    ) or 0
    source_count = (
        db.query(func.count(DataSourceDB.id))
        .filter(DataSourceDB.project_id == project.id)
        .scalar()
    ) or 0
    return ProjectOut(
        id=project.id,
        name=project.name,
        description=project.description,
        colour=project.colour,
        icon=project.icon,
        workspace_id=project.workspace_id,
        pipeline_count=pipeline_count,
        dashboard_count=dashboard_count,
        source_count=source_count,
        created_at=_fmt(project.created_at),
        updated_at=_fmt(project.updated_at),
    )


# ──────────────────────────────────────────────────────────────────────────────
# List & create
# ──────────────────────────────────────────────────────────────────────────────

@router.get("", response_model=List[ProjectOut])
def list_projects(
    workspace_id: str | None = Query(default=None),
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> List[ProjectOut]:
    visible = get_visible_user_ids(db, current_user.id, workspace_id or "default")
    q = db.query(ProjectDB).filter(ProjectDB.user_id.in_(visible))
    if workspace_id and workspace_id != "default":
        # Collab workspaces: strict — only their own projects.
        # Personal DB workspace: also include legacy "default"-tagged projects.
        q = q.filter(
            (ProjectDB.workspace_id == workspace_id)
            | (ProjectDB.workspace_id == "default")
        )
    projects = q.order_by(ProjectDB.updated_at.desc()).all()
    return [_project_out(p, db) for p in projects]


@router.post("", response_model=ProjectOut, status_code=201)
def create_project(
    payload: ProjectCreate,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ProjectOut:
    duplicate = (
        db.query(ProjectDB)
        .filter(
            ProjectDB.user_id == current_user.id,
            func.lower(ProjectDB.name) == payload.name.strip().lower(),
        )
        .first()
    )
    if duplicate:
        raise HTTPException(status_code=409, detail="A project with this name already exists.")

    workspace_id = (payload.workspace_id or "default").strip()
    _, billing_plan = resolve_workspace_plan(workspace_id, current_user.id, db)
    # Advisory lock: serialise project creation per workspace to prevent TOCTOU races.
    db.execute(_sql_text("SELECT pg_advisory_xact_lock(hashtext(:key))"), {"key": f"proj_create_{workspace_id}"})
    existing_count = db.query(ProjectDB).filter(ProjectDB.workspace_id == workspace_id).count()
    enforce_project_limit(billing_plan, existing_count)

    now = datetime.now(timezone.utc)
    project = ProjectDB(
        id=uuid.uuid4().hex,
        user_id=current_user.id,
        workspace_id=workspace_id,
        name=payload.name.strip(),
        description=payload.description,
        colour=payload.colour,
        icon=payload.icon,
        created_at=now,
        updated_at=now,
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return _project_out(project, db)


# ──────────────────────────────────────────────────────────────────────────────
# Get / update / delete
# ──────────────────────────────────────────────────────────────────────────────

def _get_project_or_404(project_id: str, user_id: str, db: Session) -> ProjectDB:
    project = (
        db.query(ProjectDB)
        .filter(ProjectDB.id == project_id, ProjectDB.user_id == user_id)
        .first()
    )
    if not project:
        raise HTTPException(status_code=404, detail="Project not found.")
    return project


@router.get("/{project_id}", response_model=ProjectDetailOut)
def get_project(
    project_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ProjectDetailOut:
    project = _get_project_or_404(project_id, current_user.id, db)

    # Pipelines — guarded: project_id column may not yet exist in older DBs
    from sqlalchemy.exc import ProgrammingError as _ProgrammingError
    try:
        pipelines_db = (
            db.query(PipelineV2DB)
            .filter(PipelineV2DB.project_id == project_id)
            .order_by(PipelineV2DB.updated_at.desc())
            .all()
        )
    except _ProgrammingError:
        # Missing column in older DB — safe to return empty list until schema is migrated
        db.rollback()
        pipelines_db = []
    pipeline_rows: list[ProjectPipelineOut] = []
    for p in pipelines_db:
        last_run = (
            db.query(PipelineRunV2DB)
            .filter(PipelineRunV2DB.pipeline_id == p.id)
            .order_by(PipelineRunV2DB.created_at.desc())
            .first()
        )
        schedule = (
            db.query(PipelineScheduleDB)
            .filter(PipelineScheduleDB.pipeline_id == p.id, PipelineScheduleDB.is_active == True)
            .first()
        )
        pipeline_rows.append(ProjectPipelineOut(
            id=p.id,
            name=p.name,
            status=p.status,
            step_count=len(p.steps) if isinstance(p.steps, list) else 0,
            last_run_at=_fmt(last_run.created_at) if last_run else None,
            last_run_status=last_run.status if last_run else None,
            cron_expression=schedule.cron_expression if schedule else None,
            updated_at=_fmt(p.updated_at),
        ))

    # Dashboards — guarded
    try:
        dashboards_db = (
            db.query(DashboardV2DB)
            .filter(DashboardV2DB.project_id == project_id)
            .order_by(DashboardV2DB.updated_at.desc())
            .all()
        )
    except Exception:
        db.rollback()
        dashboards_db = []
    dashboard_rows: list[ProjectDashboardOut] = []
    for d in dashboards_db:
        tile_count = (
            db.query(func.count(DashboardTileDB.id))
            .filter(DashboardTileDB.dashboard_id == d.id)
            .scalar()
        ) or 0
        dashboard_rows.append(ProjectDashboardOut(
            id=d.id,
            name=d.name,
            tile_count=tile_count,
            is_published=d.is_published,
            share_token=d.share_token,
            updated_at=_fmt(d.updated_at),
        ))

    # Sources — guarded
    try:
        sources_db = (
            db.query(DataSourceDB)
            .filter(DataSourceDB.project_id == project_id)
            .order_by(DataSourceDB.created_at.desc())
            .all()
        )
    except Exception:
        db.rollback()
        sources_db = []
    source_rows = [
        ProjectSourceOut(
            id=s.id,
            name=s.name,
            source_type=s.source_type,
            is_active=s.is_active,
            last_pulled_at=_fmt(s.last_pulled_at),
            created_at=_fmt(s.created_at),
        )
        for s in sources_db
    ]

    return ProjectDetailOut(
        project=_project_out(project, db),
        pipelines=pipeline_rows,
        dashboards=dashboard_rows,
        sources=source_rows,
    )


@router.patch("/{project_id}", response_model=ProjectOut)
def update_project(
    project_id: str,
    payload: ProjectUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ProjectOut:
    project = _get_project_or_404(project_id, current_user.id, db)

    if payload.name is not None:
        project.name = payload.name.strip()
    if payload.description is not None:
        project.description = payload.description
    if payload.colour is not None:
        project.colour = payload.colour
    if payload.icon is not None:
        project.icon = payload.icon
    project.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(project)
    return _project_out(project, db)


@router.delete("/{project_id}")
def delete_project(
    project_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    project = _get_project_or_404(project_id, current_user.id, db)

    # Null out FKs before deleting so child rows survive
    db.query(PipelineV2DB).filter(PipelineV2DB.project_id == project_id).update({"project_id": None})
    db.query(DashboardV2DB).filter(DashboardV2DB.project_id == project_id).update({"project_id": None})
    db.query(DataSourceDB).filter(DataSourceDB.project_id == project_id).update({"project_id": None})
    # Datasets: soft-delete (move to Trash) so they disappear from the project
    # view but remain recoverable for `TRASH_RETENTION_DAYS`. This matches user
    # expectation: "I deleted the project, the data should be gone" — while
    # still allowing recovery via the Trash UI within the retention window.
    from datetime import datetime, timezone
    db.query(DatasetMetaDB).filter(
        DatasetMetaDB.project_id == project_id,
        DatasetMetaDB.deleted_at.is_(None),
    ).update({"deleted_at": datetime.now(timezone.utc), "project_id": None})

    db.delete(project)
    db.commit()
    return Response(status_code=204)


# ──────────────────────────────────────────────────────────────────────────────
# Workspace recent feed
# ──────────────────────────────────────────────────────────────────────────────

@recent_router.get("/recent", response_model=WorkspaceRecentOut)
def workspace_recent(
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WorkspaceRecentOut:
    # Recent projects (last 5 by updated_at)
    recent_projects_db = (
        db.query(ProjectDB)
        .filter(ProjectDB.user_id == current_user.id)
        .order_by(ProjectDB.updated_at.desc())
        .limit(5)
        .all()
    )
    recent_projects = [_project_out(p, db) for p in recent_projects_db]

    # Recent pipelines (last 5 across all projects)
    recent_pipelines_db = (
        db.query(PipelineV2DB)
        .filter(PipelineV2DB.user_id == current_user.id)
        .order_by(PipelineV2DB.updated_at.desc())
        .limit(5)
        .all()
    )
    # Build project name map
    project_ids = [p.project_id for p in recent_pipelines_db if p.project_id]
    projects_map: dict[str, ProjectDB] = {}
    if project_ids:
        for proj in db.query(ProjectDB).filter(ProjectDB.id.in_(project_ids)).all():
            projects_map[proj.id] = proj

    recent_pipelines: list[RecentPipelineRow] = []
    for p in recent_pipelines_db:
        last_run = (
            db.query(PipelineRunV2DB)
            .filter(PipelineRunV2DB.pipeline_id == p.id)
            .order_by(PipelineRunV2DB.created_at.desc())
            .first()
        )
        proj = projects_map.get(p.project_id) if p.project_id else None
        recent_pipelines.append(RecentPipelineRow(
            id=p.id,
            name=p.name,
            project_id=p.project_id,
            project_name=proj.name if proj else None,
            last_run_at=_fmt(last_run.created_at) if last_run else None,
            status=last_run.status if last_run else p.status,
            step_count=len(p.steps) if isinstance(p.steps, list) else 0,
        ))

    # Recent dashboards (last 4 across all projects)
    recent_dashboards_db = (
        db.query(DashboardV2DB)
        .filter(DashboardV2DB.user_id == current_user.id)
        .order_by(DashboardV2DB.updated_at.desc())
        .limit(4)
        .all()
    )
    recent_dashboards: list[RecentDashboardRow] = []
    for d in recent_dashboards_db:
        tile_count = (
            db.query(func.count(DashboardTileDB.id))
            .filter(DashboardTileDB.dashboard_id == d.id)
            .scalar()
        ) or 0
        recent_dashboards.append(RecentDashboardRow(
            id=d.id,
            name=d.name,
            project_id=d.project_id,
            tile_count=tile_count,
            is_published=d.is_published,
            updated_at=_fmt(d.updated_at),
        ))

    return WorkspaceRecentOut(
        recent_projects=recent_projects,
        recent_pipelines=recent_pipelines,
        recent_dashboards=recent_dashboards,
    )
