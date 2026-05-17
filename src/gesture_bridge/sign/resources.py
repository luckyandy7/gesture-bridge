from __future__ import annotations

from collections import Counter
import csv
from dataclasses import dataclass
import json
from pathlib import Path
import re
from typing import Any, Iterable
from urllib.parse import urlencode
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET

from gesture_bridge.core.downloads import USER_AGENT, download_url
from gesture_bridge.core.io import load_json
from gesture_bridge.core.paths import resolve_project_path
from gesture_bridge.sign.sentence import (
    DEFAULT_SENTENCE_DATA_DIR,
    GLOSS_COLUMN,
    KOREAN_COLUMN,
    build_sentence_memory_model,
    default_sentence_csv_paths,
    download_gksl_sentence_data,
    normalize_gloss_sentence,
    normalize_korean_sentence,
    split_gloss,
)


DEFAULT_KSL_LEX_DATASET = "AAILab/KSL-LEX"
DEFAULT_KSL_LEX_CONFIG = "default"
DEFAULT_KSL_LEX_SPLIT = "train"
DEFAULT_KSL_LEX_DIR = Path("data/external/ksl_lex")
DEFAULT_KSL_LEX_CSV = DEFAULT_KSL_LEX_DIR / "KSL-LEX.csv"
DEFAULT_EXPANDED_LABEL_CONFIG = Path("configs/korean_sentence_gloss_labels.expanded.json")
DEFAULT_IMPORTED_SENTENCE_CSV = Path("data/external/local_sentence_corpus/imported_sentence_pairs.csv")
DEFAULT_IMPORTED_SENTENCE_MANIFEST = Path("data/external/local_sentence_corpus/import_manifest.json")

HF_DATASET_VIEWER_BASE_URL = "https://datasets-server.huggingface.co"
KSL_LEX_SOURCE_URL = "https://huggingface.co/datasets/AAILab/KSL-LEX"
KSL_GUIDE_README_URL = "https://raw.githubusercontent.com/ChelseaGH/KSL-Guide/main/README.md"
KSL_GUIDE_REFERENCE_DIR = Path("data/external/ksl_guide")

KSL_LEX_FIELDS = ("Headword", "POS", "Same_Sign_Words", "Additional_Info", "Homonym_Info")

GLOSS_FIELD_HINTS = (
    "gloss",
    "gloss_id",
    "gksl",
    "sign_gesture",
    "sign_gestures",
    "수어",
    "수지",
)
KOREAN_FIELD_HINTS = (
    "korean text",
    "korean_text",
    "korean",
    "translation",
    "sentence",
    "question",
    "wkl",
    "한국어",
    "문장",
)
VIDEO_FIELD_HINTS = ("video", "mp4", "영상")
KEYPOINT_FIELD_HINTS = ("keypoint", "landmark", "pose", "hand", "face", "키포인트")


@dataclass(frozen=True)
class SentencePair:
    gloss: str
    sentence: str
    source_path: str
    video_path: str = ""
    keypoint_path: str = ""


def prepare_sentence_resources(
    *,
    gksl_dir: str | Path = DEFAULT_SENTENCE_DATA_DIR,
    ksl_lex_dir: str | Path = DEFAULT_KSL_LEX_DIR,
    sentence_model_path: str | Path,
    expanded_label_config_path: str | Path = DEFAULT_EXPANDED_LABEL_CONFIG,
    seed_label_config_path: str | Path | None = "configs/korean_sentence_gloss_labels.example.json",
    max_labels: int = 160,
    sequence_length: int = 30,
) -> dict[str, object]:
    """Download public sentence resources and rebuild local derived files."""

    downloaded_gksl = download_gksl_sentence_data(gksl_dir)
    downloaded_lexicon = download_ksl_lexicon(ksl_lex_dir)
    ksl_guide_reference = download_ksl_guide_reference()
    csv_paths = default_sentence_csv_paths(gksl_dir)
    model_report = build_sentence_memory_model(csv_paths=csv_paths, model_path=sentence_model_path)
    label_report = build_sentence_label_config(
        output_path=expanded_label_config_path,
        seed_config_path=seed_label_config_path,
        gksl_csv_paths=csv_paths,
        ksl_lex_csv_path=downloaded_lexicon["csv_path"],
        max_labels=max_labels,
        sequence_length=sequence_length,
    )
    return {
        "gksl_files": {name: str(path) for name, path in downloaded_gksl.items()},
        "ksl_lex": downloaded_lexicon,
        "ksl_guide_reference": str(ksl_guide_reference),
        "sentence_model": model_report,
        "label_config": label_report,
    }


