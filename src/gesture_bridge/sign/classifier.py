from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np

from gesture_bridge.core.paths import resolve_project_path
from gesture_bridge.core.types import Prediction
from gesture_bridge.sign.config import SignLabelConfig
from gesture_bridge.sign.dataset import load_sign_dataset


@dataclass(frozen=True)
class TrainedSignModel:
    pipeline: Any
    labels: tuple[str, ...]
    sequence_length: int
    feature_size: int


def _require_joblib():
    try:
        import joblib
    except ImportError as exc:  # pragma: no cover - import failure is runtime-specific
        raise RuntimeError(
            "joblib is required for saving or loading sign models. Install with "
            "`pip install -e \".[ml]\"`."
        ) from exc
    return joblib


def _require_sklearn():
    try:
        from sklearn.metrics import accuracy_score
        from sklearn.model_selection import train_test_split
        from sklearn.neighbors import KNeighborsClassifier
        from sklearn.pipeline import Pipeline
        from sklearn.preprocessing import StandardScaler
    except ImportError as exc:  # pragma: no cover - import failure is runtime-specific
        raise RuntimeError(
            "scikit-learn is required for sign training. Install with `pip install -e \".[ml]\"`."
        ) from exc

    return {
        "accuracy_score": accuracy_score,
        "train_test_split": train_test_split,
        "KNeighborsClassifier": KNeighborsClassifier,
        "Pipeline": Pipeline,
        "StandardScaler": StandardScaler,
    }


def train_sign_classifier(
    config: SignLabelConfig,
    data_dir: str | Path,
    model_path: str | Path,
    neighbors: int = 3,
) -> dict[str, object]:
    sklearn = _require_sklearn()
    joblib = _require_joblib()

    sequences, labels, counts, skipped_counts, target_shape = load_sign_dataset(config, data_dir=data_dir)
    sample_count, sequence_length, feature_size = sequences.shape
    flat_sequences = sequences.reshape(sample_count, sequence_length * feature_size)
    unique_labels, label_counts = np.unique(labels, return_counts=True)

    if len(unique_labels) < 2:
        raise RuntimeError(
            "At least 2 labels with collected samples are required for training. "
            "If you want to recognize `안녕하세요`, also collect at least one or two other labels "
            "such as `감사합니다`."
        )

    neighbor_count = max(1, min(neighbors, sample_count))

    pipeline = sklearn["Pipeline"](
        steps=[
            ("scaler", sklearn["StandardScaler"]()),
            ("knn", sklearn["KNeighborsClassifier"](n_neighbors=neighbor_count, weights="distance")),
        ]
    )

    can_hold_out = len(unique_labels) > 1 and np.min(label_counts) >= 2 and sample_count >= 8

    if can_hold_out:
        train_x, test_x, train_y, test_y = sklearn["train_test_split"](
            flat_sequences,
            labels,
            test_size=0.25,
            random_state=42,
            stratify=labels,
        )
        pipeline.fit(train_x, train_y)
        predictions = pipeline.predict(test_x)
        accuracy = float(sklearn["accuracy_score"](test_y, predictions))
        eval_split = "holdout"
        trained_samples = int(train_x.shape[0])
        eval_samples = int(test_x.shape[0])
    else:
        pipeline.fit(flat_sequences, labels)
        predictions = pipeline.predict(flat_sequences)
        accuracy = float(sklearn["accuracy_score"](labels, predictions))
        eval_split = "train"
        trained_samples = sample_count
        eval_samples = sample_count

    bundle = {
        "pipeline": pipeline,
        "labels": tuple(config.labels),
        "sequence_length": sequence_length,
        "feature_size": feature_size,
    }

    resolved_model_path = resolve_project_path(model_path)
    resolved_model_path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(bundle, resolved_model_path)

    return {
        "model_path": str(resolved_model_path),
        "accuracy": round(accuracy, 4),
        "samples": sample_count,
        "trained_samples": trained_samples,
        "eval_samples": eval_samples,
        "eval_split": eval_split,
        "counts": counts,
        "skipped_counts": skipped_counts,
        "target_shape": target_shape,
    }


def load_sign_model(model_path: str | Path) -> TrainedSignModel:
    joblib = _require_joblib()
    payload = joblib.load(resolve_project_path(model_path))
    return TrainedSignModel(
        pipeline=payload["pipeline"],
        labels=tuple(payload["labels"]),
        sequence_length=int(payload["sequence_length"]),
        feature_size=int(payload["feature_size"]),
    )


def predict_sign_sequence(model: TrainedSignModel, sequence: np.ndarray) -> Prediction:
    if sequence.shape != (model.sequence_length, model.feature_size):
        raise ValueError(
            f"Unexpected sequence shape {sequence.shape}, expected "
            f"({model.sequence_length}, {model.feature_size})."
        )

    flat_sequence = sequence.reshape(1, model.sequence_length * model.feature_size)
    probabilities = model.pipeline.predict_proba(flat_sequence)[0]
    top_index = int(np.argmax(probabilities))
    return Prediction(
        name=str(model.pipeline.classes_[top_index]),
        confidence=float(probabilities[top_index]),
    )
