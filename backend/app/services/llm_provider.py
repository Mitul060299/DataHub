"""LLM abstraction layer for DataHub.

All LLM calls MUST go through this module — no other file should import
from langchain_groq, langchain_openai, langchain_anthropic, or groq directly.

Swap providers by setting the LLM_PROVIDER environment variable:
  - "groq"      → Groq API (default)
  - "openai"    → OpenAI API
  - "anthropic" → Anthropic API

No other code needs to change when the provider changes.
"""
from __future__ import annotations

import json as _json
import logging
import time
from typing import Any, AsyncIterator

import httpx
from langchain_core.language_models import BaseChatModel

from ..config import settings
from .token_tracking_service import log_call as _log_call

_logger = logging.getLogger(__name__)


# ── Provider helpers ───────────────────────────────────────────────────────────

def _default_model() -> str:
    """Return the default model name for the configured provider."""
    provider = settings.llm_provider.lower()
    if provider == "groq":
        return settings.groq_model
    if provider == "openai":
        return settings.openai_model
    if provider == "anthropic":
        return settings.anthropic_model
    raise ValueError(
        f"Unsupported LLM_PROVIDER: {provider!r}. Valid values: groq, openai, anthropic"
    )


def get_default_model() -> str:
    """Public alias — use when a model name is needed outside this module."""
    return _default_model()


def _openai_compat_base_url() -> str:
    provider = settings.llm_provider.lower()
    if provider == "groq":
        return settings.groq_base_url
    if provider == "openai":
        return settings.openai_base_url
    raise ValueError(f"Provider {provider!r} is not OpenAI-compatible.")


def _openai_compat_api_key() -> str:
    provider = settings.llm_provider.lower()
    if provider == "groq":
        return settings.groq_api_key
    if provider == "openai":
        return settings.openai_api_key
    raise ValueError(f"Provider {provider!r} does not use an OpenAI-compatible API key.")


# ── Public function 1: LangChain model factory ────────────────────────────────

def get_chat_model(model: str | None = None, temperature: float = 0.2) -> BaseChatModel:
    """Return a LangChain chat model for the currently configured LLM provider.

    Replaces direct ``ChatGroq(...)`` instantiation throughout the codebase.
    Swap the provider by changing ``LLM_PROVIDER`` — no other code changes needed.

    Args:
        model:       Model identifier. Defaults to the provider's configured default.
        temperature: Sampling temperature (0.0–1.0).
    """
    provider = settings.llm_provider.lower()
    resolved = model or _default_model()

    if provider == "groq":
        from langchain_groq import ChatGroq
        return ChatGroq(
            model=resolved,
            temperature=temperature,
            groq_api_key=settings.groq_api_key,
        )
    if provider == "openai":
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(
            model=resolved,
            temperature=temperature,
            openai_api_key=settings.openai_api_key,
            base_url=settings.openai_base_url,
        )
    if provider == "anthropic":
        from langchain_anthropic import ChatAnthropic
        return ChatAnthropic(
            model=resolved,
            temperature=temperature,
            anthropic_api_key=settings.anthropic_api_key,
        )
    raise ValueError(
        f"Unsupported LLM_PROVIDER: {provider!r}. Valid values: groq, openai, anthropic"
    )


# ── Public function 2: Async non-streaming completion ─────────────────────────

async def complete(
    messages: list[dict[str, Any]],
    *,
    model: str | None = None,
    temperature: float = 0.2,
    json_mode: bool = False,
    timeout: float = 30.0,
    call_type: str = "chat",
    user_id: str = "",
    dataset_rows: int = 0,
) -> tuple[str, int, int]:
    """Send a chat completion and return ``(content, input_tokens, output_tokens)``.

    Logs token usage via ``token_tracking_service`` automatically.
    """
    provider = settings.llm_provider.lower()
    resolved = model or _default_model()
    t0 = time.monotonic()

    content, in_tok, out_tok = await _dispatch_async(
        provider=provider,
        model=resolved,
        messages=messages,
        temperature=temperature,
        json_mode=json_mode,
        timeout=timeout,
        max_tokens=None,
    )

    _logger.debug(
        "llm.complete provider=%s model=%s latency_ms=%d in=%d out=%d",
        provider, resolved, int((time.monotonic() - t0) * 1000), in_tok, out_tok,
    )
    _log_call(
        user_id=user_id,
        model_used=resolved,
        query_type=call_type,
        input_tokens=in_tok,
        output_tokens=out_tok,
        dataset_rows=dataset_rows,
    )
    return content, in_tok, out_tok


# ── Public function 3: Sync non-streaming completion ──────────────────────────

