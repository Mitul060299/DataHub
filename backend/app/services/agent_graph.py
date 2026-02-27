from __future__ import annotations

from typing import Any, TypedDict

from sqlalchemy.orm import Session

from .ai_agent_service import AIAgentService

try:
    from langgraph.graph import END, StateGraph
except Exception:
    END = None
    StateGraph = None


class AgentGraphState(TypedDict, total=False):
    dataset_id: str
    message: str
    conversation_history: list[dict[str, Any]]
    response: str
    transformation: dict[str, Any] | None
    needs_confirmation: bool
    plan: list[str]
    artifact: dict[str, Any] | None
    error: str | None


class AgentGraphService:
    _compiled_graph = None

    @classmethod
    def _compile_graph(cls):
        if cls._compiled_graph is not None:
            return cls._compiled_graph
        if StateGraph is None or END is None:
            return None

        graph = StateGraph(AgentGraphState)
        graph.add_node("plan_step", cls._node_plan)
        graph.add_node("safety_step", cls._node_safety)
        graph.add_node("artifact_step", cls._node_artifact)
        graph.add_node("finalize_step", cls._node_finalize)
        graph.set_entry_point("plan_step")
        graph.add_edge("plan_step", "safety_step")
        graph.add_edge("safety_step", "artifact_step")
        graph.add_edge("artifact_step", "finalize_step")
        graph.add_edge("finalize_step", END)

        cls._compiled_graph = graph.compile()
        return cls._compiled_graph

    @staticmethod
    def _node_plan(state: AgentGraphState) -> AgentGraphState:
        db: Session | None = state.get("_db")  # type: ignore[assignment]
        if db is None:
            return {
                "error": "Database session is unavailable.",
                "response": "Unable to process request right now.",
                "transformation": None,
                "needs_confirmation": False,
            }

        try:
            payload = AIAgentService.process_command(
                dataset_id=state["dataset_id"],
                user_message=state["message"],
                conversation_history=state.get("conversation_history", []),
                db=db,
            )
        except Exception as exc:
            return {
                "error": str(exc),
                "response": f"Agent planning failed: {str(exc)}",
                "transformation": None,
                "needs_confirmation": False,
                "plan": [],
                "artifact": None,
            }

        transformation = payload.get("transformation") if isinstance(payload.get("transformation"), dict) else None
        plan = AgentGraphService._build_plan(state.get("message", ""), transformation)

        return {
            "response": str(payload.get("response") or ""),
            "transformation": transformation,
            "needs_confirmation": bool(payload.get("needsConfirmation", False)),
            "plan": plan,
            "artifact": None,
            "error": None,
        }

    @staticmethod
    def _node_safety(state: AgentGraphState) -> AgentGraphState:
        transformation = state.get("transformation")
        if not isinstance(transformation, dict):
            return {}

        operation = str(transformation.get("operation") or "").lower()
        destructive_ops = {"drop_columns", "delete_rows", "truncate", "overwrite"}
        if operation in destructive_ops:
            existing = str(state.get("response") or "").strip()
            safety_note = "This action may be destructive. Please confirm before applying."
            next_response = f"{existing}\n\n{safety_note}" if existing else safety_note
            return {
                "response": next_response,
                "needs_confirmation": True,
            }

        return {}

    @staticmethod
    def _node_artifact(state: AgentGraphState) -> AgentGraphState:
        message = (state.get("message") or "").lower()
        wants_report = any(token in message for token in ["report", "doc", "documentation", "summary note"])
        if not wants_report:
            return {}

        plan = state.get("plan") or []
        transformation = state.get("transformation")
        response = state.get("response") or ""

        lines = [
            "# DataHub Agent Report",
            "",
            "## Request",
            state.get("message") or "",
            "",
            "## Plan",
        ]
        if plan:
            lines.extend([f"- {step}" for step in plan])
        else:
            lines.append("- No explicit plan was generated.")

        lines.extend(["", "## Agent Response", response or "No response generated."])

        if isinstance(transformation, dict):
            lines.extend([
                "",
                "## Proposed Transformation",
                f"- Operation: {transformation.get('operation', 'unknown')}",
                f"- Description: {transformation.get('description', 'n/a')}",
                f"- Requires confirmation: {'Yes' if state.get('needs_confirmation') else 'No'}",
            ])

        markdown = "\n".join(lines).strip()
        artifact = {
            "type": "markdown",
            "title": "DataHub Agent Report",
            "content": markdown,
        }

        return {
            "artifact": artifact,
            "response": f"{response}\n\nI also generated a report artifact for this request.".strip(),
        }

    @staticmethod
    def _node_finalize(state: AgentGraphState) -> AgentGraphState:
        if state.get("error"):
            return {
                "response": state.get("response") or state["error"] or "Failed to process request.",
                "transformation": None,
                "needs_confirmation": False,
            }
        return {}

    @staticmethod
    def _build_plan(message: str, transformation: dict[str, Any] | None) -> list[str]:
        base_plan = [
            "Understand user intent",
            "Validate dataset context",
            "Generate safe transformation strategy",
        ]
        if isinstance(transformation, dict):
            base_plan.append("Return transformation preview for user confirmation")
        else:
            base_plan.append("Return analysis/Q&A response")

        lowered = (message or "").lower()
        if any(token in lowered for token in ["report", "doc", "documentation", "summary"]):
            base_plan.append("Generate markdown report artifact")

        return base_plan

    @classmethod
    def process_command(
        cls,
        dataset_id: str,
        user_message: str,
        conversation_history: list[dict[str, Any]],
        db: Session,
    ) -> dict[str, Any]:
        try:
            compiled = cls._compile_graph()
        except Exception:
            compiled = None

        initial_state: AgentGraphState = {
            "dataset_id": dataset_id,
            "message": user_message,
            "conversation_history": conversation_history,
            "response": "",
            "transformation": None,
            "needs_confirmation": False,
            "error": None,
        }
        initial_state["_db"] = db  # type: ignore[index]

        if compiled is None:
            try:
                payload = AIAgentService.process_command(dataset_id, user_message, conversation_history, db)
            except Exception as exc:
                return {
                    "response": f"Agent execution failed: {str(exc)}",
                    "transformation": None,
                    "needsConfirmation": False,
                    "plan": [],
                    "artifact": None,
                }
            return {
                "response": payload.get("response") or "",
                "transformation": payload.get("transformation"),
                "needsConfirmation": bool(payload.get("needsConfirmation", False)),
                "plan": cls._build_plan(user_message, payload.get("transformation") if isinstance(payload.get("transformation"), dict) else None),
                "artifact": None,
            }

        try:
            result = compiled.invoke(initial_state)
            return {
                "response": str(result.get("response") or ""),
                "transformation": result.get("transformation") if isinstance(result.get("transformation"), dict) else None,
                "needsConfirmation": bool(result.get("needs_confirmation", False)),
                "plan": result.get("plan") if isinstance(result.get("plan"), list) else [],
                "artifact": result.get("artifact") if isinstance(result.get("artifact"), dict) else None,
            }
        except Exception as exc:
            return {
                "response": f"Agent execution failed: {str(exc)}",
                "transformation": None,
                "needsConfirmation": False,
                "plan": [],
                "artifact": None,
            }
