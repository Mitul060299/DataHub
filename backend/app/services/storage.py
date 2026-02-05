from pathlib import Path
import json
from typing import Any

DATA_DIR = Path(__file__).resolve().parent.parent / "data"


def read_json(name: str, default: Any) -> Any:
    path = DATA_DIR / name
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def write_json(name: str, payload: Any) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    path = DATA_DIR / name
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
