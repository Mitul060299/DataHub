"""branch_handler node — handles the 'branch' intent.

When the user says e.g. "fork from step 3" or "branch off at step 2 and
try a different aggregation", this node:

1. Parses the step number from the user's message (or uses the most recent
   completed step if none is specified).
2. Finds the matching PipelineStepDB row for the current session.
3. Calls the fork logic directly (same as POST /pipeline-steps/{stepId}/fork-to-dataset)
   without going through HTTP — avoids a round-trip and authentication overhead.
4. Returns a structured final_response that the frontend can parse to
   automatically add the new dataset to the lane HUD and switch to it.

The response includes a ``branch_result`` key in execution_results so the
frontend event bus can react (``datahub:branch:created`` CustomEvent).
"""
from __future__ import annotations

import logging
import re
import uuid

from langchain_core.messages import AIMessage

from ....db import SessionLocal
from ....models_db import DatasetMetaDB, DatasetSessionDB, PipelineStepDB
from ....services.persistence_policy import materialize_dataset
from ..state import AgentState

_logger = logging.getLogger(__name__)

_STEP_NUM_RE = re.compile(r"\bstep\s+(\d+)\b", re.IGNORECASE)


def _slugify(text: str) -> str:
    s = re.sub(r"[^A-Za-z0-9_]", "_", text.strip()).lower()
    s = re.sub(r"_+", "_", s).strip("_")
    if not s or s[0].isdigit():
        s = "ds_" + s
    return s or "branch"


