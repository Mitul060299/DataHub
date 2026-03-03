from langchain_core.messages import AIMessage

from ..state import AgentState


async def plan_presenter(state: AgentState) -> dict:
    plan = state.get("plan", [])

    if not plan:
        return {
            "messages": [AIMessage(content="I couldn't generate a plan for that request. Could you be more specific?")],
            "final_response": "Could not generate a plan.",
        }

    lines = ["Here's what I'll do:\n"]
    for step in plan:
        lines.append(
            f"**Step {step['step_number']}: {step['operation'].replace('_', ' ').title()}**\n"
            f"{step['description']}\n"
            f"*Estimated: {step['estimated_rows']}*\n"
        )
    lines.append("\nShall I proceed? Click **Approve** to run all steps, or **Reject** to cancel.")

    return {
        "messages": [AIMessage(content="\n".join(lines))],
    }
