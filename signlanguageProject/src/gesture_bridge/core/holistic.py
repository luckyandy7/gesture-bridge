from __future__ import annotations

import urllib.request
from pathlib import Path

from gesture_bridge.core.paths import ensure_directory, resolve_project_path
from gesture_bridge.core.types import HolisticObservation, Landmark3D


DEFAULT_HOLISTIC_LANDMARKER_URL = (
    "https://storage.googleapis.com/mediapipe-models/holistic_landmarker/"
    "holistic_landmarker/float16/1/holistic_landmarker.task"
)


def ensure_holistic_landmarker_model(
    model_path: str | Path = "models/holistic_landmarker.task",
    model_url: str = DEFAULT_HOLISTIC_LANDMARKER_URL,
) -> Path:
    resolved_path = resolve_project_path(model_path)
    if resolved_path.exists():
        return resolved_path

    ensure_directory(resolved_path.parent)
    tmp_path = resolved_path.with_suffix(".download")
    urllib.request.urlretrieve(model_url, tmp_path)
    tmp_path.replace(resolved_path)
    return resolved_path


class MediaPipeHolisticTracker:
    def __init__(
        self,
        min_pose_detection_confidence: float = 0.5,
        min_pose_landmarks_confidence: float = 0.5,
        min_hand_landmarks_confidence: float = 0.5,
        model_path: str | Path = "models/holistic_landmarker.task",
    ) -> None:
        try:
            import cv2
            import mediapipe as mp
        except ImportError as exc:  # pragma: no cover - import failure is runtime-specific
            raise RuntimeError(
                "MediaPipe and OpenCV are required for holistic tracking. Install with "
                "`pip install -e \".[vision]\"`."
            ) from exc

        self._cv2 = cv2
        self._mp = mp
        model_asset_path = ensure_holistic_landmarker_model(model_path=model_path)
        self._landmarker = self._create_landmarker(
            mp=mp,
            model_asset_path=model_asset_path,
            min_pose_detection_confidence=min_pose_detection_confidence,
            min_pose_landmarks_confidence=min_pose_landmarks_confidence,
            min_hand_landmarks_confidence=min_hand_landmarks_confidence,
        )

    def _create_landmarker(
        self,
        *,
        mp,
        model_asset_path: Path,
        min_pose_detection_confidence: float,
        min_pose_landmarks_confidence: float,
        min_hand_landmarks_confidence: float,
    ):
        base_options = mp.tasks.BaseOptions(model_asset_path=str(model_asset_path))
        options = mp.tasks.vision.HolisticLandmarkerOptions(
            base_options=base_options,
            running_mode=mp.tasks.vision.RunningMode.VIDEO,
            min_pose_detection_confidence=min_pose_detection_confidence,
            min_pose_landmarks_confidence=min_pose_landmarks_confidence,
            min_hand_landmarks_confidence=min_hand_landmarks_confidence,
            output_face_blendshapes=False,
            output_segmentation_mask=False,
        )
        return mp.tasks.vision.HolisticLandmarker.create_from_options(options)

    def process(self, frame, timestamp_ms: int) -> HolisticObservation | None:
        rgb_frame = self._cv2.cvtColor(frame, self._cv2.COLOR_BGR2RGB)
        mp_image = self._mp.Image(image_format=self._mp.ImageFormat.SRGB, data=rgb_frame)
        result = self._landmarker.detect_for_video(mp_image, timestamp_ms)
        if not result.pose_landmarks:
            return None

        frame_height, frame_width = frame.shape[:2]
        pose_landmarks = tuple(
            Landmark3D(x=float(point.x), y=float(point.y), z=float(point.z))
            for point in result.pose_landmarks
        )
        left_hand_landmarks = tuple(
            Landmark3D(x=float(point.x), y=float(point.y), z=float(point.z))
            for point in (result.left_hand_landmarks or [])
        )
        right_hand_landmarks = tuple(
            Landmark3D(x=float(point.x), y=float(point.y), z=float(point.z))
            for point in (result.right_hand_landmarks or [])
        )

        return HolisticObservation(
            pose_landmarks=pose_landmarks,
            left_hand_landmarks=left_hand_landmarks,
            right_hand_landmarks=right_hand_landmarks,
            frame_width=frame_width,
            frame_height=frame_height,
            timestamp_ms=timestamp_ms,
        )

    def close(self) -> None:
        self._landmarker.close()

    def __enter__(self) -> "MediaPipeHolisticTracker":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        self.close()
