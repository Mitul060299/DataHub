from abc import ABC, abstractmethod
from typing import Dict, Any, Iterable


class DataConnector(ABC):
    name: str

    @abstractmethod
    def read(self, config: Dict[str, Any]) -> Iterable[Dict[str, Any]]:
        raise NotImplementedError


class DataExporter(ABC):
    name: str

    @abstractmethod
    def write(self, rows: Iterable[Dict[str, Any]], config: Dict[str, Any]) -> None:
        raise NotImplementedError
