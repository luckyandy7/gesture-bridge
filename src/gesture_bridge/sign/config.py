from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from gesture_bridge.core.io import load_json
from gesture_bridge.core.paths import resolve_project_path


@dataclass(frozen=True)
class SignLabelConfig:
    sequence_length: int
    labels: tuple[str, ...]


def load_sign_label_config(path: str | Path) -> SignLabelConfig:
    payload = load_json(path)
    sequence_length = int(payload["sequence_length"])
    labels = tuple(str(label) for label in payload["labels"])
    return SignLabelConfig(sequence_length=sequence_length, labels=labels)


def resolve_sign_config_path(path: str | Path) -> Path:
    return resolve_project_path(path)

