from __future__ import annotations

import inspect


def _patch_create_method(resource_cls: type) -> None:
    create_method = getattr(resource_cls, "create", None)
    if create_method is None:
        return

    already_patched = bool(getattr(create_method, "_datahub_reasoning_patch", False))
    if already_patched:
        return

    try:
        parameters = inspect.signature(create_method).parameters
    except (TypeError, ValueError):
        return

    if "reasoning_format" in parameters:
        return

    if inspect.iscoroutinefunction(create_method):

        async def wrapped(self, *args, **kwargs):
            kwargs.pop("reasoning_format", None)
            return await create_method(self, *args, **kwargs)

    else:

        def wrapped(self, *args, **kwargs):
            kwargs.pop("reasoning_format", None)
            return create_method(self, *args, **kwargs)

    setattr(wrapped, "_datahub_reasoning_patch", True)
    setattr(resource_cls, "create", wrapped)


def apply_groq_compat_patches() -> None:
    from app.config import settings
    if settings.llm_provider.lower() != "groq":
        return
    try:
        from groq.resources.chat.completions import AsyncCompletions, Completions
    except Exception:
        return

    _patch_create_method(AsyncCompletions)
    _patch_create_method(Completions)
