from .state import AgentState


def _next_ready_step(plan: list, completed_step_numbers: list) -> int:
    """Return the index of the first step in *plan* that is ready to execute.

    A step is ready when every step listed in its ``depends_on`` field has
    already been completed.  For linear-compat (empty ``depends_on`` on a
    non-first step), the implicit dependency is the immediately preceding step.

    Returns -1 when no more steps are ready (pipeline finished).
    """
    completed = set(completed_step_numbers or [])
    for i, step in enumerate(plan):
        sn = step["step_number"]
        if sn in completed:
            continue  # already done
        deps = set(step.get("depends_on") or [])
        # Linear-compat: non-first step with no explicit deps implicitly
        # depends on the step that precedes it in the plan list.
        if not deps and i > 0:
            deps = {plan[i - 1]["step_number"]}
        if deps.issubset(completed):
            return i
    return -1


# All intents that require the planner to generate a SQL plan.
_PLANNING_INTENTS = {
    "clean", "filter", "transform", "add_column", "pivot",
    "union", "join", "reconcile", "sql_query", "visualise", "export",
    "validate", "summarise",
}


def route_intent(state: AgentState) -> str:
    # Resume path: plan already approved — skip planning nodes entirely.
    if state.get("plan_approved"):
        return "execute_step"
    intent = state.get("intent", "converse")
    if intent == "clarify":
        return "clarify_step"
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

    plan = state.get("plan", [])
    completed = state.get("completed_step_numbers", [])

    if _next_ready_step(plan, completed) >= 0:
        return "execute_step"
    return "pipeline_recorder"


def route_after_reflect(state: AgentState) -> str:
    if state.get("retry_count", 0) >= 3:
        return "pipeline_recorder"
    return "execute_step"
