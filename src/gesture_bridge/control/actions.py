from __future__ import annotations


def _clamp_unit(value: float) -> float:
    return max(0.0, min(1.0, value))


class NoopActionAdapter:
    live = False

    def move_cursor(self, x: float, y: float) -> None:
        _ = (x, y)

    def left_click(self) -> None:
        return None

    def press_key(self, key: str) -> None:
        _ = key

    def scroll(self, amount: int) -> None:
        _ = amount


class PyAutoGuiActionAdapter:
    live = True

    def __init__(self) -> None:
        try:
            import pyautogui
        except ImportError as exc:  # pragma: no cover - import failure is runtime-specific
            raise RuntimeError(
                "pyautogui is required for live PC control. Install with `pip install -e \".[control]\"`."
            ) from exc

        pyautogui.PAUSE = 0
        self._pyautogui = pyautogui
        self._screen_width, self._screen_height = pyautogui.size()

    def move_cursor(self, x: float, y: float) -> None:
        screen_x = int(_clamp_unit(x) * self._screen_width)
        screen_y = int(_clamp_unit(y) * self._screen_height)
        self._pyautogui.moveTo(screen_x, screen_y)

    def left_click(self) -> None:
        self._pyautogui.click(button="left")

    def press_key(self, key: str) -> None:
        self._pyautogui.press(key)

    def scroll(self, amount: int) -> None:
        self._pyautogui.scroll(amount)


def build_action_adapter(live: bool):
    if live:
        return PyAutoGuiActionAdapter()
    return NoopActionAdapter()

