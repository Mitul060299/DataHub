import asyncio
import json
import logging

from langchain_core.messages import HumanMessage, SystemMessage

from ...llm_provider import get_chat_model

from ..model_router import select_model
from ..prompts import INTENT_CLASSIFIER_PROMPT
from ..state import AgentState
from .planner import _dumps
from ...token_tracking_service import log_call as _log_call

_logger = logging.getLogger(__name__)

_llm_cache: dict = {}


def _get_llm():
    model = select_model("classify")
    cached = _llm_cache.get(model)
    if cached is None:
        cached = get_chat_model(model=model, temperature=0)
        _llm_cache[model] = cached
    return cached

VALID_INTENTS = {
    "clean", "validate", "filter", "transform", "add_column",
    "summarise", "pivot", "union", "join", "reconcile",
    "sql_query", "visualise", "export", "converse", "clarify",
    "goal", "analyse", "predict",
}


async def intent_classifier(state: AgentState) -> dict:
    messages = state.get("messages", [])
    last_message = messages[-1].content if messages else ""
    _user_id: str = state.get("user_id", "")
    _session_id: str = state.get("session_id", "")
    _model: str = select_model("classify")

    prompt = INTENT_CLASSIFIER_PROMPT.format(
        table_registry=_dumps(state.get("table_registry", {})),
    )

    _input_tok = _output_tok = 0
    try:
        response = await asyncio.wait_for(
            _get_llm().ainvoke(
                [
                    SystemMessage(content=prompt),
                    HumanMessage(content=last_message),
                ]
            ),
            timeout=15,
        )
        intent = str(response.content).strip().lower()
        _um = getattr(response, "usage_metadata", None) or {}
        _input_tok = _um.get("input_tokens", 0)
        _output_tok = _um.get("output_tokens", 0)
    except asyncio.TimeoutError:
        _logger.warning("intent_classifier timed out, defaulting to converse")
        intent = "converse"
    except Exception as exc:
        _logger.error("intent_classifier LLM error: %s", exc)
        intent = "converse"
    finally:
        _log_call(
            user_id=_user_id,
            session_id=_session_id,
            model_used=_model,
            query_type="classify",
            input_tokens=_input_tok,
            output_tokens=_output_tok,
        )
    if intent not in VALID_INTENTS:
        _logger.warning("INTENT_INVALID: raw=%s, defaulting to converse", intent)
        intent = "converse"

    _logger.info("INTENT_CLASSIFIED: intent=%s message=%s", intent, last_message[:100])

    # Never overwrite plan_approved=True that was set by the resume path.
    return {"intent": intent}
