import json
import os

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_groq import ChatGroq

from ..prompts import INTENT_CLASSIFIER_PROMPT
from ..state import AgentState

_llm = ChatGroq(
    model=os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"),
    temperature=0,
    groq_api_key=os.getenv("GROQ_API_KEY"),
)

VALID_INTENTS = {
    "clean", "validate", "filter", "transform", "add_column",
    "summarise", "pivot", "union", "join", "reconcile",
    "sql_query", "visualise", "export", "converse",
}

# Intents that go directly to execute_step without planner/plan_presenter
AUTO_EXECUTE_INTENTS = {"validate", "summarise"}


async def intent_classifier(state: AgentState) -> dict:
    messages = state.get("messages", [])
    last_message = messages[-1].content if messages else ""

    prompt = INTENT_CLASSIFIER_PROMPT.format(
        table_registry=json.dumps(state.get("table_registry", {}), indent=2),
    )

    response = await _llm.ainvoke(
        [
            SystemMessage(content=prompt),
            HumanMessage(content=last_message),
        ]
    )

    intent = str(response.content).strip().lower()
    if intent not in VALID_INTENTS:
        intent = "converse"

    return {"intent": intent, "plan_approved": intent in AUTO_EXECUTE_INTENTS}
