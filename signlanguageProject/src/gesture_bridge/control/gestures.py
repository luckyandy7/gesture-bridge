from __future__ import annotations

import numpy as np

from gesture_bridge.core.features import finger_states, normalize_landmarks, pinch_distance
from gesture_bridge.core.types import HandObservation, Prediction


class ControlGestureRecognizer:
    def __init__(
        self,
        pinch_threshold: float = 0.20,
        thumb_margin: float = 0.14,
        finger_separation_threshold: float = 0.16,
    ) -> None:
        self.pinch_threshold = pinch_threshold
        self.thumb_margin = thumb_margin
        self.finger_separation_threshold = finger_separation_threshold

    def predict(self, hand: HandObservation | None) -> Prediction | None:
        if hand is None:
            return None

        finger_map = finger_states(hand)
        normalized = normalize_landmarks(hand)
        wrist = normalized[0]
        thumb_tip = normalized[4]
        pinch = pinch_distance(hand)
        index_tip = normalized[8]
        middle_tip = normalized[12]
        finger_separation = float(np.linalg.norm(index_tip[:2] - middle_tip[:2]))

        if pinch <= self.pinch_threshold:
            confidence = max(0.0, min(1.0, 1.0 - pinch / self.pinch_threshold))
            return Prediction("pinch", confidence, {"pinch_distance": pinch})

        if all(finger_map.values()):
            return Prediction("open_palm", 0.98)

        if finger_map["index"] and not finger_map["middle"] and not finger_map["ring"] and not finger_map["pinky"]:
            confidence = 0.82 + max(0.0, min(0.15, finger_separation))
            return Prediction("point", min(confidence, 0.97))

        if (
            finger_map["index"]
            and finger_map["middle"]
            and not finger_map["ring"]
            and not finger_map["pinky"]
            and finger_separation >= self.finger_separation_threshold
        ):
            confidence = min(0.98, 0.82 + finger_separation)
            return Prediction("peace", confidence, {"finger_separation": finger_separation})

        thumb_extended = bool(np.linalg.norm(thumb_tip[:2] - normalized[2, :2]) > 0.42)
        other_fingers_curled = not any(
            finger_map[name] for name in ("index", "middle", "ring", "pinky")
        )

        if thumb_extended and other_fingers_curled:
            if thumb_tip[1] < wrist[1] - self.thumb_margin:
                return Prediction("thumbs_up", 0.88)
            if thumb_tip[1] > wrist[1] + self.thumb_margin:
                return Prediction("thumbs_down", 0.88)

        return None
