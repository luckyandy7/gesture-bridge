from __future__ import annotations

import argparse

from gesture_bridge.blueprint import build_blueprint, render_overview, render_roadmap, render_tree
from gesture_bridge.core.camera import probe_cameras
from gesture_bridge.sign.classifier import train_sign_classifier
from gesture_bridge.sign.config import load_sign_label_config
from gesture_bridge.sign.dataset import collect_sign_sequences


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="gesture-bridge",
        description="Shared hand-gesture project for sign-to-text and PC control.",
    )
    subparsers = parser.add_subparsers(dest="command")

    subparsers.add_parser("overview", help="Show the shared architecture and mode split.")
    subparsers.add_parser("roadmap", help="Show the phased implementation plan.")
    subparsers.add_parser("tree", help="Show the project tree and planned modules.")

    probe_camera = subparsers.add_parser(
        "probe-camera",
        help="Probe camera indices and OpenCV backends to find a readable source.",
    )
    probe_camera.add_argument(
        "--camera-backend",
        choices=("auto", "default", "avfoundation"),
        default="auto",
        help="OpenCV capture backend. `auto` checks both on macOS.",
    )
    probe_camera.add_argument(
        "--indices",
        nargs="+",
        type=int,
        default=[0, 1, 2],
        help="Camera indices to test.",
    )
    probe_camera.add_argument("--width", type=int, default=1280, help="Probe capture width.")
    probe_camera.add_argument("--height", type=int, default=720, help="Probe capture height.")

    pc_control = subparsers.add_parser("pc-control", help="Run real-time hand gesture PC control.")
    _add_common_camera_args(pc_control)
    pc_control.add_argument(
        "--config",
        default="configs/gesture_actions.example.json",
        help="Gesture-to-action mapping JSON.",
    )
    pc_control.add_argument(
        "--preferred-hand",
        choices=("any", "left", "right"),
        default="any",
        help="Use a specific hand when multiple hands appear.",
    )
    pc_control.add_argument(
        "--cursor-alpha",
        type=float,
        default=0.3,
        help="Cursor smoothing factor between 0 and 1.",
    )
    pc_control.add_argument(
        "--scroll-amount",
        type=int,
        default=240,
        help="Scroll delta used by thumbs-up and thumbs-down gestures.",
    )
    pc_control.add_argument(
        "--default-cooldown-ms",
        type=int,
        default=850,
        help="Fallback cooldown when the config does not provide one.",
    )
    pc_control.add_argument(
        "--stability-window",
        type=int,
        default=4,
        help="History size used to stabilize discrete control gestures.",
    )
    pc_control.add_argument(
        "--stability-min-count",
        type=int,
        default=3,
        help="Matching predictions required before firing non-pointer gestures.",
    )
    pc_control.add_argument(
        "--live",
        action="store_true",
        help="Enable real OS control. Without this flag the mode runs in dry-run.",
    )
    pc_control.add_argument("--no-overlay", action="store_true", help="Disable the OpenCV status overlay.")

    collect_signs = subparsers.add_parser(
        "collect-signs",
        help="Collect landmark sequences for one sign label from a webcam.",
    )
    _add_common_camera_args(collect_signs)
    collect_signs.add_argument("--label", required=True, help="Label name to record.")
    collect_signs.add_argument(
        "--labels-config",
        default="configs/sign_labels.example.json",
        help="JSON config containing allowed labels and sequence length.",
    )
    collect_signs.add_argument(
        "--output-dir",
        default="data/raw/signs",
        help="Directory where collected sequences are saved.",
    )
    collect_signs.add_argument(
        "--sequences",
        type=int,
        default=20,
        help="Number of sequences to record for the label.",
    )
    collect_signs.add_argument(
        "--prepare-seconds",
        type=float,
        default=2.0,
        help="Countdown duration before each recording starts.",
    )

    train_signs = subparsers.add_parser(
        "train-signs",
        help="Train the baseline sign classifier from saved landmark sequences.",
    )
    train_signs.add_argument(
        "--labels-config",
        default="configs/sign_labels.example.json",
        help="JSON config containing labels and sequence length.",
    )
    train_signs.add_argument(
        "--data-dir",
        default="data/raw/signs",
        help="Directory containing label subfolders with collected sequences.",
    )
    train_signs.add_argument(
        "--model-path",
        default="models/sign_knn.joblib",
        help="Where to save the trained model bundle.",
    )
    train_signs.add_argument(
        "--neighbors",
        type=int,
        default=3,
        help="Neighbor count for the KNN baseline.",
    )

    sign_text = subparsers.add_parser(
        "sign-text",
        help="Run live sign-to-text inference from a trained landmark model.",
    )
    _add_common_camera_args(sign_text)
    sign_text.add_argument(
        "--labels-config",
        default="configs/sign_labels.example.json",
        help="JSON config containing labels and sequence length.",
    )
    sign_text.add_argument(
        "--model-path",
        default="models/sign_knn.joblib",
        help="Path to the trained sign model bundle.",
    )
    sign_text.add_argument(
        "--min-confidence",
        type=float,
        default=0.7,
        help="Confidence required before a prediction can be emitted.",
    )
    sign_text.add_argument(
        "--predict-every",
        type=int,
        default=2,
        help="Run model inference every N buffered frames.",
    )
    sign_text.add_argument(
        "--cooldown-ms",
        type=int,
        default=1500,
        help="Minimum time between repeated emissions of the same sign token.",
    )
    sign_text.add_argument(
        "--stability-window",
        type=int,
        default=6,
        help="Prediction history size used for stabilization.",
    )
    sign_text.add_argument(
        "--stability-min-count",
        type=int,
        default=4,
        help="How many matching predictions are required before emitting a token.",
    )
    sign_text.add_argument(
        "--max-tokens",
        type=int,
        default=20,
        help="Maximum number of output tokens kept in the on-screen transcript.",
    )
    sign_text.add_argument("--no-overlay", action="store_true", help="Disable the OpenCV status overlay.")

    return parser


