from __future__ import annotations

from pathlib import Path
from collections import Counter

import numpy as np

from gesture_bridge.core.features import flatten_holistic_frame_features
from gesture_bridge.core.overlay import draw_holistic_sign, draw_status_panel
from gesture_bridge.core.paths import ensure_directory, resolve_project_path
from gesture_bridge.sign.config import SignLabelConfig


def next_sequence_index(label_dir: Path) -> int:
    existing = sorted(label_dir.glob("*.npz"))
    if not existing:
        return 1
    return len(existing) + 1


def save_sequence_file(label_dir: Path, sequence_index: int, frames: np.ndarray) -> Path:
    label_dir.mkdir(parents=True, exist_ok=True)
    output_path = label_dir / f"{sequence_index:04d}.npz"
    np.savez_compressed(output_path, frames=frames.astype(np.float32))
    return output_path


def collect_sign_sequences(
    label: str,
    config: SignLabelConfig,
    output_dir: str | Path,
    sequence_count: int,
    camera_index: int,
    width: int,
    height: int,
    mirror: bool,
    backend: str,
    prepare_seconds: float = 2.0,
) -> int:
    if label not in config.labels:
        raise ValueError(f"Label `{label}` is not present in the sign label config.")

    from gesture_bridge.core.camera import WebcamStream
    from gesture_bridge.core.holistic import MediaPipeHolisticTracker

    try:
        import cv2
    except ImportError as exc:  # pragma: no cover - import failure is runtime-specific
        raise RuntimeError(
            "OpenCV is required for sequence collection. Install with `pip install -e \".[vision]\"`."
        ) from exc

    root_dir = ensure_directory(output_dir)
    label_dir = root_dir / label
    collected = 0
    state = "prepare"
    buffer: list[np.ndarray] = []
    prep_start_ms: int | None = None

    with WebcamStream(
        camera_index=camera_index,
        width=width,
        height=height,
        mirror=mirror,
        backend=backend,
    ) as stream, MediaPipeHolisticTracker() as tracker:
        while collected < sequence_count:
            frame, timestamp_ms = stream.read()
            observation = tracker.process(frame, timestamp_ms)

            if state == "prepare":
                if prep_start_ms is None:
                    prep_start_ms = timestamp_ms
                elapsed = (timestamp_ms - prep_start_ms) / 1000.0
                remaining = max(0.0, prepare_seconds - elapsed)
                if remaining <= 0.0:
                    state = "record"
                    buffer = []
                    prep_start_ms = None
            else:
                if observation is not None:
                    buffer.append(flatten_holistic_frame_features(observation))
                if len(buffer) >= config.sequence_length:
                    sequence_index = next_sequence_index(label_dir)
                    frames = np.stack(buffer[: config.sequence_length], axis=0)
                    save_sequence_file(label_dir, sequence_index, frames)
                    collected += 1
                    state = "prepare"
                    prep_start_ms = timestamp_ms

            draw_holistic_sign(frame, observation)
            overlay_lines = [
                f"Collecting label: {label}",
                f"Saved sequences: {collected}/{sequence_count}",
                f"Sequence length: {config.sequence_length}",
            ]

            if state == "prepare":
                overlay_lines.append("Status: prepare pose")
                if prep_start_ms is not None:
                    elapsed = (timestamp_ms - prep_start_ms) / 1000.0
                    overlay_lines.append(f"Countdown: {max(0.0, prepare_seconds - elapsed):.1f}s")
            else:
                overlay_lines.append("Status: recording")
                overlay_lines.append(f"Frames captured: {len(buffer)}/{config.sequence_length}")
                if observation is None:
                    overlay_lines.append("Body not detected")
                else:
                    overlay_lines.append(
                        f"Left hand: {'yes' if observation.has_left_hand() else 'no'} | "
                        f"Right hand: {'yes' if observation.has_right_hand() else 'no'}"
                    )

            overlay_lines.append("Keys: q quit")
            draw_status_panel(frame, overlay_lines)

            cv2.imshow("Gesture Bridge - Collect Signs", frame)
            pressed = cv2.waitKey(1) & 0xFF
            if pressed in (27, ord("q")):
                break

        cv2.destroyAllWindows()

    return collected


def load_sign_dataset(
    config: SignLabelConfig,
    data_dir: str | Path,
) -> tuple[np.ndarray, np.ndarray, dict[str, int], dict[str, int], tuple[int, int]]:
    root_dir = resolve_project_path(data_dir)
    records: list[tuple[str, np.ndarray, Path]] = []
    counts: dict[str, int] = {label: 0 for label in config.labels}
    skipped_counts: dict[str, int] = {label: 0 for label in config.labels}
    shape_counter: Counter[tuple[int, int]] = Counter()

    for label in config.labels:
        label_dir = root_dir / label
        if not label_dir.exists():
            continue

        for file_path in sorted(label_dir.glob("*.npz")):
            with np.load(file_path) as payload:
                frames = payload["frames"].astype(np.float32)
            if frames.ndim != 2 or frames.shape[0] != config.sequence_length:
                raise ValueError(
                    f"Unexpected sequence shape in {file_path}: {frames.shape}, "
                    f"expected ({config.sequence_length}, feature_dim)."
                )
            records.append((label, frames, file_path))
            shape_counter[tuple(frames.shape)] += 1

    if not records:
        raise RuntimeError(f"No sign samples found under {root_dir}.")

    target_shape, _ = shape_counter.most_common(1)[0]
    samples: list[np.ndarray] = []
    labels: list[str] = []

    for label, frames, _file_path in records:
        if tuple(frames.shape) != target_shape:
            skipped_counts[label] += 1
            continue
        samples.append(frames)
        labels.append(label)
        counts[label] += 1

    if not samples:
        raise RuntimeError(
            f"No sign samples matched the dominant shape {target_shape} under {root_dir}."
        )

    return np.stack(samples, axis=0), np.asarray(labels), counts, skipped_counts, target_shape
