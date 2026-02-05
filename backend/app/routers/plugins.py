from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel
import importlib
from ..services.plugins import plugin_registry, PluginInfo
from ..services.connectors import connector_registry
from ..security import get_current_role, require_role

router = APIRouter(prefix="/plugins", tags=["plugins"])


class PluginLoadRequest(BaseModel):
    module: str
    class_name: str
    kind: str
    name: str | None = None
    description: str | None = None
    source: str | None = None


class PluginToggleRequest(BaseModel):
    name: str


@router.get("/")
def list_plugins() -> dict:
    plugins = [
        {
            "name": item.name,
            "kind": item.kind,
            "description": item.description,
            "enabled": item.enabled,
            "source": item.source,
        }
        for item in plugin_registry.list()
    ]
    return {"plugins": plugins, "connectors": connector_registry.list()}


@router.post("/load")
def load_plugin(payload: PluginLoadRequest, authorization: str | None = Header(default=None)) -> dict:
    role = get_current_role(authorization)
    require_role("admin", role)
    try:
        module = importlib.import_module(payload.module)
        cls = getattr(module, payload.class_name)
        instance = cls()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Failed to load plugin: {exc}")

    name = payload.name or getattr(instance, "name", payload.class_name)
    info = PluginInfo(
        name=name,
        kind=payload.kind,
        description=payload.description or getattr(instance, "description", ""),
        enabled=True,
        source=payload.source or payload.module,
    )
    plugin_registry.register(info, instance=instance)

    if payload.kind == "connector" and hasattr(instance, "read"):
        connector_registry.register(name, instance)

    return {"status": "loaded", "name": name}


@router.post("/enable")
def enable_plugin(payload: PluginToggleRequest, authorization: str | None = Header(default=None)) -> dict:
    role = get_current_role(authorization)
    require_role("admin", role)
    info = plugin_registry.enable(payload.name)
    if not info:
        raise HTTPException(status_code=404, detail="Plugin not found")
    instance = plugin_registry.instance(payload.name)
    if info.kind == "connector" and instance and hasattr(instance, "read"):
        connector_registry.register(payload.name, instance)
    return {"status": "enabled", "name": payload.name}


@router.post("/disable")
def disable_plugin(payload: PluginToggleRequest, authorization: str | None = Header(default=None)) -> dict:
    role = get_current_role(authorization)
    require_role("admin", role)
    info = plugin_registry.disable(payload.name)
    if not info:
        raise HTTPException(status_code=404, detail="Plugin not found")
    if info.kind == "connector":
        connector_registry.remove(payload.name)
    return {"status": "disabled", "name": payload.name}
