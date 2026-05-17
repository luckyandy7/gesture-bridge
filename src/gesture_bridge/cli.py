from __future__ import annotations

import argparse

from gesture_bridge.blueprint import build_blueprint, render_overview, render_roadmap, render_tree
from gesture_bridge.core.camera import probe_cameras
from gesture_bridge.sign.classifier import train_sign_classifier
from gesture_bridge.sign.config import load_sign_label_config
from gesture_bridge.sign.dataset import collect_sign_sequences
from gesture_bridge.sign.sentence import (
    DEFAULT_SENTENCE_DATA_DIR,
    DEFAULT_SENTENCE_MODEL_PATH,
    build_sentence_memory_model,
    default_sentence_csv_paths,
    download_gksl_sentence_data,
    load_sentence_memory,
)
from gesture_bridge.sign.resources import (
    DEFAULT_EXPANDED_LABEL_CONFIG,
    DEFAULT_IMPORTED_SENTENCE_CSV,
    DEFAULT_IMPORTED_SENTENCE_MANIFEST,
    DEFAULT_KSL_LEX_DIR,
    build_sentence_label_config,
    download_ksl_lexicon,
    import_local_sentence_corpus,
    prepare_sentence_resources,
)


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

    download_sentence_data = subparsers.add_parser(
        "download-sentence-data",
        help="Download open GKSL gloss-to-Korean sentence CSV files used by sentence output.",
    )
    download_sentence_data.add_argument(
        "--output-dir",
        default=str(DEFAULT_SENTENCE_DATA_DIR),
        help="Directory where GKSL CSV and license files are saved.",
    )

    download_ksl_lex = subparsers.add_parser(
        "download-ksl-lex",
        help="Download the public KSL-LEX Korean sign lexicon from Hugging Face.",
    )
    download_ksl_lex.add_argument(
        "--output-dir",
        default=str(DEFAULT_KSL_LEX_DIR),
        help="Directory where the KSL-LEX CSV and metadata are saved.",
    )

    prepare_sentence_resources_parser = subparsers.add_parser(
        "prepare-sentence-resources",
        help="Download public sentence resources and rebuild sentence model plus expanded gloss labels.",
    )
    prepare_sentence_resources_parser.add_argument(
        "--gksl-dir",
        default=str(DEFAULT_SENTENCE_DATA_DIR),
        help="Directory where GKSL CSV and license files are saved.",
    )
    prepare_sentence_resources_parser.add_argument(
        "--ksl-lex-dir",
        default=str(DEFAULT_KSL_LEX_DIR),
        help="Directory where KSL-LEX CSV and metadata are saved.",
    )
    prepare_sentence_resources_parser.add_argument(
        "--sentence-model-path",
        default=str(DEFAULT_SENTENCE_MODEL_PATH),
        help="Where to save the sentence translation memory JSON.",
    )
    prepare_sentence_resources_parser.add_argument(
        "--expanded-labels-config",
        default=str(DEFAULT_EXPANDED_LABEL_CONFIG),
        help="Where to save the expanded Korean gloss label config.",
    )
    prepare_sentence_resources_parser.add_argument(
        "--seed-labels-config",
        default="configs/korean_sentence_gloss_labels.example.json",
        help="Existing label config whose labels should be preserved first.",
    )
    prepare_sentence_resources_parser.add_argument(
        "--max-labels",
        type=int,
        default=160,
        help="Maximum labels to include in the expanded label config.",
    )
    prepare_sentence_resources_parser.add_argument(
        "--sequence-length",
        type=int,
        default=30,
        help="Sequence length to write if the seed config does not exist.",
    )

    build_sentence_model = subparsers.add_parser(
        "build-sentence-model",
        help="Build the gloss-to-Korean sentence translation memory used after sign recognition.",
    )
    build_sentence_model.add_argument(
        "--csv",
        nargs="*",
        default=None,
        help="CSV files with GKSL gloss and Korean sentence columns. Defaults to data/external/gksl/*.csv.",
    )
    build_sentence_model.add_argument(
        "--model-path",
        default=str(DEFAULT_SENTENCE_MODEL_PATH),
        help="Where to save the sentence translation memory JSON.",
    )
    build_sentence_model.add_argument(
        "--data-dir",
        default=str(DEFAULT_SENTENCE_DATA_DIR),
        help="Directory used when --csv is omitted.",
    )

    build_sentence_labels = subparsers.add_parser(
        "build-sentence-labels",
        help="Build an expanded Korean gloss label config from GKSL frequency and KSL-LEX vocabulary.",
    )
    build_sentence_labels.add_argument(
        "--output-path",
        default=str(DEFAULT_EXPANDED_LABEL_CONFIG),
        help="Where to save the expanded label config JSON.",
    )
    build_sentence_labels.add_argument(
        "--seed-labels-config",
        default="configs/korean_sentence_gloss_labels.example.json",
        help="Existing label config whose labels should be preserved first.",
    )
    build_sentence_labels.add_argument(
        "--data-dir",
        default=str(DEFAULT_SENTENCE_DATA_DIR),
        help="Directory containing GKSL CSV files.",
    )
    build_sentence_labels.add_argument(
        "--ksl-lex-csv",
        default=str(DEFAULT_KSL_LEX_DIR / "KSL-LEX.csv"),
        help="Downloaded KSL-LEX CSV path.",
    )
    build_sentence_labels.add_argument(
        "--max-labels",
        type=int,
        default=160,
        help="Maximum labels to include.",
    )
    build_sentence_labels.add_argument(
        "--sequence-length",
        type=int,
        default=30,
        help="Sequence length to write if the seed config does not exist.",
    )

    import_sentence_corpus_parser = subparsers.add_parser(
        "import-sentence-corpus",
        help="Import manually downloaded AI Hub/NIKL/KSL corpus files into a GKSL-compatible CSV.",
    )
    import_sentence_corpus_parser.add_argument(
        "input_dir",
        help="Directory containing extracted CSV, JSON, JSONL, or XML annotation files.",
    )
    import_sentence_corpus_parser.add_argument(
        "--output-csv",
        default=str(DEFAULT_IMPORTED_SENTENCE_CSV),
        help="Where to save imported gloss/Korean sentence pairs.",
    )
    import_sentence_corpus_parser.add_argument(
        "--manifest-path",
        default=str(DEFAULT_IMPORTED_SENTENCE_MANIFEST),
        help="Where to save the import manifest with source paths.",
    )

    translate_gloss = subparsers.add_parser(
        "translate-gloss",
        help="Translate a manually provided GKSL gloss token sequence into a Korean sentence.",
    )
    translate_gloss.add_argument("tokens", nargs="+", help="Gloss tokens, e.g. `집 불`.")
    translate_gloss.add_argument(
        "--sentence-model-path",
        default=str(DEFAULT_SENTENCE_MODEL_PATH),
        help="Gloss-to-Korean sentence memory JSON.",
    )
    translate_gloss.add_argument(
        "--sentence-data-dir",
        default=str(DEFAULT_SENTENCE_DATA_DIR),
        help="Fallback CSV directory if the model JSON is absent.",
    )
    translate_gloss.add_argument(
        "--sentence-fuzzy-threshold",
        type=float,
        default=0.56,
        help="Minimum fuzzy match score.",
    )

    sign_text = subparsers.add_parser(
        "sign-text",
        help="Run live sign inference. Defaults to Korean sentence output; use --output-mode words for legacy output.",
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
    sign_text.add_argument(
        "--output-mode",
        choices=("sentence", "words", "both"),
        default="sentence",
        help="`sentence` translates recognized gloss tokens into Korean sentences. `words` is the legacy token output.",
    )
    sign_text.add_argument(
        "--sentence-model-path",
        default=str(DEFAULT_SENTENCE_MODEL_PATH),
        help="Gloss-to-Korean sentence memory JSON. If absent, bundled CSV data or built-in fallbacks are used.",
    )
    sign_text.add_argument(
        "--sentence-data-dir",
        default=str(DEFAULT_SENTENCE_DATA_DIR),
        help="Directory containing GKSL CSV files used when the sentence model JSON is absent.",
    )
    sign_text.add_argument(
        "--sentence-fuzzy-threshold",
        type=float,
        default=0.56,
        help="Minimum fuzzy match score for sentence memory lookup.",
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

    if args.command == "download-sentence-data":
        downloaded = download_gksl_sentence_data(args.output_dir)
        print("Downloaded sentence data")
        for name, path in downloaded.items():
            print(f"  - {name}: {path}")
        print("License: CC BY-NC-SA 4.0. Use only where this license fits your project.")
        return 0

    if args.command == "download-ksl-lex":
        report = download_ksl_lexicon(args.output_dir)
        print("Downloaded KSL-LEX lexicon")
        print(f"  csv: {report['csv_path']}")
        print(f"  metadata: {report['metadata_path']}")
        print(f"  rows: {report['rows']}")
        print(f"  source: {report['source_url']}")
        return 0

    if args.command == "prepare-sentence-resources":
        report = prepare_sentence_resources(
            gksl_dir=args.gksl_dir,
            ksl_lex_dir=args.ksl_lex_dir,
            sentence_model_path=args.sentence_model_path,
            expanded_label_config_path=args.expanded_labels_config,
            seed_label_config_path=args.seed_labels_config,
            max_labels=args.max_labels,
            sequence_length=args.sequence_length,
        )
        print("Sentence resources prepared")
        print(f"  sentence model: {report['sentence_model']['model_path']}")
        print(f"  sentence entries: {report['sentence_model']['entries']}")
        print(f"  expanded labels: {report['label_config']['output_path']}")
        print(f"  label count: {report['label_config']['labels']}")
        print(f"  KSL-LEX rows: {report['ksl_lex']['rows']}")
        print(f"  KSL-Guide reference: {report['ksl_guide_reference']}")
        print("  gated datasets: AI Hub/NIKL originals still require their own login or approval.")
        return 0

    if args.command == "build-sentence-model":
        csv_paths = args.csv if args.csv else default_sentence_csv_paths(args.data_dir)
        report = build_sentence_memory_model(csv_paths=csv_paths, model_path=args.model_path)
        print("Sentence model build complete")
        print(f"  model: {report['model_path']}")
        print(f"  entries: {report['entries']}")
        print(f"  exact glosses: {report['exact_glosses']}")
        print(f"  vocabulary: {report['vocabulary']}")
        print("  top gloss tokens:")
        for token, count in report["top_tokens"]:
            print(f"    - {token}: {count}")
        return 0

    if args.command == "build-sentence-labels":
        csv_paths = default_sentence_csv_paths(args.data_dir)
        report = build_sentence_label_config(
            output_path=args.output_path,
            seed_config_path=args.seed_labels_config,
            gksl_csv_paths=csv_paths,
            ksl_lex_csv_path=args.ksl_lex_csv,
            max_labels=args.max_labels,
            sequence_length=args.sequence_length,
        )
        print("Sentence label config build complete")
        print(f"  config: {report['output_path']}")
        print(f"  labels: {report['labels']}")
        print(f"  GKSL vocabulary: {report['gksl_vocabulary']}")
        print(f"  KSL-LEX terms: {report['ksl_lex_terms']}")
        print("  top GKSL tokens:")
        for token, count in report["top_gksl_tokens"]:
            print(f"    - {token}: {count}")
        return 0

    if args.command == "import-sentence-corpus":
        report = import_local_sentence_corpus(
            input_dir=args.input_dir,
            output_csv=args.output_csv,
            manifest_path=args.manifest_path,
        )
        print("Sentence corpus import complete")
        print(f"  input: {report['input_dir']}")
        print(f"  output csv: {report['output_csv']}")
        print(f"  manifest: {report['manifest_path']}")
        print(f"  pairs: {report['pairs']}")
        return 0

    if args.command == "translate-gloss":
        memory = load_sentence_memory(
            model_path=args.sentence_model_path,
            data_dir=args.sentence_data_dir,
        )
        candidate = memory.translate(args.tokens, fuzzy_threshold=args.sentence_fuzzy_threshold)
        print("Gloss:")
        print(" ".join(args.tokens))
        print("Korean sentence:")
        print(candidate.sentence)
        print(f"Source: {candidate.source}, score={candidate.score:.2f}, matched_gloss={candidate.gloss}")
        return 0

    if args.command == "sign-text":
        from gesture_bridge.modes.sign_text import run_sign_text

        return run_sign_text(args)

    parser.print_help()
    return 0
