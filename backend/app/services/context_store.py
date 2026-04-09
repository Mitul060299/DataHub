from __future__ import annotations

from typing import Dict
import json

from ..config import settings
from ..models import ContextPayload
from .storage import read_json, write_json


class ContextStore:
    def __init__(self) -> None:
        saved = read_json("contexts.json", {})
        self._contexts: Dict[str, ContextPayload] = {
            key: ContextPayload(**value) for key, value in saved.items()
        }
        self._client = None
        self._collection = None

        # Only attempt to connect to Chroma — and therefore import chromadb +
        # onnxruntime (~175 MB) — when CHROMA_URL points to a real external
        # host.  On Render the default is localhost:8001 which is never
        # reachable, so we skip the import entirely to preserve memory.
        _chroma_host = (
            settings.chroma_url
            .replace("http://", "")
            .replace("https://", "")
            .split(":")[0]
        )
        _chroma_is_external = _chroma_host not in ("", "localhost", "127.0.0.1")
        if not _chroma_is_external:
            return

        try:
            # Lazy import: chromadb pulls in onnxruntime which probes for GPU
            # devices at module init — deferring avoids 20-30s startup penalty.
            from chromadb import HttpClient  # noqa: PLC0415
            from chromadb.config import Settings as ChromaSettings  # noqa: PLC0415
            self._client = HttpClient(
                host=_chroma_host,
                port=int(settings.chroma_url.split(":")[-1]),
                settings=ChromaSettings(allow_reset=True),
            )
            self._collection = self._client.get_or_create_collection("datahub_context")
        except Exception:
            self._client = None
            self._collection = None

    def upsert(self, payload: ContextPayload) -> None:
        self._contexts[payload.workspace_id] = payload
        write_json("contexts.json", {k: v.model_dump() for k, v in self._contexts.items()})
        if self._collection:
            doc = json.dumps(payload.model_dump())
            self._collection.upsert(
                ids=[payload.workspace_id],
                documents=[doc],
                metadatas=[{"workspace_id": payload.workspace_id}],
            )

    def get(self, workspace_id: str) -> ContextPayload | None:
        if workspace_id in self._contexts:
            return self._contexts.get(workspace_id)
        if self._collection:
            result = self._collection.get(ids=[workspace_id])
            if result and result.get("documents"):
                doc = result["documents"][0]
                return ContextPayload(**json.loads(doc))
        return None

    def get_context_text(self, workspace_id: str) -> str:
        payload = self.get(workspace_id)
        if not payload:
            return ""
        glossary = "\n".join([f"{k}: {v}" for k, v in payload.glossary.items()])
        rules = "\n".join([f"{rule.key}: {rule.description}" for rule in payload.rules])
        return f"Glossary:\n{glossary}\nRules:\n{rules}".strip()


context_store = ContextStore()
