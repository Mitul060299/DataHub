import json
import os

from langchain_core.messages import AIMessage, HumanMessage
from langchain_groq import ChatGroq

from ..prompts import RESPONDER_CONVERSE_PROMPT, RESPONDER_TRANSFORM_PROMPT
from ..state import AgentState

_llm = ChatGroq(
    model=os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"),
    temperature=0.3,
    groq_api_key=os.getenv("GROQ_API_KEY"),
)


async def responder(state: AgentState) -> dict:
    intent = state.get("intent", "converse")
    messages = state.get("messages", [])
    user_goal = messages[-1].content if messages else ""

    if intent == "converse":
        prompt = RESPONDER_CONVERSE_PROMPT.format(message=user_goal)
        response = await _llm.ainvoke([HumanMessage(content=prompt)])
        final = str(response.content)

    elif intent in ("transform", "sql_query", "join"):
        results = state.get("execution_results", [])
        successful = [result for result in results if result["success"]]
        failed = [result for result in results if not result["success"]]

        if not results:
            final = "The plan was not approved or could not be executed."
        else:
            prompt = RESPONDER_TRANSFORM_PROMPT.format(
                results=json.dumps(successful, indent=2),
                goal=user_goal,
            )
            response = await _llm.ainvoke([HumanMessage(content=prompt)])
            final = str(response.content)
            if failed:
                final += f"\n\n⚠️ {len(failed)} step(s) could not be completed after retrying."

    elif intent == "visualise":
        chart = state.get("chart_config")
        if chart:
            final = (
                "Here's your chart. I've generated a "
                f"{chart.get('type', 'bar')} chart showing {chart.get('title', 'your data')}."
            )
        else:
            final = "I've prepared the chart configuration based on your data."

    else:
        final = "Done."

    return {
        "messages": [AIMessage(content=final)],
        "final_response": final,
    }
