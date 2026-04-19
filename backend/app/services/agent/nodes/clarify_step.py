import asyncio
import logging
import os

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_groq import ChatGroq

from ..state import AgentState
from .planner import _dumps

_log = logging.getLogger(__name__)

_llm: ChatGroq | None = None


def _get_llm() -> ChatGroq:
    global _llm
    if _llm is None:
        _llm = ChatGroq(
            model=os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"),
            temperature=0.3,
            groq_api_key=os.getenv("GROQ_API_KEY"),
        )
    return _llm

CLARIFY_PROMPT = """You are a helpful data analyst assistant. The user's request needs one clarifying question before you can proceed.

DATASET SCHEMA:
{schema}

SESSION TABLES:
{table_registry}

USER REQUEST:
{user_goal}

Generate EXACTLY ONE short, specific clarifying question that would allow you to proceed.
Rules:
- Maximum 2 sentences
- Always suggest 2-3 concrete examples in the question
- Never ask about something already visible in the schema
- Be conversational, not robotic
- End with a question mark

Examples of good clarifying questions:
"Which column should I filter by? For example: region, product_type, or outcome?"
"I found 3 tables — sales_data, sales_2023, and sales_q1. Which one would you like me to clean?"
"Should I summarise by a specific column, or show overall totals? For example: by region, by industry, or by month?"

Respond with ONLY the question, nothing else."""


async def clarify_step(state: AgentState) -> dict:
    messages = state.get("messages", [])
    user_goal = messages[-1].content if messages else ""

    prompt = CLARIFY_PROMPT.format(
        schema=_dumps(state.get("schema", {})),
        table_registry=_dumps(state.get("table_registry", {})),
        user_goal=user_goal,
    )

    try:
        response = await asyncio.wait_for(
            _get_llm().ainvoke([
                SystemMessage(content=prompt),
                HumanMessage(content=user_goal),
            ]),
            timeout=30,
        )
        question = str(response.content).strip()
    except asyncio.TimeoutError:
        _log.warning("clarify_step LLM timed out")
        question = "Could you give me a bit more detail about what you'd like to do?"
    except Exception as exc:
        _log.error("clarify_step LLM error: %s", exc)
        question = "Could you give me a bit more detail about what you'd like to do?"

    return {
        "messages": [AIMessage(content=question)],
        "final_response": question,
        "needs_clarification": True,
    }
