from __future__ import annotations

import urllib.request
from pathlib import Path

from gesture_bridge.core.paths import ensure_directory, resolve_project_path
from gesture_bridge.core.types import HandObservation, Landmark3D


HAND_CONNECTIONS: tuple[tuple[int, int], ...] = (
    (0, 1),
    (1, 2),
    (2, 3),
    (3, 4),
    (0, 5),
    (5, 6),
    (6, 7),
    (7, 8),
    (5, 9),
    (9, 10),
    (10, 11),
    (11, 12),
    (9, 13),
    (13, 14),
    (14, 15),
    (15, 16),
    (13, 17),
    (17, 18),
    (18, 19),
    (19, 20),
    (0, 17),
)

DEFAULT_HAND_LANDMARKER_URL = (
    "https://storage.googleapis.com/mediapipe-models/hand_landmarker/"
    "hand_landmarker/float16/1/hand_landmarker.task"
)


def ensure_hand_landmarker_model(
    model_path: str | Path = "models/hand_landmarker.task",
    model_url: str = DEFAULT_HAND_LANDMARKER_URL,
) -> Path:
    resolved_path = resolve_project_path(model_path)
    if resolved_path.exists():
        return resolved_path

    ensure_directory(resolved_path.parent)
    tmp_path = resolved_path.with_suffix(".download")
    urllib.request.urlretrieve(model_url, tmp_path)
    tmp_path.replace(resolved_path)
    return resolved_path


class MediaPipeHandsTracker:
    def __init__(
        self,
        max_hands: int = 1,
        min_detection_confidence: float = 0.6,
        min_tracking_confidence: float = 0.5,
        model_path: str | Path = "models/hand_landmarker.task",
    ) -> None:
        try:
            import cv2
            import mediapipe as mp
        except ImportError as exc:  # pragma: no cover - import failure is runtime-specific
            raise RuntimeError(
                "MediaPipe and OpenCV are required for hand tracking. Install with "
                "`pip install -e \".[vision]\"`."
            ) from exc

        self._cv2 = cv2
        self._mp = mp
        self._legacy_hands = None
        self._task_landmarker = None

        if hasattr(mp, "solutions") and hasattr(mp.solutions, "hands"):
            self._legacy_hands = mp.solutions.hands.Hands(
                static_image_mode=False,
                max_num_hands=max_hands,
                min_detection_confidence=min_detection_confidence,
                min_tracking_confidence=min_tracking_confidence,
            )
            self._backend = "solutions"
            return

        model_asset_path = ensure_hand_landmarker_model(model_path=model_path)
        self._backend = "tasks"
        self._task_landmarker = self._create_task_landmarker(
            mp=mp,
            model_asset_path=model_asset_path,
            max_hands=max_hands,
            min_detection_confidence=min_detection_confidence,
            min_tracking_confidence=min_tracking_confidence,
        )

    def _create_task_landmarker(
        self,
        *,
        mp,
        model_asset_path: Path,
        max_hands: int,
        min_detection_confidence: float,
        min_tracking_confidence: float,
    ):
        base_options = mp.tasks.BaseOptions(model_asset_path=str(model_asset_path))
        options = mp.tasks.vision.HandLandmarkerOptions(
            base_options=base_options,
            running_mode=mp.tasks.vision.RunningMode.VIDEO,
            num_hands=max_hands,
            min_hand_detection_confidence=min_detection_confidence,
            min_hand_presence_confidence=min_detection_confidence,
            min_tracking_confidence=min_tracking_confidence,
        )
        return mp.tasks.vision.HandLandmarker.create_from_options(options)

    def process(self, frame, timestamp_ms: int) -> list[HandObservation]:
        if self._backend == "solutions":
            return self._process_with_solutions(frame, timestamp_ms)
        return self._process_with_tasks(frame, timestamp_ms)

    def _process_with_solutions(self, frame, timestamp_ms: int) -> list[HandObservation]:
        rgb_frame = self._cv2.cvtColor(frame, self._cv2.COLOR_BGR2RGB)
        result = self._legacy_hands.process(rgb_frame)
        if not result.multi_hand_landmarks:
            return []

        frame_height, frame_width = frame.shape[:2]
        observations: list[HandObservation] = []

        for index, landmarks in enumerate(result.multi_hand_landmarks):
            handedness_label = "unknown"
            handedness_score = 0.0

            if result.multi_handedness and len(result.multi_handedness) > index:
                classification = result.multi_handedness[index].classification[0]
                handedness_label = classification.label.lower()
                handedness_score = float(classification.score)

            points = tuple(
                Landmark3D(x=float(point.x), y=float(point.y), z=float(point.z))
                for point in landmarks.landmark
            )

            observations.append(
                HandObservation(
                    landmarks=points,
                    handedness=handedness_label,
                    confidence=handedness_score,
                    frame_width=frame_width,
                    frame_height=frame_height,
                    timestamp_ms=timestamp_ms,
                )
            )

        return observations

    def _process_with_tasks(self, frame, timestamp_ms: int) -> list[HandObservation]:
        rgb_frame = self._cv2.cvtColor(frame, self._cv2.COLOR_BGR2RGB)
        mp_image = self._mp.Image(image_format=self._mp.ImageFormat.SRGB, data=rgb_frame)
        result = self._task_landmarker.detect_for_video(mp_image, timestamp_ms)
        if not result.hand_landmarks:
            return []

        frame_height, frame_width = frame.shape[:2]
        observations: list[HandObservation] = []

        for index, landmarks in enumerate(result.hand_landmarks):
            handedness_label = "unknown"
            handedness_score = 0.0
            if result.handedness and len(result.handedness) > index and result.handedness[index]:
                category = result.handedness[index][0]
                handedness_label = str(category.category_name or category.display_name or "unknown").lower()
                handedness_score = float(category.score or 0.0)

            points = tuple(
                Landmark3D(x=float(point.x), y=float(point.y), z=float(point.z))
                for point in landmarks
            )
            observations.append(
                HandObservation(
                    landmarks=points,
                    handedness=handedness_label,
                    confidence=handedness_score,
                    frame_width=frame_width,
                    frame_height=frame_height,
                    timestamp_ms=timestamp_ms,
                )
            )

        return observations

    def close(self) -> None:
        if self._legacy_hands is not None:
            self._legacy_hands.close()
        if self._task_landmarker is not None:
            self._task_landmarker.close()

    def __enter__(self) -> "MediaPipeHandsTracker":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        self.close()
