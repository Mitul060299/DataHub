from __future__ import annotations

import logging as _log
import threading as _threading
import time as _time
import uuid as _uuid
from collections.abc import AsyncIterator
from typing import Any

from langchain_core.messages import AIMessage, HumanMessage
from sqlalchemy.orm import Session

from .agent.graph import agent_graph

# ── MemorySaver TTL pruning ───────────────────────────────────────────────────
# LangGraph's MemorySaver stores all conversation turns in a module-level dict
# keyed by thread_id (our session_id). Without pruning this grows unbounded and
# leaks RSS on long-running Render instances.

_THREAD_LAST_USED: dict[str, float] = {}
_MEMSAVER_LOCK = _threading.Lock()
_MEMSAVER_TTL_SECONDS = 4 * 3600  # 4 hours
_MEMSAVER_PRUNE_INTERVAL = 15 * 60  # prune every 15 minutes


def _prune_memsaver(max_age: float = _MEMSAVER_TTL_SECONDS) -> int:
    """
    Remove MemorySaver checkpoints for threads that have been idle longer than
    *max_age* seconds.  Returns the number of threads pruned.
    """
    now = _time.monotonic()
    with _MEMSAVER_LOCK:
        stale = [tid for tid, ts in _THREAD_LAST_USED.items() if now - ts > max_age]
        for tid in stale:
            try:
                # MemorySaver.storage is a defaultdict keyed by thread_id.
                agent_graph.checkpointer.storage.pop(tid, None)
            except Exception:
                pass
            _THREAD_LAST_USED.pop(tid, None)
    if stale:
        _log.getLogger(__name__).info("MemorySaver pruned %d stale threads", len(stale))
    return len(stale)


def _prune_loop() -> None:
    while True:
        _time.sleep(_MEMSAVER_PRUNE_INTERVAL)
        try:
            _prune_memsaver()
        except Exception as exc:
            _log.getLogger(__name__).warning("MemorySaver prune error: %s", exc)


_threading.Thread(target=_prune_loop, daemon=True, name="memsaver-prune").start()


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
        conversation_history: list[dict[str, Any]] | None = None,
        plan_pending_modification: bool = False,
        pending_plan: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        # Build LangChain messages from the prior conversation turns
        history_messages: list = []
        for turn in (conversation_history or []):
            role = turn.get("role", "")
            content = str(turn.get("content", ""))
            if not content:
                continue
            if role == "user":
                history_messages.append(HumanMessage(content=content))
            elif role == "assistant":
                history_messages.append(AIMessage(content=content))
        current_message = [HumanMessage(content=message)] if message else []
        state: dict[str, Any] = {
            "messages": history_messages + current_message,
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
            "plan": pending_plan or [],
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
            "plan_pending_modification": plan_pending_modification,
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
        conversation_history: list[dict[str, Any]] | None = None,
        plan_pending_modification: bool = False,
    ) -> AsyncIterator[dict[str, Any]]:
        config = {"configurable": {"thread_id": session_id}}
        # Track last-used time so the prune thread can clear stale MemorySaver state.
        with _MEMSAVER_LOCK:
            _THREAD_LAST_USED[session_id] = _time.monotonic()
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
                conversation_history=conversation_history or [],
                plan_pending_modification=plan_pending_modification,
                pending_plan=pending_plan,
            )
            # Restore table_registry from the prior turn's MemorySaver checkpoint so
            # the planner sees artifacts created in previous messages and can use them
            # as input tables instead of always falling back to the raw `dataset` view.
            existing_for_registry = agent_graph.get_state(config)
            prior_snapshot = existing_for_registry.values if existing_for_registry else {}
            if prior_snapshot.get("table_registry"):
                initial_state["table_registry"] = dict(prior_snapshot["table_registry"])

        try:
            async for event in agent_graph.astream_events(initial_state, config=config, version="v2"):
                event_name = event.get("event", "")
                node_name = event.get("name", "")
                data = event.get("data", {})

                # Emit per-step progress before execution starts
                if event_name == "on_chain_start" and node_name == "execute_step":
                    input_state = data.get("input", {})
                    plan = input_state.get("plan", [])
                    idx = int(input_state.get("current_step_index", 0))
                    if idx < len(plan):
                        step = plan[idx]
                        yield {
                            "type": "agent.step.start",
                            "step_number": step.get("step_number", idx + 1),
                            "operation": step.get("operation", ""),
                            "description": step.get("description", ""),
                            "total_steps": len(plan),
                        }
                    continue

                if event_name != "on_chain_end":
                    continue

                if node_name == "context_loader":
                    yield {"type": "agent.thinking", "message": "Loading dataset context..."}

                elif node_name == "intent_classifier":
                    intent = data.get("output", {}).get("intent", "")
                    yield {"type": "agent.thinking", "message": f"Intent: {intent}"}

                elif node_name == "planner":
                    plan = data.get("output", {}).get("plan", [])
                    plan_type = "dag" if any(step.get("depends_on") for step in plan) else "linear"
                    yield {
                        "type": "agent.plan",
                        "plan": plan,
                        "plan_type": plan_type,
                        "message": "Plan ready for approval",
                    }

                elif node_name == "plan_presenter":
                    output = data.get("output", {})
                    messages = output.get("messages", [])
                    plan_text = messages[-1].content if messages else ""
                    yield {"type": "agent.plan_presented", "text": plan_text}

                elif node_name == "clarify_step":
                    output = data.get("output", {})
                    out_messages = output.get("messages", [])
                    response_text = out_messages[-1].content if out_messages else output.get("final_response", "")
                    yield {
                        "type": "agent.done",
                        "response": response_text,
                        "intent": "clarify",
                    }

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
                            qr = last.get("query_results")
                            if isinstance(qr, list) and qr:
                                yield {
                                    "type": "agent.query_results",
                                    "results": qr,
                                    "step": last.get("step_number"),
                                    "operation": last.get("operation"),
                                    "session_table_name": last.get("session_table_name"),
                                }
                            yield {
                                "type": "agent.step.done",
                                "step": last.get("step_number"),
                                "operation": last.get("operation"),
                                "rows_affected": last.get("rows_affected"),
                                "row_count_before": last.get("row_count_before"),
                                "row_count_after": last.get("row_count_after"),
                                "execution_time_ms": last.get("execution_time_ms"),
                                "session_table_name": last.get("session_table_name"),
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
                    input_state = data.get("input", {})
                    output = data.get("output", {})
                    final = output.get("final_response", "")
                    messages = output.get("messages", [])
                    response_text = messages[-1].content if messages else final
                    yield {
                        "type": "agent.done",
                        "response": response_text,
                        "intent": input_state.get("intent", ""),
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
