from .state import AgentState


# Intents that skip the planner and straight to execute_step (read-only / auto)
_AUTO_EXECUTE = {"validate", "summarise"}
# All planning intents that need the planner + plan_presenter gate
_PLANNING_INTENTS = {
    "clean", "filter", "transform", "add_column", "pivot",
    "union", "join", "reconcile", "sql_query", "visualise", "export",
}


def route_intent(state: AgentState) -> str:
    intent = state.get("intent", "converse")
    if intent in _AUTO_EXECUTE:
        return "execute_step"
    if intent in _PLANNING_INTENTS:
        return "planner"
    return "responder"


def route_after_present(state: AgentState) -> str:
    if state.get("plan_approved"):
        return "execute_step"
    return "__end__"


def route_after_execute(state: AgentState) -> str:
    last_results = state.get("execution_results", [])
    last_result = last_results[-1] if last_results else {}

    if last_result.get("error"):
        return "reflect"

    idx = state.get("current_step_index", 0)
    plan = state.get("plan", [])

    if idx < len(plan):
        return "execute_step"
    return "pipeline_recorder"


def route_after_reflect(state: AgentState) -> str:
    if state.get("retry_count", 0) >= 3:
        return "pipeline_recorder"
    return "execute_step"
