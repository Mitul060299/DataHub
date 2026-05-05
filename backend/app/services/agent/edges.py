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


def route_after_present_unified(state: AgentState) -> str:
    """Unified post-plan_presenter routing used by both manual and auto paths.

    Waiting for approval in both cases: __end__ (graph suspends at checkpoint)
    Both paths resume to the same execute_step node.
    """
    if not state.get("plan_approved"):
        return "__end__"
    return "execute_step"


def route_after_execute(state: AgentState) -> str:
    """Unified post-execute routing for both manual and auto paths."""
    last_results = state.get("execution_results", [])
    last_result = last_results[-1] if last_results else {}

    if state.get("auto_mode"):
        # Auto path: use current_rule_index + auto_plan
        if last_result.get("error"):
            return "reflection_v2"
        auto_plan = state.get("auto_plan", [])
        current_idx = state.get("current_rule_index", 0)
        next_idx = current_idx + 1
        if next_idx < len(auto_plan):
            step = auto_plan[next_idx]
            if step.get("needs_validator", True):
                return "step_validator"
            return "execute_step"
        return "goal_verifier"

    # Manual path: use current_step_index + plan
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


# ---------------------------------------------------------------------------
# Auto Mode routing helpers
# ---------------------------------------------------------------------------

def route_intent_auto(state: AgentState) -> str:
    """Branch after intent_classifier: route to auto pipeline when needed.

    The auto (goal) path is taken when:
    - The endpoint explicitly set auto_mode=True (legacy /api/auto/run), OR
    - The intent classifier returned "goal" (multi-rule request via chat)
    """
    intent = state.get("intent", "converse")
    if state.get("auto_mode") or intent == "goal":
        # Inject auto_mode flag so downstream auto nodes behave correctly
        state["auto_mode"] = True  # type: ignore[index]
        # Resume path: plan was already built and approved — jump straight to
        # execution without re-running goal_parser / auto_planner.
        if state.get("plan_approved") and state.get("auto_plan"):
            return "execute_step"
        if state.get("prior_pipeline"):
            return "prior_pipeline_parser"
        return "goal_parser"
    return route_intent(state)


def route_after_goal_parser(state: AgentState) -> str:
    """After goal_parser: run drift detector if expectations exist, else plan."""
    if state.get("inferred_expectations") or state.get("expected_profile"):
        return "drift_detector"
    return "auto_planner"


def route_after_prior_pipeline_parser(state: AgentState) -> str:
    """After parsing prior pipeline: run drift detector before planning."""
    return "drift_detector"


def route_after_drift_detector(state: AgentState) -> str:
    return "auto_planner"


def route_after_auto_plan_presenter(state: AgentState) -> str:
    """Kept for import compatibility — superseded by route_after_present_unified."""
    return route_after_present_unified(state)


def route_after_execute_auto(state: AgentState) -> str:
    """Kept for import compatibility — superseded by route_after_execute."""
    return route_after_execute(state)


def route_after_step_validator(state: AgentState) -> str:
    """After DQ assertion: passed → next step / advance; failed → reflect."""
    last_val = state.get("last_validation") or {}
    if last_val.get("passed", True):
        auto_plan = state.get("auto_plan", [])
        current_idx = state.get("current_rule_index", 0) + 1
        if current_idx < len(auto_plan):
            return "execute_step"
        return "goal_verifier"
    return "reflection_v2"


def route_after_reflection_v2(state: AgentState) -> str:
    """After reflection attempt: retry step or escalate to interrupt_asker."""
    if state.get("interrupt_pending"):
        return "interrupt_asker"
    return "execute_step"


def route_after_goal_verifier(state: AgentState) -> str:
    """After final goal check: done (pipeline_recorder) or re-plan (auto_planner) or interrupt."""
    replan_rules = state.get("_verifier_trigger_replan") or []
    if replan_rules:
        return "auto_planner"
    if state.get("interrupt_pending"):
        return "interrupt_asker"
    return "pipeline_recorder"

