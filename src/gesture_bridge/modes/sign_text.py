from __future__ import annotations

from collections import deque

import numpy as np

from gesture_bridge.core.features import flatten_holistic_frame_features
from gesture_bridge.core.overlay import draw_holistic_sign, draw_status_panel
from gesture_bridge.core.stability import CooldownGate, StablePredictionTracker
from gesture_bridge.sign.classifier import load_sign_model, predict_sign_sequence
from gesture_bridge.sign.config import load_sign_label_config
from gesture_bridge.sign.sentence import SignSentenceAssembler, load_sentence_memory


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
    output_mode = args.output_mode
    sentence_assembler: SignSentenceAssembler | None = None
    sentence_source = "legacy"
    sentence_text = "-"

    if output_mode != "words":
        sentence_memory = load_sentence_memory(
            model_path=args.sentence_model_path,
            data_dir=args.sentence_data_dir,
        )
        sentence_assembler = SignSentenceAssembler(
            translation_memory=sentence_memory,
            max_tokens=args.max_tokens,
            fuzzy_threshold=args.sentence_fuzzy_threshold,
        )
        sentence_source = "ready"

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
                            if sentence_assembler is not None:
                                sentence_state = sentence_assembler.append(stable.name)
                                sentence_text = sentence_state.final_text
                                if sentence_state.latest_candidate is not None:
                                    sentence_source = (
                                        f"{sentence_state.latest_candidate.source} "
                                        f"({sentence_state.latest_candidate.score:.2f})"
                                    )
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
                overlay_lines = [
                    f"Mode: sign-to-{'sentence' if output_mode != 'words' else 'words'}",
                    f"Prediction: {latest_label} ({latest_confidence:.2f})",
                    f"Buffer: {len(sequence_buffer)}/{model.sequence_length}",
                    f"Hands: {hand_status}",
                    f"Gloss tokens: {' '.join(token_buffer) if token_buffer else '-'}",
                ]
                if output_mode != "words":
                    overlay_lines.extend(
                        [
                            f"Sentence: {sentence_text}",
                            f"Sentence source: {sentence_source}",
                        ]
                    )
                overlay_lines.append("Keys: c clear, b backspace sentence, enter finalize, q quit")
                draw_status_panel(frame, overlay_lines)
                cv2.imshow("Gesture Bridge - Sign Text", frame)

            pressed = cv2.waitKey(1) & 0xFF
            if pressed in (27, ord("q")):
                break
            if pressed == ord("c"):
                token_buffer.clear()
                stabilizer.update(None)
                if sentence_assembler is not None:
                    sentence_assembler.clear()
                    sentence_text = "-"
                    sentence_source = "cleared"
            if pressed == ord("b") and sentence_assembler is not None:
                sentence_state = sentence_assembler.backspace()
                sentence_text = sentence_state.final_text
                sentence_source = "manual-backspace"
            if pressed in (10, 13) and sentence_assembler is not None:
                sentence_state = sentence_assembler.finalize()
                sentence_text = sentence_state.final_text
                sentence_source = "manual-finalize"

        cv2.destroyAllWindows()

    if output_mode != "words" and sentence_assembler is not None:
        sentence_state = sentence_assembler.finalize()
        if sentence_state.final_text != "-":
            print("Recognized sentence:")
            print(sentence_state.final_text)

    if token_buffer and output_mode in ("words", "both"):
        print("Recognized tokens:")
        print(" ".join(token_buffer))

    return 0