async def branch_handler(state: AgentState) -> dict:
    messages = state.get("messages", [])
    user_msg = messages[-1].content if messages else ""
    user_id = state.get("user_id", "")
    session_id = state.get("session_id", "")
    dataset_id = state.get("dataset_id", "")

    # ── 1. Parse requested step number ────────────────────────────────────
    m = _STEP_NUM_RE.search(user_msg)
    requested_step: int | None = int(m.group(1)) if m else None

    db = SessionLocal()
    try:
        # ── 2. Resolve the source step ─────────────────────────────────────
        q = (
            db.query(PipelineStepDB)
            .filter(
                PipelineStepDB.user_id == user_id,
                PipelineStepDB.session_id == session_id,
                PipelineStepDB.status == "completed",
                PipelineStepDB.snapshot_path.isnot(None),
            )
            .order_by(PipelineStepDB.step_number)
        )
        all_steps = q.all()

        if not all_steps:
            return {
                "final_response": (
                    "I can't create a branch yet — this pipeline doesn't have any "
                    "saved step snapshots. Run at least one transformation first."
                ),
                "messages": [AIMessage(content=(
                    "No step snapshots found. Please run a pipeline step first."
                ))],
            }

        if requested_step is not None:
            fork_step = next(
                (s for s in all_steps if s.step_number == requested_step), None
            )
            if fork_step is None:
                available = [str(s.step_number) for s in all_steps]
                return {
                    "final_response": (
                        f"Step {requested_step} doesn't have a saved snapshot. "
                        f"Available steps with snapshots: {', '.join(available)}."
                    ),
                    "messages": [AIMessage(content=(
                        f"Step {requested_step} snapshot not found."
                    ))],
                }
        else:
            # Default: most recent step with a snapshot
            fork_step = all_steps[-1]

        # ── 3. Resolve source dataset ──────────────────────────────────────
        chat_session_part = (
            session_id.split(":")[-1] if ":" in session_id else session_id
        )
        source_session = (
            db.query(DatasetSessionDB)
            .filter(
                DatasetSessionDB.user_id == user_id,
                DatasetSessionDB.chat_session_id == chat_session_part,
            )
            .first()
        )
        source_dataset_id = source_session.dataset_id if source_session else dataset_id
        source_ds = (
            db.query(DatasetMetaDB)
            .filter(DatasetMetaDB.id == source_dataset_id)
            .first()
        )
        source_name = source_ds.name if source_ds else "Dataset"

        # ── 4. Build new dataset name (extract from message if present) ────
        name_m = re.search(
            r'(?:call(?:ed)?|named?|as)\s+["\']?([A-Za-z0-9 _\-]+)["\']?',
            user_msg,
            re.IGNORECASE,
        )
        if name_m:
            new_name = name_m.group(1).strip()
        else:
            new_name = f"{source_name} → step {fork_step.step_number}"

        # ── 5. Create the new dataset row ──────────────────────────────────
        new_ds_id = str(uuid.uuid4())
        new_ds = materialize_dataset(
            db,
            triggered_by="pipeline_step",
            id=new_ds_id,
            user_id=user_id,
            name=new_name,
            description=(
                f"Branched from '{source_name}' at step {fork_step.step_number}: "
                f"{fork_step.description or ''}"
            ),
            source_type="fork",
            storage_provider=source_ds.storage_provider if source_ds else "s3",
            storage_path=fork_step.snapshot_path,
            file_format="parquet",
            schema_json=source_ds.schema_json if source_ds else {},
            stats_json={},
            columns=source_ds.columns if source_ds else [],
            row_count=fork_step.row_count_after or 0,
            status="ready",
            project_id=source_ds.project_id if source_ds else None,
            version_number=1,
            forked_from_step_id=fork_step.id,
        )

        # ── 6. Copy all steps up to and including the fork step ───────────
        prior_steps = (
            db.query(PipelineStepDB)
            .filter(
                PipelineStepDB.user_id == user_id,
                PipelineStepDB.session_id == session_id,
                PipelineStepDB.status == "completed",
                PipelineStepDB.step_number <= fork_step.step_number,
            )
            .order_by(PipelineStepDB.step_number)
            .all()
        )

        new_session_id = f"{user_id}:fork_{new_ds_id[:8]}"
        new_chat_id = f"fork_{new_ds_id[:8]}"
        copied_steps: list[dict] = []

        for ps in prior_steps:
            copied_id = str(uuid.uuid4())
            new_step = PipelineStepDB(
                id=copied_id,
                user_id=user_id,
                session_id=new_session_id,
                step_number=ps.step_number,
                intent=ps.intent,
                operation=ps.operation,
                description=ps.description,
                input_tables=ps.input_tables,
                output_table=ps.output_table,
                duckdb_sql=ps.duckdb_sql,
                parameters=ps.parameters,
                status="completed",
                execution_time_ms=ps.execution_time_ms,
                row_count_before=ps.row_count_before,
                row_count_after=ps.row_count_after,
                snapshot_path=ps.snapshot_path,
                parent_step_id=None,
            )
            db.add(new_step)
            copied_steps.append({
                "id": copied_id,
                "stepNumber": ps.step_number,
                "operation": ps.operation,
                "description": ps.description,
                "sql": ps.duckdb_sql,
                "affectedRows": str(ps.row_count_after or ""),
                "appliedAt": ps.created_at.isoformat() if ps.created_at else None,
                "output_table": ps.output_table,
                "input_tables": ps.input_tables or [],
                "row_count_before": ps.row_count_before,
                "row_count_after": ps.row_count_after,
                "execution_time_ms": ps.execution_time_ms,
                "snapshot_path": ps.snapshot_path,
                "parentStepId": None,
            })

        # Pre-create the session so pipeline step lookup works on first open
        db.add(DatasetSessionDB(
            id=str(uuid.uuid4()),
            dataset_id=new_ds_id,
            user_id=user_id,
            chat_session_id=new_chat_id,
        ))

        db.commit()
        db.refresh(new_ds)

        _logger.info(
            "BRANCH_CREATED: new_ds=%s source_ds=%s fork_step=%d user=%s",
            new_ds_id, source_dataset_id, fork_step.step_number, user_id,
        )

    except Exception as exc:
        db.rollback()
        _logger.error("BRANCH_HANDLER_ERROR: %s", exc)
        return {
            "final_response": (
                f"Sorry, I couldn't create the branch: {exc!s}"
            ),
            "messages": [AIMessage(content=f"Branch creation failed: {exc!s}")],
        }
    finally:
        db.close()

    response_text = (
        f"✅ Branch created: **{new_name}**\n\n"
        f"I've copied steps 1–{fork_step.step_number} from '{source_name}' into the new "
        f"dataset. It's now in your lane bar — click it to switch and continue from "
        f"step {fork_step.step_number}."
    )

    return {
        "final_response": response_text,
        "messages": [AIMessage(content=response_text)],
        "execution_results": [{
            "step_number": 0,
            "operation": "branch",
            "success": True,
            "rows_affected": fork_step.row_count_after,
            "run_id": None,
            "output_dataset_id": new_ds_id,
            "sql": None,
            "error": None,
            # Frontend reads this to add the new lane + switch to it
            "branch_result": {
                "dataset_id": new_ds_id,
                "dataset_name": new_name,
                "forked_from_step_id": fork_step.id,
                "forked_from_step_number": fork_step.step_number,
                "source_dataset_id": source_dataset_id,
                "steps": copied_steps,
            },
        }],
    }
