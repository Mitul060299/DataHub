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

VALID_INTENTS = {"transform", "add_column", "sql_query", "visualise", "join", "converse"}


async def intent_classifier(state: AgentState) -> dict:
    messages = state.get("messages", [])
    last_message = messages[-1].content if messages else ""

    response = await _llm.ainvoke(
        [
            SystemMessage(content=INTENT_CLASSIFIER_PROMPT),
            HumanMessage(content=last_message),
        ]
    )

    intent = str(response.content).strip().lower()
    if intent not in VALID_INTENTS:
        intent = "converse"

    return {"intent": intent}
