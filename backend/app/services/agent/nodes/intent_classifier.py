import asyncio
import json
import os

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_groq import ChatGroq

from ..prompts import INTENT_CLASSIFIER_PROMPT
from ..state import AgentState
from .planner import _dumps

_llm = ChatGroq(
    model=os.getenv("GROQ_INTENT_MODEL", "llama-3.1-8b-instant"),
    temperature=0,
    groq_api_key=os.getenv("GROQ_API_KEY"),
)

VALID_INTENTS = {
    "clean", "validate", "filter", "transform", "add_column",
    "summarise", "pivot", "union", "join", "reconcile",
    "sql_query", "visualise", "export", "converse", "clarify",
}


async def intent_classifier(state: AgentState) -> dict:
    messages = state.get("messages", [])
    last_message = messages[-1].content if messages else ""

    prompt = INTENT_CLASSIFIER_PROMPT.format(
        table_registry=_dumps(state.get("table_registry", {})),
    )

    try:
        response = await asyncio.wait_for(
            _llm.ainvoke(
                [
                    SystemMessage(content=prompt),
                    HumanMessage(content=last_message),
                ]
            ),
            timeout=15,
        )
        intent = str(response.content).strip().lower()
    except asyncio.TimeoutError:
        import logging
        logging.getLogger(__name__).warning("intent_classifier timed out, defaulting to converse")
        intent = "converse"
    except Exception as exc:
        import logging
        logging.getLogger(__name__).error("intent_classifier LLM error: %s", exc)
        intent = "converse"
    if intent not in VALID_INTENTS:
        intent = "converse"

    # Never overwrite plan_approved=True that was set by the resume path.
    return {"intent": intent}