def download_ksl_lexicon(
    output_dir: str | Path = DEFAULT_KSL_LEX_DIR,
    *,
    dataset: str = DEFAULT_KSL_LEX_DATASET,
    config: str = DEFAULT_KSL_LEX_CONFIG,
    split: str = DEFAULT_KSL_LEX_SPLIT,
    page_size: int = 100,
) -> dict[str, object]:
    """Download the public KSL-LEX rows from Hugging Face Dataset Viewer."""

    root = resolve_project_path(output_dir)
    root.mkdir(parents=True, exist_ok=True)
    csv_path = root / "KSL-LEX.csv"
    metadata_path = root / "metadata.json"
    temp_csv_path = csv_path.with_suffix(".csv.download")

    first_page = _fetch_hf_dataset_page(
        dataset=dataset,
        config=config,
        split=split,
        offset=0,
        length=page_size,
    )
    total_rows = int(first_page.get("num_rows_total", len(first_page.get("rows", []))))
    fields = tuple(feature["name"] for feature in first_page.get("features", [])) or KSL_LEX_FIELDS

    try:
        written = _write_hf_rows(temp_csv_path, fields, first_page.get("rows", []), mode="w")
        for offset in range(page_size, total_rows, page_size):
            page = _fetch_hf_dataset_page(
                dataset=dataset,
                config=config,
                split=split,
                offset=offset,
                length=page_size,
            )
            written += _write_hf_rows(temp_csv_path, fields, page.get("rows", []), mode="a")
        temp_csv_path.replace(csv_path)
    finally:
        if temp_csv_path.exists():
            temp_csv_path.unlink()

    metadata = {
        "dataset": dataset,
        "config": config,
        "split": split,
        "source_url": KSL_LEX_SOURCE_URL,
        "rows": written,
        "fields": list(fields),
    }
    _write_json_atomic(metadata_path, metadata)

    return {
        "csv_path": str(csv_path),
        "metadata_path": str(metadata_path),
        "rows": written,
        "source_url": KSL_LEX_SOURCE_URL,
    }


def _write_json_atomic(path: Path, payload: object) -> None:
    temp_path = path.with_suffix(f"{path.suffix}.download")
    try:
        with temp_path.open("w", encoding="utf-8") as file:
            json.dump(payload, file, ensure_ascii=False, indent=2)
            file.write("\n")
        temp_path.replace(path)
    finally:
        if temp_path.exists():
            temp_path.unlink()


def download_ksl_guide_reference(output_dir: str | Path = KSL_GUIDE_REFERENCE_DIR) -> Path:
    """Save the public KSL-Guide README as a local reference.

    The actual KSL-Guide videos/keypoints are distributed through AI Hub, so this
    stores only the public access note and citation reference.
    """

    root = resolve_project_path(output_dir)
    root.mkdir(parents=True, exist_ok=True)
    output_path = root / "README.md"
    return download_url(KSL_GUIDE_README_URL, output_path)


def build_sentence_label_config(
    *,
    output_path: str | Path = DEFAULT_EXPANDED_LABEL_CONFIG,
    seed_config_path: str | Path | None = "configs/korean_sentence_gloss_labels.example.json",
    gksl_csv_paths: Iterable[str | Path] | None = None,
    ksl_lex_csv_path: str | Path = DEFAULT_KSL_LEX_CSV,
    max_labels: int = 160,
    sequence_length: int = 30,
) -> dict[str, object]:
    """Build a practical gloss label config from GKSL frequency + KSL-LEX terms."""

    labels: list[str] = []
    seen: set[str] = set()
    seed_labels = 0

    def add_label(label: str) -> None:
        normalized = _normalize_label(label)
        if not normalized or normalized in seen or len(labels) >= max_labels:
            return
        seen.add(normalized)
        labels.append(normalized)

    if seed_config_path is not None:
        seed_path = resolve_project_path(seed_config_path)
        if seed_path.exists():
            seed_payload = load_json(seed_path)
            sequence_length = int(seed_payload.get("sequence_length", sequence_length))
            for label in seed_payload.get("labels", []):
                before = len(labels)
                add_label(str(label))
                if len(labels) > before:
                    seed_labels += 1

    token_counts = count_gksl_gloss_tokens(gksl_csv_paths or default_sentence_csv_paths())
    for token, _count in token_counts.most_common():
        add_label(token)

    lexicon_terms = load_ksl_lexicon_terms(ksl_lex_csv_path)
    for term, _count in lexicon_terms.most_common():
        add_label(term)

    resolved_output = resolve_project_path(output_path)
    resolved_output.parent.mkdir(parents=True, exist_ok=True)
    with resolved_output.open("w", encoding="utf-8") as file:
        json.dump(
            {
                "sequence_length": sequence_length,
                "labels": labels,
            },
            file,
            ensure_ascii=False,
            indent=2,
        )
        file.write("\n")

    return {
        "output_path": str(resolved_output),
        "labels": len(labels),
        "seed_labels": seed_labels,
        "gksl_vocabulary": len(token_counts),
        "ksl_lex_terms": len(lexicon_terms),
        "top_gksl_tokens": token_counts.most_common(20),
    }


