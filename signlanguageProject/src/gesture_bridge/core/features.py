from __future__ import annotations

from typing import Iterable

import numpy as np

from gesture_bridge.core.types import HandObservation, HolisticObservation, Landmark3D


def landmarks_to_array(hand: HandObservation) -> np.ndarray:
    return np.asarray([[point.x, point.y, point.z] for point in hand.landmarks], dtype=np.float32)


def select_primary_hand(
    hands: Iterable[HandObservation],
    preferred_hand: str = "any",
) -> HandObservation | None:
    candidates = list(hands)
    if not candidates:
        return None

    if preferred_hand == "any":
        return max(candidates, key=lambda hand: hand.confidence)

    for hand in candidates:
        if hand.handedness.lower() == preferred_hand.lower():
            return hand

    return max(candidates, key=lambda hand: hand.confidence)


def hand_scale(hand: HandObservation) -> float:
    points = landmarks_to_array(hand)
    xy = points[:, :2]
    span = xy.max(axis=0) - xy.min(axis=0)
    return float(max(span[0], span[1], 1e-6))


def normalize_landmarks(hand: HandObservation) -> np.ndarray:
    points = landmarks_to_array(hand).copy()
    points -= points[0]
    scale = max(np.max(np.linalg.norm(points[:, :2], axis=1)), 1e-6)
    points /= scale

    if hand.handedness.lower() == "left":
        points[:, 0] *= -1.0

    return points


def flatten_frame_features(hand: HandObservation) -> np.ndarray:
    normalized = normalize_landmarks(hand)
    return normalized.reshape(-1).astype(np.float32)


def finger_states(hand: HandObservation) -> dict[str, bool]:
    normalized = normalize_landmarks(hand)
    states: dict[str, bool] = {}

    states["thumb"] = bool(np.linalg.norm(normalized[4, :2] - normalized[2, :2]) > 0.42)

    finger_triplets = {
        "index": (8, 6, 5),
        "middle": (12, 10, 9),
        "ring": (16, 14, 13),
        "pinky": (20, 18, 17),
    }

    for name, (tip, pip, mcp) in finger_triplets.items():
        states[name] = bool(
            normalized[tip, 1] < normalized[pip, 1] < normalized[mcp, 1]
            or np.linalg.norm(normalized[tip, :2]) > np.linalg.norm(normalized[pip, :2]) + 0.08
        )

    return states


def pinch_distance(hand: HandObservation) -> float:
    normalized = normalize_landmarks(hand)
    return float(np.linalg.norm(normalized[4, :2] - normalized[8, :2]))


def index_tip_position(hand: HandObservation) -> tuple[float, float]:
    tip = hand.point(8)
    return float(np.clip(tip.x, 0.0, 1.0)), float(np.clip(tip.y, 0.0, 1.0))


SIGN_POSE_INDICES: tuple[int, ...] = (11, 12, 13, 14, 15, 16)


def points_to_array(points: Iterable[Landmark3D]) -> np.ndarray:
    values = [[point.x, point.y, point.z] for point in points]
    if not values:
        return np.zeros((0, 3), dtype=np.float32)
    return np.asarray(values, dtype=np.float32)


def _body_reference(pose: np.ndarray) -> tuple[np.ndarray, float]:
    if pose.shape[0] < 17:
        center = np.zeros(3, dtype=np.float32)
        return center, 1.0

    left_shoulder = pose[11]
    right_shoulder = pose[12]
    center = (left_shoulder + right_shoulder) / 2.0
    scale = float(np.linalg.norm(left_shoulder[:2] - right_shoulder[:2]))

    if scale < 1e-6:
        left_elbow = pose[13]
        right_elbow = pose[14]
        scale = float(np.linalg.norm(left_elbow[:2] - right_elbow[:2]))

    if scale < 1e-6:
        scale = 1.0

    return center.astype(np.float32), scale


def _normalize_global(points: np.ndarray, center: np.ndarray, scale: float, expected_count: int) -> np.ndarray:
    if points.size == 0:
        return np.zeros((expected_count, 3), dtype=np.float32)

    normalized = points.copy()
    normalized -= center
    normalized /= scale
    return normalized.astype(np.float32)


def _normalize_local_hand(points: np.ndarray, expected_count: int) -> np.ndarray:
    if points.size == 0:
        return np.zeros((expected_count, 3), dtype=np.float32)

    normalized = points.copy()
    normalized -= normalized[0]
    scale = float(np.max(np.linalg.norm(normalized[:, :2], axis=1)))
    if scale < 1e-6:
        scale = 1.0
    normalized /= scale
    return normalized.astype(np.float32)


def flatten_holistic_frame_features(observation: HolisticObservation) -> np.ndarray:
    pose = points_to_array(observation.pose_landmarks)
    left_hand = points_to_array(observation.left_hand_landmarks)
    right_hand = points_to_array(observation.right_hand_landmarks)
    center, scale = _body_reference(pose)

    pose_subset = pose[list(SIGN_POSE_INDICES)] if pose.shape[0] > max(SIGN_POSE_INDICES) else np.zeros((len(SIGN_POSE_INDICES), 3), dtype=np.float32)
    pose_features = _normalize_global(pose_subset, center=center, scale=scale, expected_count=len(SIGN_POSE_INDICES))
    left_global = _normalize_global(left_hand, center=center, scale=scale, expected_count=21)
    right_global = _normalize_global(right_hand, center=center, scale=scale, expected_count=21)
    left_local = _normalize_local_hand(left_hand, expected_count=21)
    right_local = _normalize_local_hand(right_hand, expected_count=21)
    presence = np.asarray(
        [
            1.0 if observation.has_left_hand() else 0.0,
            1.0 if observation.has_right_hand() else 0.0,
        ],
        dtype=np.float32,
    )

    return np.concatenate(
        (
            pose_features.reshape(-1),
            left_global.reshape(-1),
            right_global.reshape(-1),
            left_local.reshape(-1),
            right_local.reshape(-1),
            presence,
        ),
        axis=0,
    ).astype(np.float32)