def complete_sync(
    messages: list[dict[str, Any]],
    *,
    model: str | None = None,
    temperature: float = 0.2,
    json_mode: bool = False,
    timeout: float = 30.0,
    call_type: str = "chat",
    user_id: str = "",
    dataset_rows: int = 0,
) -> tuple[str, int, int]:
    """Synchronous version of :func:`complete`. For use in non-async callers.

    Returns ``(content, input_tokens, output_tokens)``.
    """
    provider = settings.llm_provider.lower()
    resolved = model or _default_model()
    t0 = time.monotonic()

    content, in_tok, out_tok = _dispatch_sync(
        provider=provider,
        model=resolved,
        messages=messages,
        temperature=temperature,
        json_mode=json_mode,
        timeout=timeout,
    )

    _logger.debug(
        "llm.complete_sync provider=%s model=%s latency_ms=%d in=%d out=%d",
        provider, resolved, int((time.monotonic() - t0) * 1000), in_tok, out_tok,
    )
    _log_call(
        user_id=user_id,
        model_used=resolved,
        query_type=call_type,
        input_tokens=in_tok,
        output_tokens=out_tok,
        dataset_rows=dataset_rows,
    )
    return content, in_tok, out_tok


# ── Public function 4: Tool-calling completion (full_auto_agent) ──────────────

async def complete_with_tools(
    messages: list[dict[str, Any]],
    tools: list[dict[str, Any]],
    *,
    model: str | None = None,
    temperature: float = 0.7,
    max_tokens: int = 2000,
    timeout: float = 30.0,
    call_type: str = "tool_call",
    user_id: str = "",
) -> dict[str, Any]:
    """Send a tool-calling completion and return the raw ``choices[0].message`` dict.

    Only supported for OpenAI-compatible providers (groq, openai).
    Returns a plain dict — callers must read ``tool_calls`` as a list of dicts,
    not SDK objects.
    """
    provider = settings.llm_provider.lower()
    if provider not in ("groq", "openai"):
        raise NotImplementedError(
            f"Tool calling is not yet supported for provider {provider!r}. "
            "Set LLM_PROVIDER=groq or LLM_PROVIDER=openai."
        )
    resolved = model or _default_model()
    t0 = time.monotonic()

    body: dict[str, Any] = {
        "model": resolved,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "tools": tools,
        "tool_choice": "auto",
    }
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(
            f"{_openai_compat_base_url()}/chat/completions",
            headers={
                "Authorization": f"Bearer {_openai_compat_api_key()}",
                "Content-Type": "application/json",
            },
            json=body,
        )
        resp.raise_for_status()
        data = resp.json()

    usage = data.get("usage") or {}
    in_tok = usage.get("prompt_tokens", 0)
    out_tok = usage.get("completion_tokens", 0)

    _logger.debug(
        "llm.complete_with_tools provider=%s model=%s latency_ms=%d in=%d out=%d",
        provider, resolved, int((time.monotonic() - t0) * 1000), in_tok, out_tok,
    )
    _log_call(
        user_id=user_id,
        model_used=resolved,
        query_type=call_type,
        input_tokens=in_tok,
        output_tokens=out_tok,
    )
    return data["choices"][0]["message"]


# ── Public function 5: Async streaming completion ─────────────────────────────

async def stream_complete(
    messages: list[dict[str, Any]],
    *,
    model: str | None = None,
    temperature: float = 0.3,
    max_tokens: int = 600,
    timeout: float = 30.0,
) -> AsyncIterator[str]:
    """Stream a chat completion, yielding raw content delta strings.

    The caller is responsible for SSE formatting. Supports all providers.
    """
    provider = settings.llm_provider.lower()
    resolved = model or _default_model()

    if provider in ("groq", "openai"):
        async for delta in _stream_openai_compat(
            messages=messages,
            model=resolved,
            temperature=temperature,
            max_tokens=max_tokens,
            timeout=timeout,
        ):
            yield delta
    elif provider == "anthropic":
        async for delta in _stream_anthropic(
            messages=messages,
            model=resolved,
            temperature=temperature,
            max_tokens=max_tokens,
            timeout=timeout,
        ):
            yield delta
    else:
        raise ValueError(
            f"Unsupported LLM_PROVIDER: {provider!r}. Valid values: groq, openai, anthropic"
        )


# ── Internal: async dispatch ───────────────────────────────────────────────────

