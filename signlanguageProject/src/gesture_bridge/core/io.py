from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from gesture_bridge.core.paths import resolve_project_path


def load_json(path: str | Path) -> Any:
    resolved = resolve_project_path(path)
    with resolved.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def save_json(path: str | Path, payload: Any) -> Path:
    resolved = resolve_project_path(path)
    resolved.parent.mkdir(parents=True, exist_ok=True)
    with resolved.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, ensure_ascii=True)
    return resolved

