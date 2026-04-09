from langchain_core.messages import AIMessage

from ..state import AgentState


def _is_branching(plan: list) -> bool:
    """Return True if any step has a non-empty depends_on list (DAG plan)."""
    return any(step.get("depends_on") for step in plan)


async def plan_presenter(state: AgentState) -> dict:
    plan = state.get("plan", [])

    if not plan:
        return {
            "messages": [AIMessage(content="I couldn't generate a plan for that request. Could you be more specific?")],
            "final_response": "Could not generate a plan.",
        }

    branching = _is_branching(plan)

    if branching:
        lines = ["Here's my branching pipeline — steps can have multiple independent paths:\n"]
    else:
        lines = ["Here's what I'll do:\n"]

    for step in plan:
        deps_note = ""
        if step.get("depends_on"):
            dep_labels = ", ".join(f"Step {d}" for d in step["depends_on"])
            deps_note = f"\n*Depends on: {dep_labels}*"
        lines.append(
            f"**Step {step['step_number']}: {step['operation'].replace('_', ' ').title()}**\n"
            f"{step['description']}\n"
            f"*Estimated: {step['estimated_rows']}*{deps_note}\n"
        )
    lines.append("\nClick **Approve** to run, **Modify** to change specific steps, or **Reject** to cancel.")

    return {
        "messages": [AIMessage(content="\n".join(lines))],
        "plan_type": "dag" if branching else "linear",
    }
