from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional


@dataclass
class PluginInfo:
    name: str
    kind: str
    description: str = ""
    enabled: bool = True
    source: Optional[str] = None


class PluginRegistry:
    def __init__(self) -> None:
        self._plugins: Dict[str, PluginInfo] = {}
        self._instances: Dict[str, Any] = {}

    def list(self) -> List[PluginInfo]:
        return list(self._plugins.values())

    def register(self, info: PluginInfo, instance: Any | None = None) -> PluginInfo:
        self._plugins[info.name] = info
        if instance is not None:
            self._instances[info.name] = instance
        return info

    def get(self, name: str) -> PluginInfo | None:
        return self._plugins.get(name)

    def instance(self, name: str) -> Any | None:
        return self._instances.get(name)

    def enable(self, name: str) -> PluginInfo | None:
        info = self._plugins.get(name)
        if info:
            info.enabled = True
        return info

    def disable(self, name: str) -> PluginInfo | None:
        info = self._plugins.get(name)
        if info:
            info.enabled = False
        return info


plugin_registry = PluginRegistry()
