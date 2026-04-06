from __future__ import annotations

import time
from collections import Counter, deque

from gesture_bridge.core.types import Prediction


class ExponentialSmoother:
    def __init__(self, alpha: float = 0.35) -> None:
        self.alpha = alpha
        self._value: tuple[float, float] | None = None

    def update(self, value: tuple[float, float]) -> tuple[float, float]:
        if self._value is None:
            self._value = value
            return value

        x = self.alpha * value[0] + (1.0 - self.alpha) * self._value[0]
        y = self.alpha * value[1] + (1.0 - self.alpha) * self._value[1]
        self._value = (x, y)
        return self._value


class CooldownGate:
    def __init__(self) -> None:
        self._last_fired_ms: dict[str, int] = {}

    def ready(self, key: str, cooldown_ms: int) -> bool:
        now_ms = int(time.monotonic_ns() // 1_000_000)
        last_fired = self._last_fired_ms.get(key)
        if last_fired is None or now_ms - last_fired >= cooldown_ms:
            self._last_fired_ms[key] = now_ms
            return True
        return False


class StablePredictionTracker:
    def __init__(self, window_size: int = 6, min_count: int = 4) -> None:
        self.window_size = window_size
        self.min_count = min_count
        self._history: deque[tuple[str, float]] = deque(maxlen=window_size)

    def update(self, label: str | None, confidence: float = 0.0) -> Prediction | None:
        if label is None:
            self._history.clear()
            return None

        self._history.append((label, confidence))
        counts = Counter(name for name, _ in self._history)
        top_name, top_count = counts.most_common(1)[0]

        if top_name != label or top_count < self.min_count:
            return None

        confidences = [value for name, value in self._history if name == top_name]
        average_confidence = sum(confidences) / len(confidences)
        return Prediction(name=top_name, confidence=average_confidence)

