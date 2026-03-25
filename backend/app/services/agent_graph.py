from __future__ import annotations

import logging as _log
import uuid as _uuid
from collections.abc import AsyncIterator
from typing import Any

from langchain_core.messages import HumanMessage
from sqlalchemy.orm import Session

from .agent.graph import agent_graph
from ..models_db import ArtifactDB
from ..db import SessionLocal


class AgentGraphService:
    @staticmethod
    def _build_initial_state(
        dataset_id: str,
        message: str,
        pipeline_steps: list[dict[str, Any]],
        plan_approved: bool,
        user_id: str,
        workspace_id: str,
        session_id: str = "",
        secondary_dataset_ids: list[str] | None = None,
    ) -> dict[str, Any]:
        state: dict[str, Any] = {
            "messages": [HumanMessage(content=message)] if message else [],
            "root_dataset_id": dataset_id,
            "dataset_id": dataset_id,
            "user_id": user_id,
            "workspace_id": workspace_id,
            "session_id": session_id,
            "table_registry": {},
            "schema": {},
            "stats": {},
            "sample_rows": [],
            "calculated_columns": [],
            "dashboards": [],
            "pipeline_steps": pipeline_steps or [],
            "plan_approved": plan_approved,
            "intent": "",
            "plan": [],
            "current_step_index": 0,
            "execution_results": [],
            "retry_count": 0,
            "error": None,
            "run_id": None,
            "output_dataset_id": dataset_id,
            "run_steps": [],
            "final_response": "",
            "chart_config": None,
            "query_results": None,
        }
        if secondary_dataset_ids:
            state["secondary_dataset_ids"] = secondary_dataset_ids
            state["secondary_schemas"] = {}
        return state

    @classmethod
    async def process_command_stream(
        cls,
        dataset_id: str,
        user_message: str,
        session_id: str,
        pipeline_steps: list[dict[str, Any]],
        plan_approved: bool,
        user_id: str,
        workspace_id: str,
        secondary_dataset_ids: list[str] | None = None,
        pending_plan: list[dict[str, Any]] | None = None,
    ) -> AsyncIterator[dict[str, Any]]:
        config = {"configurable": {"thread_id": session_id}}
        if plan_approved:
            # Resume path: prefer plan sent by the frontend (pending_plan).
            # Fall back to MemorySaver checkpoint only if nothing was sent.
            # Clear schema so context_loader re-registers DuckDB views.
            existing = agent_graph.get_state(config)
            snapshot: dict = existing.values if existing else {}

            resolved_plan: list = pending_plan or snapshot.get("plan", [])
            if not resolved_plan:
                yield {
                    "type": "agent.error",
                    "error": "No pending plan found. Please send a new request first.",
                }
                return

            # Re-use the original user message for intent classification so
            # route_intent can detect plan_approved=True and skip planning.
            snapshot_messages = snapshot.get("messages", [])
            user_msgs = [m for m in snapshot_messages if getattr(m, "type", "") == "human"]
            resume_message = user_msgs[-1] if user_msgs else HumanMessage(content=user_message or "proceed")

            initial_state: dict = {
                "messages": [resume_message],
                "root_dataset_id": snapshot.get("root_dataset_id", dataset_id),
                "dataset_id": snapshot.get("dataset_id", dataset_id),
                "user_id": user_id,
                "workspace_id": workspace_id,
                "session_id": snapshot.get("session_id", session_id),
                "plan_approved": True,
                "plan": resolved_plan,
                "intent": snapshot.get("intent", ""),
                "current_step_index": 0,
                "execution_results": [],
                "retry_count": 0,
                "pipeline_steps": pipeline_steps or snapshot.get("pipeline_steps", []),
                # Clear schema so context_loader re-runs DuckDB view registration.
                "schema": {},
                "stats": {},
                "sample_rows": [],
                "table_registry": {},
                "calculated_columns": [],
                "dashboards": [],
                "available_templates": [],
                "error": None,
                "run_id": None,
                "output_dataset_id": snapshot.get("dataset_id", dataset_id),
                "run_steps": [],
                "final_response": "",
                "chart_config": None,
                "query_results": None,
            }
        else:
            initial_state = cls._build_initial_state(
                dataset_id=dataset_id,
                message=user_message,
                pipeline_steps=pipeline_steps,
                plan_approved=False,
                user_id=user_id,
                workspace_id=workspace_id,
                session_id=session_id,
                secondary_dataset_ids=secondary_dataset_ids or [],
            )

        try:
            async for event in agent_graph.astream_events(initial_state, config=config, version="v2"):
                event_name = event.get("event", "")
                node_name = event.get("name", "")
                data = event.get("data", {})

                if event_name != "on_chain_end":
                    continue

                if node_name == "context_loader":
                    yield {"type": "agent.thinking", "message": "Loading dataset context..."}

                elif node_name == "intent_classifier":
                    intent = data.get("output", {}).get("intent", "")
                    yield {"type": "agent.thinking", "message": f"Intent: {intent}"}

                elif node_name == "planner":
                    plan = data.get("output", {}).get("plan", [])
                    yield {
                        "type": "agent.plan",
                        "plan": plan,
                        "message": "Plan ready for approval",
                    }

                elif node_name == "plan_presenter":
                    output = data.get("output", {})
                    messages = output.get("messages", [])
                    plan_text = messages[-1].content if messages else ""
                    yield {"type": "agent.plan_presented", "text": plan_text}

                elif node_name == "execute_step":
                    output = data.get("output", {})
                    results = output.get("execution_results", [])
                    if results:
                        last = results[-1]
                        if last.get("success"):
                            if isinstance(last.get("column_added"), dict):
                                column = last.get("column_added", {})
                                yield {
                                    "type": "column_added",
                                    "column": {
                                        "name": column.get("name"),
                                        "formula": column.get("formula"),
                                        "column_type": column.get("column_type"),
                                    },
                                }
                            if isinstance(last.get("tile_created"), dict):
                                tile = last.get("tile_created", {})
                                yield {
                                    "type": "tile_created",
                                    "tile": {
                                        "id": tile.get("id"),
                                        "dashboard_id": tile.get("dashboard_id"),
                                        "title": tile.get("title"),
                                        "chart_type": tile.get("chart_type"),
                                        "echarts_config": tile.get("echarts_config"),
                                        "saveable": tile.get("saveable", True),
                                    },
                                }
                            artifact_url = last.get("artifact_url")
                            if artifact_url:
                                yield {
                                    "type": "agent.artifact",
                                    "artifact_url": artifact_url,
                                    "operation": last.get("operation"),
                                    "step": last.get("step_number"),
                                }
                            artifact_s3 = last.get("artifact_s3_key")
                            if isinstance(artifact_s3, str) and artifact_s3:
                                art_id = str(_uuid.uuid4())
                                try:
                                    _art_db = SessionLocal()
                                    try:
                                        art = ArtifactDB(
                                            id=art_id,
                                            user_id=str(initial_state.get("user_id") or "agent"),
                                            session_id=str(initial_state.get("session_id") or ""),
                                            name=str(last.get("output_table") or last.get("operation") or "artifact"),
                                            s3_key=artifact_s3,
                                            row_count=last.get("rows_affected"),
                                            column_schema=last.get("column_schema") or [],
                                            type="auto",
                                        )
                                        _art_db.add(art)
                                        _art_db.commit()
                                    finally:
                                        _art_db.close()
                                except Exception as _db_exc:
                                    _log.getLogger(__name__).warning(
                                        "ArtifactDB insert failed: %s", _db_exc
                                    )
                                yield {
                                    "type": "agent.artifact",
                                    "artifact_s3_key": artifact_s3,
                                    "artifact_id": art_id,
                                    "table_name": last.get("output_table"),
                                    "row_count": last.get("rows_affected"),
                                }
                            qr = last.get("query_results")
                            if isinstance(qr, list) and qr:
                                yield {
                                    "type": "agent.query_results",
                                    "results": qr,
                                    "step": last.get("step_number"),
                                    "operation": last.get("operation"),
                                }
                            yield {
                                "type": "agent.step.done",
                                "step": last.get("step_number"),
                                "operation": last.get("operation"),
                                "rows_affected": last.get("rows_affected"),
                            }
                        else:
                            yield {
                                "type": "agent.step.error",
                                "step": last.get("step_number"),
                                "error": last.get("error"),
                            }

                elif node_name == "reflect":
                    retry = data.get("output", {}).get("retry_count", 0)
                    yield {"type": "agent.step.retry", "attempt": retry}

                elif node_name == "pipeline_recorder":
                    yield {"type": "agent.thinking", "message": "Saving pipeline steps..."}

                elif node_name == "responder":
                    output = data.get("output", {})
                    final = output.get("final_response", "")
                    messages = output.get("messages", [])
                    response_text = messages[-1].content if messages else final
                    yield {
                        "type": "agent.done",
                        "response": response_text,
                        "run_id": output.get("run_id"),
                        "output_dataset_id": output.get("output_dataset_id"),
                        "run_steps": output.get("run_steps", []),
                        "pipeline_steps": output.get("pipeline_steps", []),
                    }

        except Exception as exc:
            import logging
            logging.getLogger(__name__).exception("AgentGraph execution error")
            msg = str(exc)
            # Surface a concise, human-readable error — strip internal Python tracebacks
            if len(msg) > 300:
                msg = msg[:300] + "…"
            yield {"type": "agent.error", "error": msg}

    @classmethod
    def process_command(
        cls,
        dataset_id: str,
        user_message: str,
        conversation_history: list[dict[str, Any]],
        db: Session,
    ) -> dict[str, Any]:
        _ = dataset_id
        _ = user_message
        _ = conversation_history
        _ = db
        return {
            "response": "This endpoint now streams agent events. Use the SSE chat flow.",
            "transformation": None,
            "needsConfirmation": False,
            "plan": [],
            "artifact": None,
        }
