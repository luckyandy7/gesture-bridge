from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class Landmark3D:
    x: float
    y: float
    z: float


@dataclass(frozen=True)
class HandObservation:
    landmarks: tuple[Landmark3D, ...]
    handedness: str
    confidence: float
    frame_width: int
    frame_height: int
    timestamp_ms: int

    def point(self, index: int) -> Landmark3D:
        return self.landmarks[index]


@dataclass(frozen=True)
class HolisticObservation:
    pose_landmarks: tuple[Landmark3D, ...]
    left_hand_landmarks: tuple[Landmark3D, ...]
    right_hand_landmarks: tuple[Landmark3D, ...]
    frame_width: int
    frame_height: int
    timestamp_ms: int

    def has_pose(self) -> bool:
        return bool(self.pose_landmarks)

    def has_left_hand(self) -> bool:
        return bool(self.left_hand_landmarks)

    def has_right_hand(self) -> bool:
        return bool(self.right_hand_landmarks)


@dataclass(frozen=True)
class Prediction:
    name: str
    confidence: float
    metadata: dict[str, float] = field(default_factory=dict)
