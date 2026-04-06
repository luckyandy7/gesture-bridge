from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Iterable

import numpy as np

from gesture_bridge.core.landmarks import HAND_CONNECTIONS
from gesture_bridge.core.types import HandObservation, HolisticObservation, Landmark3D


def _require_cv2():
    try:
        import cv2
    except ImportError as exc:  # pragma: no cover - import failure is runtime-specific
        raise RuntimeError(
            "OpenCV is required for the runtime overlay. Install with `pip install -e \".[vision]\"`."
        ) from exc
    return cv2


def _require_pillow():
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError as exc:  # pragma: no cover - import failure is runtime-specific
        raise RuntimeError(
            "Pillow is required for Unicode overlay text. Install with `pip install -e \".[vision]\"`."
        ) from exc
    return Image, ImageDraw, ImageFont


@lru_cache(maxsize=1)
def _overlay_font_path() -> str | None:
    candidates = (
        "/System/Library/Fonts/AppleSDGothicNeo.ttc",
        "/System/Library/Fonts/Supplemental/AppleGothic.ttf",
        "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
        "/System/Library/Fonts/Supplemental/NotoSansGothic-Regular.ttf",
    )
    for candidate in candidates:
        if Path(candidate).exists():
            return candidate
    return None


@lru_cache(maxsize=8)
def _overlay_font(size: int):
    _, _, ImageFont = _require_pillow()
    font_path = _overlay_font_path()
    if font_path is None:
        return ImageFont.load_default()
    return ImageFont.truetype(font_path, size=size)


def draw_hand(frame, hand: HandObservation | None, color: tuple[int, int, int] = (80, 220, 120)) -> None:
    if hand is None:
        return

    cv2 = _require_cv2()
    frame_height, frame_width = frame.shape[:2]

    _draw_landmark_tuple(frame, hand.landmarks, color=color, connections=HAND_CONNECTIONS)


def _draw_landmark_tuple(
    frame,
    landmarks: tuple[Landmark3D, ...],
    *,
    color: tuple[int, int, int],
    connections: tuple[tuple[int, int], ...] = (),
) -> None:
    if not landmarks:
        return

    cv2 = _require_cv2()
    frame_height, frame_width = frame.shape[:2]

    for start, end in connections:
        if start >= len(landmarks) or end >= len(landmarks):
            continue
        start_point = landmarks[start]
        end_point = landmarks[end]
        start_xy = (int(start_point.x * frame_width), int(start_point.y * frame_height))
        end_xy = (int(end_point.x * frame_width), int(end_point.y * frame_height))
        cv2.line(frame, start_xy, end_xy, color, 2)

    for landmark in landmarks:
        center = (int(landmark.x * frame_width), int(landmark.y * frame_height))
        cv2.circle(frame, center, 3, (255, 255, 255), -1)
        cv2.circle(frame, center, 5, color, 1)


def draw_holistic_sign(frame, observation: HolisticObservation | None) -> None:
    if observation is None:
        return

    cv2 = _require_cv2()
    frame_height, frame_width = frame.shape[:2]
    pose = observation.pose_landmarks
    arm_connections = (
        (11, 13),
        (13, 15),
        (12, 14),
        (14, 16),
        (11, 12),
    )

    for start, end in arm_connections:
        if len(pose) <= max(start, end):
            continue
        start_point = pose[start]
        end_point = pose[end]
        start_xy = (int(start_point.x * frame_width), int(start_point.y * frame_height))
        end_xy = (int(end_point.x * frame_width), int(end_point.y * frame_height))
        cv2.line(frame, start_xy, end_xy, (255, 180, 70), 3)

    key_pose_indices = (11, 12, 13, 14, 15, 16)
    for index in key_pose_indices:
        if index >= len(pose):
            continue
        landmark = pose[index]
        center = (int(landmark.x * frame_width), int(landmark.y * frame_height))
        cv2.circle(frame, center, 5, (255, 180, 70), -1)

    _draw_landmark_tuple(frame, observation.left_hand_landmarks, color=(80, 220, 120), connections=HAND_CONNECTIONS)
    _draw_landmark_tuple(frame, observation.right_hand_landmarks, color=(70, 160, 255), connections=HAND_CONNECTIONS)


def draw_pointer(frame, point: tuple[float, float], color: tuple[int, int, int] = (0, 200, 255)) -> None:
    cv2 = _require_cv2()
    frame_height, frame_width = frame.shape[:2]
    center = (int(point[0] * frame_width), int(point[1] * frame_height))
    cv2.circle(frame, center, 10, color, 2)
    cv2.line(frame, (center[0] - 12, center[1]), (center[0] + 12, center[1]), color, 1)
    cv2.line(frame, (center[0], center[1] - 12), (center[0], center[1] + 12), color, 1)


def draw_status_panel(
    frame,
    lines: Iterable[str],
    origin: tuple[int, int] = (16, 30),
    color: tuple[int, int, int] = (255, 255, 255),
) -> None:
    cv2 = _require_cv2()
    Image, ImageDraw, _ = _require_pillow()
    x, y = origin
    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    image = Image.fromarray(rgb_frame)
    draw = ImageDraw.Draw(image)
    font = _overlay_font(size=24)

    for index, line in enumerate(lines):
        line_y = y + index * 28
        draw.text(
            (x, line_y),
            line,
            font=font,
            fill=(color[2], color[1], color[0]),
            stroke_width=2,
            stroke_fill=(0, 0, 0),
        )

    frame[:] = cv2.cvtColor(np.asarray(image), cv2.COLOR_RGB2BGR)