def count_gksl_gloss_tokens(csv_paths: Iterable[str | Path]) -> Counter[str]:
    counter: Counter[str] = Counter()
    for path in csv_paths:
        resolved = resolve_project_path(path)
        if not resolved.exists():
            continue
        with resolved.open(newline="", encoding="utf-8-sig") as file:
            reader = csv.DictReader(file)
            if GLOSS_COLUMN not in (reader.fieldnames or []):
                continue
            for row in reader:
                counter.update(split_gloss(row.get(GLOSS_COLUMN, "")))
    return counter


def load_ksl_lexicon_terms(path: str | Path = DEFAULT_KSL_LEX_CSV) -> Counter[str]:
    resolved = resolve_project_path(path)
    counter: Counter[str] = Counter()
    if not resolved.exists():
        return counter

    with resolved.open(newline="", encoding="utf-8-sig") as file:
        reader = csv.DictReader(file)
        for row in reader:
            for field in ("Headword", "Same_Sign_Words"):
                value = row.get(field)
                if not value:
                    continue
                for term in re.split(r"\s*[|,/;]\s*", str(value)):
                    normalized = _normalize_label(term)
                    if normalized:
                        counter[normalized] += 1
    return counter


def import_local_sentence_corpus(
    input_dir: str | Path,
    *,
    output_csv: str | Path = DEFAULT_IMPORTED_SENTENCE_CSV,
    manifest_path: str | Path = DEFAULT_IMPORTED_SENTENCE_MANIFEST,
) -> dict[str, object]:
    """Extract gloss/Korean sentence pairs from manually downloaded corpus files.

    This handles common CSV, JSON, JSONL, and XML layouts, including AI Hub-style
    JSON fields such as `Korean text` and `sign_gestures_*`.
    """

    root = resolve_project_path(input_dir)
    if not root.exists():
        raise FileNotFoundError(f"Corpus input directory does not exist: {root}")

    pairs: list[SentencePair] = []
    supported = {".csv", ".tsv", ".json", ".jsonl", ".xml"}
    for path in sorted(root.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in supported:
            continue
        pairs.extend(_extract_pairs_from_file(path, root))

    unique: dict[tuple[str, str, str], SentencePair] = {}
    for pair in pairs:
        key = (pair.gloss, pair.sentence, pair.source_path)
        unique.setdefault(key, pair)

    resolved_csv = resolve_project_path(output_csv)
    resolved_manifest = resolve_project_path(manifest_path)
    resolved_csv.parent.mkdir(parents=True, exist_ok=True)
    resolved_manifest.parent.mkdir(parents=True, exist_ok=True)

    ordered_pairs = list(unique.values())
    with resolved_csv.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(
            file,
            fieldnames=(GLOSS_COLUMN, KOREAN_COLUMN, "source_path", "video_path", "keypoint_path"),
        )
        writer.writeheader()
        for pair in ordered_pairs:
            writer.writerow(
                {
                    GLOSS_COLUMN: pair.gloss,
                    KOREAN_COLUMN: pair.sentence,
                    "source_path": pair.source_path,
                    "video_path": pair.video_path,
                    "keypoint_path": pair.keypoint_path,
                }
            )

    with resolved_manifest.open("w", encoding="utf-8") as file:
        json.dump(
            {
                "input_dir": str(root),
                "rows": [
                    {
                        "gloss": pair.gloss,
                        "sentence": pair.sentence,
                        "source_path": pair.source_path,
                        "video_path": pair.video_path,
                        "keypoint_path": pair.keypoint_path,
                    }
                    for pair in ordered_pairs
                ],
            },
            file,
            ensure_ascii=False,
            indent=2,
        )

    return {
        "input_dir": str(root),
        "output_csv": str(resolved_csv),
        "manifest_path": str(resolved_manifest),
        "pairs": len(ordered_pairs),
    }


def _fetch_hf_dataset_page(
    *,
    dataset: str,
    config: str,
    split: str,
    offset: int,
    length: int,
) -> dict[str, Any]:
    query = urlencode(
        {
            "dataset": dataset,
            "config": config,
            "split": split,
            "offset": offset,
            "length": min(length, 100),
        }
    )
    request = Request(f"{HF_DATASET_VIEWER_BASE_URL}/rows?{query}", headers={"User-Agent": USER_AGENT})
    with urlopen(request, timeout=60) as response:
        return json.loads(response.read().decode("utf-8"))


def _write_hf_rows(path: Path, fields: Iterable[str], rows: Iterable[dict[str, Any]], *, mode: str) -> int:
    rows = list(rows)
    with path.open(mode, newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=tuple(fields))
        if mode == "w":
            writer.writeheader()
        for item in rows:
            row = item.get("row", {})
            writer.writerow({field: row.get(field) for field in writer.fieldnames or ()})
    return len(rows)


def _extract_pairs_from_file(path: Path, root: Path) -> list[SentencePair]:
    suffix = path.suffix.lower()
    try:
        if suffix in {".csv", ".tsv"}:
            return _extract_pairs_from_table(path, root)
        if suffix == ".json":
            with path.open(encoding="utf-8-sig") as file:
                return _extract_pairs_from_json_payload(json.load(file), path, root)
        if suffix == ".jsonl":
            pairs: list[SentencePair] = []
            with path.open(encoding="utf-8-sig") as file:
                for line in file:
                    if line.strip():
                        pairs.extend(_extract_pairs_from_json_payload(json.loads(line), path, root))
            return pairs
        if suffix == ".xml":
            return _extract_pairs_from_xml(path, root)
    except (csv.Error, json.JSONDecodeError, ET.ParseError, UnicodeDecodeError):
        return []
    return []


def _extract_pairs_from_table(path: Path, root: Path) -> list[SentencePair]:
    delimiter = "\t" if path.suffix.lower() == ".tsv" else ","
    with path.open(newline="", encoding="utf-8-sig") as file:
        reader = csv.DictReader(file, delimiter=delimiter)
        fieldnames = reader.fieldnames or []
        gloss_field = _pick_field(fieldnames, (GLOSS_COLUMN, *GLOSS_FIELD_HINTS))
        sentence_field = _pick_field(fieldnames, (KOREAN_COLUMN, *KOREAN_FIELD_HINTS))
        video_field = _pick_field(fieldnames, VIDEO_FIELD_HINTS)
        keypoint_field = _pick_field(fieldnames, KEYPOINT_FIELD_HINTS)
        if gloss_field is None or sentence_field is None:
            return []

        pairs: list[SentencePair] = []
        for row in reader:
            pair = _make_sentence_pair(
                gloss=row.get(gloss_field, ""),
                sentence=row.get(sentence_field, ""),
                source_path=_relative_source(path, root),
                video_path=str(row.get(video_field, "") if video_field else ""),
                keypoint_path=str(row.get(keypoint_field, "") if keypoint_field else ""),
            )
            if pair is not None:
                pairs.append(pair)
        return pairs


def _extract_pairs_from_json_payload(payload: Any, path: Path, root: Path) -> list[SentencePair]:
    pairs: list[SentencePair] = []

    def visit(value: Any) -> None:
        if isinstance(value, dict):
            gloss = _extract_gloss_from_dict(value)
            sentence = _extract_sentence_from_dict(value)
            if gloss and sentence:
                pair = _make_sentence_pair(
                    gloss=gloss,
                    sentence=sentence,
                    source_path=_relative_source(path, root),
                    video_path=_extract_path_hint(value, VIDEO_FIELD_HINTS),
                    keypoint_path=_extract_path_hint(value, KEYPOINT_FIELD_HINTS),
                )
                if pair is not None:
                    pairs.append(pair)
            for item in value.values():
                visit(item)
        elif isinstance(value, list):
            for item in value:
                visit(item)

    visit(payload)
    return pairs


def _extract_pairs_from_xml(path: Path, root: Path) -> list[SentencePair]:
    tree = ET.parse(path)
    root_element = tree.getroot()
    values_by_name: dict[str, list[str]] = {}
    for element in root_element.iter():
        for key, value in element.attrib.items():
            values_by_name.setdefault(key, []).append(value)
        if element.text and element.text.strip():
            values_by_name.setdefault(element.tag, []).append(element.text.strip())

    gloss = " ".join(
        value
        for key, values in values_by_name.items()
        if _matches_any(key, GLOSS_FIELD_HINTS)
        for value in values
    )
    sentence = next(
        (
            value
            for key, values in values_by_name.items()
            if _matches_any(key, KOREAN_FIELD_HINTS)
            for value in values
        ),
        "",
    )
    pair = _make_sentence_pair(
        gloss=gloss,
        sentence=sentence,
        source_path=_relative_source(path, root),
        video_path="",
        keypoint_path=_relative_source(path, root),
    )
    return [pair] if pair is not None else []


def _extract_gloss_from_dict(payload: dict[str, Any]) -> str:
    tokens: list[str] = []

    def collect(value: Any, parent_key: str = "") -> None:
        if isinstance(value, dict):
            gloss_id = _lookup_case_insensitive(value, ("gloss_id", "gloss", "gksl"))
            if isinstance(gloss_id, str):
                tokens.extend(split_gloss(gloss_id))
            for key, item in value.items():
                if str(key).strip().lower() in {"gloss_id", "gloss", "gksl"}:
                    continue
                if _matches_any(key, GLOSS_FIELD_HINTS):
                    collect(item, key)
                elif isinstance(item, (dict, list)):
                    collect(item, key)
        elif isinstance(value, list):
            for item in value:
                collect(item, parent_key)
        elif isinstance(value, str) and _matches_any(parent_key, GLOSS_FIELD_HINTS):
            tokens.extend(split_gloss(value))

    collect(payload)
    return normalize_gloss_sentence(" ".join(tokens))


def _extract_sentence_from_dict(payload: dict[str, Any]) -> str:
    direct = _lookup_case_insensitive(payload, KOREAN_FIELD_HINTS)
    if isinstance(direct, str):
        return direct
    for key, value in payload.items():
        if isinstance(value, str) and _matches_any(key, KOREAN_FIELD_HINTS):
            return value
    return ""


def _extract_path_hint(payload: dict[str, Any], hints: tuple[str, ...]) -> str:
    for key, value in payload.items():
        if isinstance(value, str) and _matches_any(key, hints):
            return value
    return ""


def _make_sentence_pair(
    *,
    gloss: str,
    sentence: str,
    source_path: str,
    video_path: str,
    keypoint_path: str,
) -> SentencePair | None:
    normalized_gloss = normalize_gloss_sentence(gloss)
    normalized_sentence = normalize_korean_sentence(sentence)
    if not normalized_gloss or not normalized_sentence:
        return None
    return SentencePair(
        gloss=normalized_gloss,
        sentence=normalized_sentence,
        source_path=source_path,
        video_path=video_path,
        keypoint_path=keypoint_path,
    )


def _pick_field(fields: Iterable[str], hints: Iterable[str]) -> str | None:
    fields = tuple(fields)
    for hint in hints:
        for field in fields:
            if field == hint:
                return field
    for field in fields:
        if _matches_any(field, tuple(hints)):
            return field
    return None


def _lookup_case_insensitive(payload: dict[str, Any], keys: Iterable[str]) -> Any:
    lowered = {str(key).lower(): value for key, value in payload.items()}
    for key in keys:
        if key.lower() in lowered:
            return lowered[key.lower()]
    return None


def _matches_any(value: str, hints: tuple[str, ...]) -> bool:
    normalized = str(value).strip().lower()
    return any(str(hint).strip().lower() in normalized for hint in hints)


def _relative_source(path: Path, root: Path) -> str:
    try:
        return str(path.relative_to(root))
    except ValueError:
        return str(path)


def _normalize_label(value: str) -> str:
    value = re.sub(r"\s+", "_", str(value).strip())
    value = value.strip("_")
    if not value or value.lower() in {"none", "null", "nan"}:
        return ""
    return value
