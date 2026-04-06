from __future__ import annotations

from gesture_bridge.control.actions import build_action_adapter
from gesture_bridge.control.gestures import ControlGestureRecognizer
from gesture_bridge.core.features import index_tip_position, select_primary_hand
from gesture_bridge.core.io import load_json
from gesture_bridge.core.overlay import draw_hand, draw_pointer, draw_status_panel
from gesture_bridge.core.stability import CooldownGate, ExponentialSmoother, StablePredictionTracker


def _action_spec(action_map: dict[str, dict[str, object]], gesture_name: str) -> dict[str, object]:
    return action_map.get(gesture_name, {})


def _dispatch_action(
    action_name: str,
    adapter,
    cursor_point: tuple[float, float] | None,
    scroll_amount: int,
) -> str:
    if action_name == "idle":
        return "idle"
    if action_name == "move_cursor":
        if cursor_point is None:
            return "cursor unavailable"
        adapter.move_cursor(*cursor_point)
        return f"move cursor {cursor_point[0]:.2f}, {cursor_point[1]:.2f}"
    if action_name == "left_click":
        if cursor_point is not None:
            adapter.move_cursor(*cursor_point)
        adapter.left_click()
        return "left click"
    if action_name == "next_slide":
        adapter.press_key("right")
        return "next slide"
    if action_name == "previous_slide":
        adapter.press_key("left")
        return "previous slide"
    if action_name == "scroll_up":
        adapter.scroll(scroll_amount)
        return f"scroll +{scroll_amount}"
    if action_name == "scroll_down":
        adapter.scroll(-scroll_amount)
        return f"scroll -{scroll_amount}"
    return f"unmapped action `{action_name}`"


def run_pc_control(args) -> int:
    from gesture_bridge.core.camera import WebcamStream
    from gesture_bridge.core.landmarks import MediaPipeHandsTracker

    try:
        import cv2
    except ImportError as exc:  # pragma: no cover - import failure is runtime-specific
        raise RuntimeError(
            "OpenCV is required for PC-control mode. Install with `pip install -e \".[vision]\"`."
        ) from exc

    action_map = load_json(args.config)
    action_adapter = build_action_adapter(live=args.live)
    recognizer = ControlGestureRecognizer()
    cooldown_gate = CooldownGate()
    cursor_smoother = ExponentialSmoother(alpha=args.cursor_alpha)
    discrete_gesture_tracker = StablePredictionTracker(
        window_size=args.stability_window,
        min_count=args.stability_min_count,
    )
    last_action = "none"
    current_gesture = "none"
    current_confidence = 0.0
    raw_gesture = "none"
    raw_confidence = 0.0

    with WebcamStream(
        camera_index=args.camera_index,
        width=args.width,
        height=args.height,
        mirror=not args.no_mirror,
        backend=args.camera_backend,
    ) as stream, MediaPipeHandsTracker(max_hands=1) as tracker:
        while True:
            frame, timestamp_ms = stream.read()
            hands = tracker.process(frame, timestamp_ms)
            hand = select_primary_hand(hands, preferred_hand=args.preferred_hand)
            gesture = recognizer.predict(hand)

            cursor_point = None
            if hand is not None:
                cursor_point = cursor_smoother.update(index_tip_position(hand))

            if gesture is not None:
                raw_gesture = gesture.name
                raw_confidence = gesture.confidence

                if gesture.name == "point":
                    current_gesture = gesture.name
                    current_confidence = gesture.confidence
                    stable_gesture = gesture
                    discrete_gesture_tracker.update(None)
                else:
                    stable_prediction = discrete_gesture_tracker.update(gesture.name, gesture.confidence)
                    if stable_prediction is not None:
                        current_gesture = stable_prediction.name
                        current_confidence = stable_prediction.confidence
                        stable_gesture = stable_prediction
                    else:
                        current_gesture = "stabilizing"
                        current_confidence = gesture.confidence
                        stable_gesture = None

                if stable_gesture is None:
                    action_name = "idle"
                    cooldown_ms = 0
                else:
                    spec = _action_spec(action_map, stable_gesture.name)
                    action_name = str(spec.get("action", "idle"))
                    cooldown_ms = int(spec.get("cooldown_ms", args.default_cooldown_ms))

                if stable_gesture is None:
                    pass
                elif action_name == "move_cursor":
                    last_action = _dispatch_action(
                        action_name=action_name,
                        adapter=action_adapter,
                        cursor_point=cursor_point,
                        scroll_amount=args.scroll_amount,
                    )
                elif cooldown_gate.ready(action_name, cooldown_ms):
                    last_action = _dispatch_action(
                        action_name=action_name,
                        adapter=action_adapter,
                        cursor_point=cursor_point,
                        scroll_amount=args.scroll_amount,
                    )
            else:
                discrete_gesture_tracker.update(None)
                raw_gesture = "none"
                raw_confidence = 0.0
                current_gesture = "none"
                current_confidence = 0.0

            if not args.no_overlay:
                draw_hand(frame, hand)
                if cursor_point is not None:
                    draw_pointer(frame, cursor_point)
                draw_status_panel(
                    frame,
                    [
                        f"Mode: PC control ({'LIVE' if action_adapter.live else 'DRY RUN'})",
                        f"Gesture: {current_gesture} ({current_confidence:.2f})",
                        f"Raw: {raw_gesture} ({raw_confidence:.2f})",
                        f"Action: {last_action}",
                        f"Preferred hand: {args.preferred_hand}",
                        "Keys: q quit",
                    ],
                )
                cv2.imshow("Gesture Bridge - PC Control", frame)

            pressed = cv2.waitKey(1) & 0xFF
            if pressed in (27, ord("q")):
                break

        cv2.destroyAllWindows()

    return 0