async def _dispatch_async(
    *,
    provider: str,
    model: str,
    messages: list[dict[str, Any]],
    temperature: float,
    json_mode: bool,
    timeout: float,
    max_tokens: int | None,
) -> tuple[str, int, int]:
    if provider in ("groq", "openai"):
        body: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
        }
        if json_mode:
            body["response_format"] = {"type": "json_object"}
        if max_tokens:
            body["max_tokens"] = max_tokens

        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(
                f"{_openai_compat_base_url()}/chat/completions",
                headers={
                    "Authorization": f"Bearer {_openai_compat_api_key()}",
                    "Content-Type": "application/json",
                },
                json=body,
            )
            resp.raise_for_status()
            data = resp.json()

        content = data["choices"][0]["message"].get("content") or ""
        usage = data.get("usage") or {}
        return content, usage.get("prompt_tokens", 0), usage.get("completion_tokens", 0)

    if provider == "anthropic":
        system_msg = ""
        user_messages: list[dict[str, Any]] = []
        for m in messages:
            if m["role"] == "system":
                system_msg = m["content"]
            else:
                user_messages.append(m)
        body = {
            "model": model,
            "max_tokens": max_tokens or 4096,
            "messages": user_messages,
            "temperature": temperature,
        }
        if system_msg:
            body["system"] = system_msg

        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": settings.anthropic_api_key,
                    "anthropic-version": "2023-06-01",
                    "Content-Type": "application/json",
                },
                json=body,
            )
            resp.raise_for_status()
            data = resp.json()

        blocks = data.get("content") or []
        content = "".join(b.get("text", "") for b in blocks if b.get("type") == "text")
        usage = data.get("usage") or {}
        return content, usage.get("input_tokens", 0), usage.get("output_tokens", 0)

    raise ValueError(
        f"Unsupported LLM_PROVIDER: {provider!r}. Valid values: groq, openai, anthropic"
    )


# ── Internal: sync dispatch ────────────────────────────────────────────────────

def _dispatch_sync(
    *,
    provider: str,
    model: str,
    messages: list[dict[str, Any]],
    temperature: float,
    json_mode: bool,
    timeout: float,
) -> tuple[str, int, int]:
    if provider in ("groq", "openai"):
        body: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
        }
        if json_mode:
            body["response_format"] = {"type": "json_object"}

        response = httpx.post(
            f"{_openai_compat_base_url()}/chat/completions",
            headers={
                "Authorization": f"Bearer {_openai_compat_api_key()}",
                "Content-Type": "application/json",
            },
            json=body,
            timeout=timeout,
        )
        response.raise_for_status()
        data = response.json()
        content = data["choices"][0]["message"].get("content") or ""
        usage = data.get("usage") or {}
        return content, usage.get("prompt_tokens", 0), usage.get("completion_tokens", 0)

    if provider == "anthropic":
        system_msg = ""
        user_messages: list[dict[str, Any]] = []
        for m in messages:
            if m["role"] == "system":
                system_msg = m["content"]
            else:
                user_messages.append(m)
        body = {
            "model": model,
            "max_tokens": 4096,
            "messages": user_messages,
            "temperature": temperature,
        }
        if system_msg:
            body["system"] = system_msg

        response = httpx.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": settings.anthropic_api_key,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
            },
            json=body,
            timeout=timeout,
        )
        response.raise_for_status()
        data = response.json()
        blocks = data.get("content") or []
        content = "".join(b.get("text", "") for b in blocks if b.get("type") == "text")
        usage = data.get("usage") or {}
        return content, usage.get("input_tokens", 0), usage.get("output_tokens", 0)

    raise ValueError(
        f"Unsupported LLM_PROVIDER: {provider!r}. Valid values: groq, openai, anthropic"
    )


# ── Internal: streaming helpers ────────────────────────────────────────────────

async def _stream_openai_compat(
    *,
    messages: list[dict[str, Any]],
    model: str,
    temperature: float,
    max_tokens: int,
    timeout: float,
) -> AsyncIterator[str]:
    payload = {
        "model": model,
        "messages": messages,
        "stream": True,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    async with httpx.AsyncClient(timeout=timeout) as client:
        async with client.stream(
            "POST",
            f"{_openai_compat_base_url()}/chat/completions",
            headers={
                "Authorization": f"Bearer {_openai_compat_api_key()}",
                "Content-Type": "application/json",
            },
            json=payload,
        ) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line.startswith("data: "):
                    continue
                raw = line[6:].strip()
                if raw == "[DONE]":
                    return
                try:
                    chunk = _json.loads(raw)
                    delta = chunk["choices"][0]["delta"].get("content", "")
                    if delta:
                        yield delta
                except Exception:
                    continue


async def _stream_anthropic(
    *,
    messages: list[dict[str, Any]],
    model: str,
    temperature: float,
    max_tokens: int,
    timeout: float,
) -> AsyncIterator[str]:
    system_msg = ""
    user_messages: list[dict[str, Any]] = []
    for m in messages:
        if m["role"] == "system":
            system_msg = m["content"]
        else:
            user_messages.append(m)

    body: dict[str, Any] = {
        "model": model,
        "max_tokens": max_tokens,
        "messages": user_messages,
        "temperature": temperature,
        "stream": True,
    }
    if system_msg:
        body["system"] = system_msg

    async with httpx.AsyncClient(timeout=timeout) as client:
        async with client.stream(
            "POST",
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": settings.anthropic_api_key,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
            },
            json=body,
        ) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line.startswith("data: "):
                    continue
                raw = line[6:].strip()
                try:
                    chunk = _json.loads(raw)
                    if chunk.get("type") == "content_block_delta":
                        delta = chunk.get("delta", {}).get("text", "")
                        if delta:
                            yield delta
                    elif chunk.get("type") == "message_stop":
                        return
                except Exception:
                    continue
