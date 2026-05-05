"""
Full Auto Routes
API endpoints for autonomous agent orchestration (Phase 4 Auto Mode).

New endpoints (Phase 4):
  POST /api/auto/run                — start an auto run (SSE stream)
  POST /api/auto/run/resume         — resume after interrupt
  GET  /api/auto/runs               — list user's auto runs
  POST /api/auto/run/{id}/cancel    — cancel a running auto run
  POST /api/auto/recipes            — create a recipe
  GET  /api/auto/recipes            — list project recipes
  GET  /api/auto/recipes/{id}       — get recipe
  POST /api/auto/recipes/{id}/apply — apply recipe (creates POST /api/auto/run body)
  DELETE /api/auto/recipes/{id}     — delete recipe

Legacy endpoints kept for backward compatibility:
  GET  /api/auto/run                 — DEPRECATED; returns 410
  GET  /api/auto/guardrails/check
  GET  /api/auto/sessions
  GET  /api/auto/sessions/{id}
  POST /api/auto/sessions/{id}/cancel
  POST /api/auto/sessions/{id}/save
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db import get_db
from app.security import get_current_subject
from app.services.automation_guardrails import (
    check_auto_step_count,
    check_goal_length,
    get_auto_run_timeout,
)
from app.services.full_auto_agent import AgentEvent
from app.controllers.full_auto_controller import FullAutoController
from app.services.usage_service import (
    enforce_usage_limit,
    increment_usage,
    resolve_billing_user_for_project,
)
from app.services import billing_repository

router = APIRouter(prefix="/api/auto", tags=["auto"])
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Rate limiting state (in-process; replace with Redis for multi-pod)
# ---------------------------------------------------------------------------
_run_timestamps: dict[str, list[float]] = {}  # user_id -> [timestamps]
_MAX_RUN_PER_MIN = 5
_MAX_RESUME_PER_MIN = 30


def _check_rate(user_id: str, bucket: str, limit: int) -> None:
    key = f"{bucket}:{user_id}"
    now = time.time()
    window = _run_timestamps.setdefault(key, [])
    window[:] = [t for t in window if now - t < 60]
    if len(window) >= limit:
        raise HTTPException(status_code=429, detail="Rate limit exceeded. Please wait before trying again.")
    window.append(now)


def _assert_project_access(db: Session, project_id: str, user_id: str) -> None:
    """Raise 403 unless ``user_id`` owns the project or is an active member."""
    if not project_id:
        raise HTTPException(status_code=400, detail="project_id is required")
    row = db.execute(
        text(
            "SELECT 1 FROM projects WHERE id = :pid AND user_id = :uid "
            "UNION ALL "
            "SELECT 1 FROM project_members WHERE project_id = :pid "
            "AND user_id = :uid AND status = 'active' LIMIT 1"
        ),
        {"pid": project_id, "uid": user_id},
    ).fetchone()
    if not row:
        raise HTTPException(status_code=403, detail="Forbidden: no access to this project")


def _get_controller(db: Session = Depends(get_db)) -> FullAutoController:
    return FullAutoController(db)


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class PriorPipelineBody(BaseModel):
    format: str = "text"   # sql|python|text|dbt|recipe_id|pipeline_run_id
    content: str
    trust_level: str = "guide"  # strict|guide|reference


class AutoRunRequest(BaseModel):
    dataset_id: str
    project_id: str
    session_id: str = ""
    goal: str = Field(..., min_length=1, max_length=32768)
    pre_run_review: Optional[bool] = None   # None = auto-detect from run history
    secondary_dataset_ids: list[str] = []
    dry_run: bool = False
    prior_pipeline: Optional[PriorPipelineBody] = None


class AutoResumeRequest(BaseModel):
    run_id: str
    interrupt_response: str


class RecipeCreateRequest(BaseModel):
    project_id: str
    name: str
    description: str = ""
    goal_text: str
    rules: list[dict] = []
    reference_steps: list[dict] = []
    trust_level: str = "guide"


# ---------------------------------------------------------------------------
# Helper: convert AgentState partial update to SSE event
# ---------------------------------------------------------------------------

def _make_sse(event_type: str, data: dict) -> str:
    ev = AgentEvent(type=event_type, content="", data=data)
    return ev.to_sse()


# ---------------------------------------------------------------------------
# POST /api/auto/run — start auto run (SSE)
# ---------------------------------------------------------------------------

@router.post("/run")
async def start_auto_run(
    body: AutoRunRequest,
    current_user_id: str = Depends(get_current_subject),
    db: Session = Depends(get_db),
):
    """Start an autonomous pipeline run. Returns SSE stream of auto.* events."""
    _check_rate(current_user_id, "auto_run", _MAX_RUN_PER_MIN)

    # Defence-in-depth: backend rejects empty dataset_id even though Pydantic
    # would accept it (the field has no min_length).
    if not body.dataset_id or not body.dataset_id.strip():
        raise HTTPException(status_code=422, detail="dataset_id is required")

    # IDOR + auth: caller must have access to the project they target.
    _assert_project_access(db, body.project_id, current_user_id)

    # Quota gate: bill the project owner (org-aware) for this AI run.
    billing_user_id = resolve_billing_user_for_project(
        body.project_id, current_user_id, db
    )
    billing_plan = billing_repository.get_effective_plan(billing_user_id, db=db) or "Free"
    enforce_usage_limit(billing_user_id, billing_plan, "api_calls", db)

    try:
        check_goal_length(body.goal)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    run_id = str(uuid.uuid4())

    # Determine pre_run_review: ON if user has < 3 prior auto runs
    pre_run_review = body.pre_run_review
    if pre_run_review is None:
        try:
            row = db.execute(
                text("SELECT COUNT(*) FROM agent_auto_runs WHERE user_id = :uid AND status NOT IN ('dry_run')"),
                {"uid": current_user_id},
            ).fetchone()
            prior_runs = int(row[0]) if row else 0
            pre_run_review = prior_runs < 3
        except Exception:
            pre_run_review = True

    # Insert run record
    try:
        db.execute(
            text(
                "INSERT INTO agent_auto_runs "
                "(id, user_id, project_id, dataset_id, session_id, goal_raw, status, dry_run, pre_run_review, created_at) "
                "VALUES (:id, :uid, :pid, :did, :sid, :goal, 'running', :dry, :review, NOW())"
            ),
            {
                "id": run_id,
                "uid": current_user_id,
                "pid": body.project_id,
                "did": body.dataset_id,
                "sid": body.session_id or "",
                "goal": body.goal,
                "dry": body.dry_run,
                "review": pre_run_review,
            },
        )
        db.commit()
    except Exception as exc:
        logger.warning("Could not insert agent_auto_runs row: %s", exc)

    async def event_stream():
        try:
            yield _make_sse("auto.run.started", {"run_id": run_id, "pre_run_review": pre_run_review})
            yield ": keep-alive\n\n"

            # Build initial state for the agent graph
            from app.services.agent.graph import agent_graph

            initial_state: dict[str, Any] = {
                "messages": [],
                "root_dataset_id": body.dataset_id,
                "dataset_id": body.dataset_id,
                "user_id": current_user_id,
                "project_id": body.project_id,
                "schema": {},
                "stats": {},
                "sample_rows": [],
                "available_templates": [],
                "calculated_columns": [],
                "dashboards": [],
                "secondary_dataset_ids": body.secondary_dataset_ids,
                "session_id": body.session_id or f"{current_user_id}:{run_id}",
                "pipeline_steps": [],
                "intent": "",
                "plan": [],
                "plan_approved": not pre_run_review,  # skip presenter if no review
                "current_step_index": 0,
                "execution_results": [],
                "retry_count": 0,
                "error": None,
                "run_id": None,
                "output_dataset_id": None,
                "run_steps": [],
                "final_response": "",
                "chart_config": None,
                "query_results": None,
                # Auto Mode fields
                "auto_mode": True,
                "auto_run_id": run_id,
                "auto_goal_raw": body.goal,
                "auto_pre_run_review": pre_run_review,
                "dry_run": body.dry_run,
                "prior_pipeline": body.prior_pipeline.dict() if body.prior_pipeline else None,
                "total_tokens_used": 0,
                "reflection_attempts": {},
                "reflection_history": {},
                "goal_verifier_recursions": 0,
                "interrupt_pending": False,
            }

            config = {"configurable": {"thread_id": run_id}}
            timeout = get_auto_run_timeout()
            events_queue: asyncio.Queue = asyncio.Queue()

            async def _run_graph():
                try:
                    async for chunk in agent_graph.astream(initial_state, config=config):
                        await events_queue.put(("chunk", chunk))
                except Exception as exc:
                    await events_queue.put(("error", str(exc)))
                finally:
                    await events_queue.put(("done", None))

            asyncio.ensure_future(_run_graph())

            deadline = time.time() + timeout
            while True:
                remaining = deadline - time.time()
                if remaining <= 0:
                    yield _make_sse("auto.run.timeout", {"run_id": run_id})
                    break
                try:
                    kind, payload = await asyncio.wait_for(events_queue.get(), timeout=min(15, remaining))
                except asyncio.TimeoutError:
                    yield ": keep-alive\n\n"
                    continue

                if kind == "error":
                    yield _make_sse("auto.run.error", {"run_id": run_id, "error": str(payload)})
                    break
                if kind == "done":
                    break
                if kind == "chunk":
                    # Emit relevant state updates
                    chunk: dict = payload
                    for node_name, node_state in chunk.items():
                        if not isinstance(node_state, dict):
                            continue
                        # Goal parsed
                        if "auto_goal" in node_state:
                            ag = node_state["auto_goal"] or {}
                            yield _make_sse("auto.goal.parsed", {
                                "run_id": run_id,
                                "total_rules": ag.get("total_rules", 0),
                                "goal_summary": ag.get("goal_summary", ""),
                            })
                        # Plan ready
                        if "auto_plan" in node_state:
                            plan = node_state["auto_plan"] or []
                            try:
                                check_auto_step_count(len(plan))
                            except ValueError as ve:
                                yield _make_sse("auto.run.error", {"run_id": run_id, "error": str(ve)})
                                return
                            yield _make_sse("auto.plan.ready", {
                                "run_id": run_id,
                                "steps": plan,
                            })
                        # Drift report
                        if "drift_report" in node_state and node_state["drift_report"]:
                            dr = node_state["drift_report"]
                            yield _make_sse("auto.drift.report", {
                                "run_id": run_id,
                                "green": dr.get("green_count", 0),
                                "amber": dr.get("amber_count", 0),
                                "red": dr.get("red_count", 0),
                                "schema_changes": dr.get("schema_changes", []),
                            })
                        # Validation result
                        if "last_validation" in node_state and node_state["last_validation"]:
                            lv = node_state["last_validation"]
                            yield _make_sse("auto.step.validated", {
                                "run_id": run_id,
                                "step_number": lv.get("step_number"),
                                "rule_id": lv.get("rule_id"),
                                "passed": lv.get("passed"),
                                "residual_count": lv.get("residual_count", 0),
                            })
                        # Interrupt
                        if node_state.get("interrupt_pending") and node_state.get("interrupt_question"):
                            yield _make_sse("auto.interrupt.question", {
                                "run_id": run_id,
                                "question": node_state["interrupt_question"],
                            })
                        # Goal report
                        if "goal_report" in node_state and node_state["goal_report"]:
                            gr = node_state["goal_report"]
                            yield _make_sse("auto.goal.report", {
                                "run_id": run_id,
                                "rules_satisfied": gr.get("rules_satisfied", 0),
                                "rules_failed": gr.get("rules_failed", 0),
                                "rules_skipped": gr.get("rules_skipped", 0),
                                "total_rules": gr.get("total_rules", 0),
                                "duration_seconds": gr.get("duration_seconds", 0),
                            })

            yield _make_sse("auto.run.complete", {"run_id": run_id})

        except Exception as exc:
            logger.error("auto run SSE error: %s", exc)
            yield _make_sse("auto.run.error", {"run_id": run_id, "error": str(exc)})
        finally:
            # Mark run completed in DB
            try:
                db.execute(
                    text("UPDATE agent_auto_runs SET status = 'completed', completed_at = NOW() WHERE id = :id"),
                    {"id": run_id},
                )
                db.commit()
            except Exception:
                pass

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


# ---------------------------------------------------------------------------
# POST /api/auto/run/resume — resume after interrupt
# ---------------------------------------------------------------------------

@router.post("/run/resume")
async def resume_auto_run(
    body: AutoResumeRequest,
    current_user_id: str = Depends(get_current_subject),
    db: Session = Depends(get_db),
):
    """Resume a suspended auto run after answering an interrupt question."""
    _check_rate(current_user_id, "auto_resume", _MAX_RESUME_PER_MIN)

    # Verify ownership
    try:
        row = db.execute(
            text("SELECT user_id, status FROM agent_auto_runs WHERE id = :id"),
            {"id": body.run_id},
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Auto run not found")
        if row[0] != current_user_id:
            raise HTTPException(status_code=403, detail="Forbidden")
        if row[1] not in ("running", "interrupted"):
            raise HTTPException(status_code=409, detail=f"Run is in '{row[1]}' state and cannot be resumed")
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("resume: DB check error: %s", exc)
        raise HTTPException(status_code=500, detail="Internal server error")

    # Inject response into graph via LangGraph update
    try:
        from app.services.agent.graph import agent_graph
        config = {"configurable": {"thread_id": body.run_id}}
        await agent_graph.aupdate_state(
            config,
            {"interrupt_response": body.interrupt_response, "interrupt_pending": False},
        )
    except Exception as exc:
        logger.error("resume: graph state update error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to resume run")

    return {"run_id": body.run_id, "status": "resumed"}


# ---------------------------------------------------------------------------
# GET /api/auto/runs — list user's runs
# ---------------------------------------------------------------------------

@router.get("/runs")
async def list_auto_runs(
    project_id: str = "",
    limit: int = 20,
    current_user_id: str = Depends(get_current_subject),
    db: Session = Depends(get_db),
):
    limit = min(limit, 100)
    try:
        where_extra = "AND project_id = :pid" if project_id else ""
        rows = db.execute(
            text(
                f"SELECT id, project_id, dataset_id, status, goal_raw, created_at, completed_at, "
                f"rules_total, rules_satisfied, rules_failed "
                f"FROM agent_auto_runs WHERE user_id = :uid {where_extra} "
                f"ORDER BY created_at DESC LIMIT :lim"
            ),
            {"uid": current_user_id, "pid": project_id, "lim": limit},
        ).fetchall()
        return {
            "runs": [
                {
                    "id": r[0], "project_id": r[1], "dataset_id": r[2],
                    "status": r[3], "goal_summary": (r[4] or "")[:120],
                    "created_at": str(r[5]), "completed_at": str(r[6]) if r[6] else None,
                    "rules_total": r[7], "rules_satisfied": r[8], "rules_failed": r[9],
                }
                for r in rows
            ],
            "count": len(rows),
        }
    except Exception as exc:
        logger.error("list_auto_runs error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to fetch runs")


# ---------------------------------------------------------------------------
# POST /api/auto/run/{id}/cancel
# ---------------------------------------------------------------------------

@router.post("/run/{run_id}/cancel")
async def cancel_auto_run(
    run_id: str,
    current_user_id: str = Depends(get_current_subject),
    db: Session = Depends(get_db),
):
    try:
        row = db.execute(
            text("SELECT user_id FROM agent_auto_runs WHERE id = :id"),
            {"id": run_id},
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Run not found")
        if row[0] != current_user_id:
            raise HTTPException(status_code=403, detail="Forbidden")
        db.execute(
            text("UPDATE agent_auto_runs SET status = 'cancelled', completed_at = NOW() WHERE id = :id"),
            {"id": run_id},
        )
        db.commit()
        return {"run_id": run_id, "status": "cancelled"}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("cancel_auto_run error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to cancel run")


# ---------------------------------------------------------------------------
# Recipe endpoints
# ---------------------------------------------------------------------------

@router.post("/recipes")
async def create_recipe(
    body: RecipeCreateRequest,
    current_user_id: str = Depends(get_current_subject),
    db: Session = Depends(get_db),
):
    recipe_id = str(uuid.uuid4())
    try:
        db.execute(
            text(
                "INSERT INTO agent_recipes "
                "(id, project_id, created_by, name, description, goal_text, rules, reference_steps, "
                "trust_level, schema_fingerprint, run_count, success_count, created_at, updated_at) "
                "VALUES (:id, :pid, :uid, :name, :desc, :goal, :rules, :steps, :trust, :fingerprint, 0, 0, NOW(), NOW())"
            ),
            {
                "id": recipe_id,
                "pid": body.project_id,
                "uid": current_user_id,
                "name": body.name,
                "desc": body.description,
                "goal": body.goal_text,
                "rules": json.dumps(body.rules),
                "steps": json.dumps(body.reference_steps),
                "trust": body.trust_level,
                "fingerprint": "",
            },
        )
        db.commit()
        return {"id": recipe_id, "name": body.name}
    except Exception as exc:
        logger.error("create_recipe error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to create recipe")


@router.get("/recipes")
async def list_recipes(
    project_id: str,
    current_user_id: str = Depends(get_current_subject),
    db: Session = Depends(get_db),
):
    # IDOR fix: caller must own the project or be an active member.
    _assert_project_access(db, project_id, current_user_id)
    try:
        rows = db.execute(
            text(
                "SELECT id, name, description, trust_level, run_count, success_count, created_at "
                "FROM agent_recipes WHERE project_id = :pid ORDER BY run_count DESC"
            ),
            {"pid": project_id},
        ).fetchall()
        return {
            "recipes": [
                {
                    "id": r[0], "name": r[1], "description": r[2],
                    "trust_level": r[3], "run_count": r[4], "success_count": r[5],
                    "created_at": str(r[6]),
                }
                for r in rows
            ]
        }
    except Exception as exc:
        logger.error("list_recipes error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to fetch recipes")


@router.get("/recipes/{recipe_id}")
async def get_recipe(
    recipe_id: str,
    current_user_id: str = Depends(get_current_subject),
    db: Session = Depends(get_db),
):
    try:
        row = db.execute(
            text("SELECT id, project_id, name, description, goal_text, rules, reference_steps, trust_level FROM agent_recipes WHERE id = :id"),
            {"id": recipe_id},
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Recipe not found")
        # IDOR fix: must be in a project the caller can access.
        _assert_project_access(db, row[1], current_user_id)
        return {
            "id": row[0], "project_id": row[1], "name": row[2], "description": row[3],
            "goal_text": row[4], "rules": row[5], "reference_steps": row[6], "trust_level": row[7],
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("get_recipe error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to fetch recipe")


@router.post("/recipes/{recipe_id}/apply")
async def apply_recipe(
    recipe_id: str,
    dataset_id: str,
    project_id: str,
    session_id: str = "",
    dry_run: bool = False,
    current_user_id: str = Depends(get_current_subject),
    db: Session = Depends(get_db),
):
    """Returns an AutoRunRequest body pre-filled from the recipe."""
    # IDOR fix: must own/access target project AND the recipe's home project.
    _assert_project_access(db, project_id, current_user_id)
    row = db.execute(
        text("SELECT goal_text, trust_level, project_id FROM agent_recipes WHERE id = :id"),
        {"id": recipe_id},
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Recipe not found")
    _assert_project_access(db, row[2], current_user_id)
    return {
        "dataset_id": dataset_id,
        "project_id": project_id,
        "session_id": session_id,
        "goal": row[0],
        "dry_run": dry_run,
        "prior_pipeline": {"format": "recipe_id", "content": recipe_id, "trust_level": row[1]},
    }


@router.delete("/recipes/{recipe_id}")
async def delete_recipe(
    recipe_id: str,
    current_user_id: str = Depends(get_current_subject),
    db: Session = Depends(get_db),
):
    row = db.execute(
        text("SELECT created_by FROM agent_recipes WHERE id = :id"),
        {"id": recipe_id},
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Recipe not found")
    if row[0] != current_user_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    db.execute(text("DELETE FROM agent_recipes WHERE id = :id"), {"id": recipe_id})
    db.commit()
    return {"deleted": True}


# ---------------------------------------------------------------------------
# Legacy endpoints (backward compat)
# ---------------------------------------------------------------------------

@router.get("/run")
async def legacy_start_auto():
    """DEPRECATED. Use POST /api/auto/run instead."""
    raise HTTPException(status_code=410, detail="This endpoint has been removed. Use POST /api/auto/run.")


@router.get("/guardrails/check")
async def check_auto_guardrails(
    dataset_id: str,
    user_request: str,
    current_user_id: str = Depends(get_current_subject),
    controller: FullAutoController = Depends(_get_controller),
):
    try:
        return controller.evaluate_guardrails(
            user_id=current_user_id,
            dataset_id=dataset_id,
            user_request=user_request,
        )
    except Exception as e:
        logger.error("Error in check_auto_guardrails: %s", e)
        raise HTTPException(status_code=500, detail="Failed to evaluate guardrails")


@router.get("/sessions")
async def get_user_sessions(
    current_user_id: str = Depends(get_current_subject),
    controller: FullAutoController = Depends(_get_controller),
):
    try:
        sessions = await controller.get_sessions(current_user_id)
        return {"sessions": sessions, "count": len(sessions)}
    except Exception as e:
        logger.error("Error fetching sessions: %s", e)
        raise HTTPException(status_code=500, detail="Error fetching sessions")


@router.get("/sessions/{session_id}")
async def get_session_details(
    session_id: str,
    current_user_id: str = Depends(get_current_subject),
    controller: FullAutoController = Depends(_get_controller),
):
    try:
        session = await controller.get_session(current_user_id, session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        return session
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error fetching session %s: %s", session_id, e)
        raise HTTPException(status_code=500, detail="Error fetching session")


@router.post("/sessions/{session_id}/cancel")
async def cancel_session(
    session_id: str,
    current_user_id: str = Depends(get_current_subject),
    controller: FullAutoController = Depends(_get_controller),
):
    try:
        success = await controller.cancel_session(current_user_id, session_id)
        if not success:
            raise HTTPException(status_code=404, detail="Session not found or already completed")
        return {"status": "cancelled"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error cancelling session: %s", e)
        raise HTTPException(status_code=500, detail="Error cancelling session")


@router.post("/sessions/{session_id}/save")
async def save_session(
    session_id: str,
    current_user_id: str = Depends(get_current_subject),
    controller: FullAutoController = Depends(_get_controller),
):
    try:
        if session_id not in controller._sessions:
            raise HTTPException(status_code=404, detail="Session not found")
        session = controller._sessions[session_id]
        if session["user_id"] != current_user_id:
            raise HTTPException(status_code=403, detail="Forbidden")
        saved_id = await controller.save_session(
            current_user_id, session["dataset_id"], session["events"]
        )
        if not saved_id:
            raise HTTPException(status_code=500, detail="Failed to save session")
        return {"session_id": saved_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error saving session: %s", e)
        raise HTTPException(status_code=500, detail="Error saving session")