def _add_common_camera_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--camera-index", type=int, default=1, help="Webcam index passed to OpenCV.")
    parser.add_argument("--width", type=int, default=1280, help="Capture width.")
    parser.add_argument("--height", type=int, default=720, help="Capture height.")
    parser.add_argument(
        "--camera-backend",
        choices=("auto", "default", "avfoundation"),
        default="default",
        help="OpenCV capture backend.",
    )
    parser.add_argument("--no-mirror", action="store_true", help="Disable mirror mode for the camera preview.")


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    blueprint = build_blueprint()

    if args.command == "overview":
        print(render_overview(blueprint))
        return 0

    if args.command == "roadmap":
        print(render_roadmap(blueprint))
        return 0

    if args.command == "tree":
        print(render_tree(blueprint))
        return 0

    if args.command == "probe-camera":
        results = probe_cameras(
            camera_indices=tuple(args.indices),
            width=args.width,
            height=args.height,
            backend=args.camera_backend,
        )
        print("Camera probe results")
        for result in results:
            print(
                f"  index={result.camera_index} backend={result.backend_label} "
                f"opened={result.opened} readable={result.readable} attempts={result.attempts}"
            )
        return 0

    if args.command == "pc-control":
        from gesture_bridge.modes.pc_control import run_pc_control

        return run_pc_control(args)

    if args.command == "collect-signs":
        label_config = load_sign_label_config(args.labels_config)
        collected = collect_sign_sequences(
            label=args.label,
            config=label_config,
            output_dir=args.output_dir,
            sequence_count=args.sequences,
            camera_index=args.camera_index,
            width=args.width,
            height=args.height,
            mirror=not args.no_mirror,
            backend=args.camera_backend,
            prepare_seconds=args.prepare_seconds,
        )
        print(f"Collected {collected} sequences for label `{args.label}`.")
        return 0

    if args.command == "train-signs":
        label_config = load_sign_label_config(args.labels_config)
        report = train_sign_classifier(
            config=label_config,
            data_dir=args.data_dir,
            model_path=args.model_path,
            neighbors=args.neighbors,
        )
        print("Training complete")
        print(f"  model: {report['model_path']}")
        print(f"  accuracy: {report['accuracy']}")
        print(f"  samples: {report['samples']}")
        print(f"  eval split: {report['eval_split']}")
        print(f"  feature shape: {report['target_shape']}")
        print("  label counts:")
        for label, count in report["counts"].items():
            print(f"    - {label}: {count}")
        skipped_counts = report.get("skipped_counts", {})
        if any(skipped_counts.values()):
            print("  skipped legacy or mismatched files:")
            for label, count in skipped_counts.items():
                if count:
                    print(f"    - {label}: {count}")
        return 0

    if args.command == "sign-text":
        from gesture_bridge.modes.sign_text import run_sign_text

        return run_sign_text(args)

    parser.print_help()
    return 0
