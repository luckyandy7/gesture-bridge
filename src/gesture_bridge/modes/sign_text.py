from __future__ import annotations

from collections import deque

import numpy as np

from gesture_bridge.core.features import flatten_holistic_frame_features
from gesture_bridge.core.overlay import draw_holistic_sign, draw_status_panel
from gesture_bridge.core.stability import CooldownGate, StablePredictionTracker
from gesture_bridge.sign.classifier import load_sign_model, predict_sign_sequence
from gesture_bridge.sign.config import load_sign_label_config


def run_sign_text(args) -> int:
    from gesture_bridge.core.camera import WebcamStream
    from gesture_bridge.core.holistic import MediaPipeHolisticTracker

    try:
        import cv2
    except ImportError as exc:  # pragma: no cover - import failure is runtime-specific
        raise RuntimeError(
            "OpenCV is required for sign-text mode. Install with `pip install -e \".[vision]\"`."
        ) from exc

    label_config = load_sign_label_config(args.labels_config)
    model = load_sign_model(args.model_path)
    if model.sequence_length != label_config.sequence_length:
        raise RuntimeError(
            "Model sequence length does not match the label config. "
            f"Model={model.sequence_length}, config={label_config.sequence_length}."
        )

    sequence_buffer: deque[np.ndarray] = deque(maxlen=model.sequence_length)
    token_buffer: deque[str] = deque(maxlen=args.max_tokens)
    stabilizer = StablePredictionTracker(window_size=args.stability_window, min_count=args.stability_min_count)
    emission_gate = CooldownGate()
    latest_label = "none"
    latest_confidence = 0.0
    frame_index = 0

    with WebcamStream(
        camera_index=args.camera_index,
        width=args.width,
        height=args.height,
        mirror=not args.no_mirror,
        backend=args.camera_backend,
    ) as stream, MediaPipeHolisticTracker() as tracker:
        while True:
            frame, timestamp_ms = stream.read()
            observation = tracker.process(frame, timestamp_ms)

            if observation is not None:
                sequence_buffer.append(flatten_holistic_frame_features(observation))
            else:
                sequence_buffer.clear()
                stabilizer.update(None)

            if len(sequence_buffer) == model.sequence_length:
                frame_index += 1
                if frame_index % args.predict_every == 0:
                    prediction = predict_sign_sequence(model, np.stack(sequence_buffer, axis=0))
                    latest_label = prediction.name
                    latest_confidence = prediction.confidence

                    stable = None
                    if prediction.confidence >= args.min_confidence:
                        stable = stabilizer.update(prediction.name, prediction.confidence)
                    else:
                        stabilizer.update(None)

                    if stable is not None and emission_gate.ready(stable.name, args.cooldown_ms):
                        if not token_buffer or token_buffer[-1] != stable.name:
                            token_buffer.append(stable.name)
            else:
                latest_label = "no-body" if observation is None else "buffering"
                latest_confidence = len(sequence_buffer) / model.sequence_length

            if not args.no_overlay:
                draw_holistic_sign(frame, observation)
                hand_status = "-"
                if observation is not None:
                    hand_status = (
                        f"L:{'on' if observation.has_left_hand() else 'off'} "
                        f"R:{'on' if observation.has_right_hand() else 'off'}"
                    )
                draw_status_panel(
                    frame,
                    [
                        "Mode: sign-to-text (two hands + arms)",
                        f"Prediction: {latest_label} ({latest_confidence:.2f})",
                        f"Buffer: {len(sequence_buffer)}/{model.sequence_length}",
                        f"Hands: {hand_status}",
                        f"Output: {' '.join(token_buffer) if token_buffer else '-'}",
                        "Keys: c clear, q quit",
                    ],
                )
                cv2.imshow("Gesture Bridge - Sign Text", frame)

            pressed = cv2.waitKey(1) & 0xFF
            if pressed in (27, ord("q")):
                break
            if pressed == ord("c"):
                token_buffer.clear()
                stabilizer.update(None)

        cv2.destroyAllWindows()

    if token_buffer:
        print("Recognized tokens:")
        print(" ".join(token_buffer))

    return 0
