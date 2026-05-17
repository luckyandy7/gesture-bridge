from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
import csv
import json
from pathlib import Path
import re
from typing import Iterable

from gesture_bridge.core.downloads import download_url
from gesture_bridge.core.paths import resolve_project_path


GLOSS_COLUMN = "Gloss level Korean Sign Language (GKSL) sentence"
KOREAN_COLUMN = "Word level Korean Language (WKL) sentence"

DEFAULT_GKSL_URLS = {
    "GKSL3k_original.csv": "https://raw.githubusercontent.com/AIRC-KETI/GKSL-dataset/main/dataset/GKSL3k_original.csv",
    "GKSL13k_augmented.csv": "https://raw.githubusercontent.com/AIRC-KETI/GKSL-dataset/main/dataset/GKSL13k_augmented.csv",
    "LICENSE.md": "https://raw.githubusercontent.com/AIRC-KETI/GKSL-dataset/main/LICENSE.md",
    "README.md": "https://raw.githubusercontent.com/AIRC-KETI/GKSL-dataset/main/README.md",
}

DEFAULT_SENTENCE_DATA_DIR = Path("data/external/gksl")
DEFAULT_SENTENCE_MODEL_PATH = Path("models/sign_sentence_memory.json")

END_TOKENS = {"끝", "완료", "문장끝", "문장_끝", "마침"}
CLEAR_TOKENS = {"취소", "지우기", "초기화", "삭제"}
BACKSPACE_TOKENS = {"되돌리기", "이전", "백스페이스"}

COMMON_SENTENCES = {
    "안녕하세요": "안녕하세요.",
    "감사합니다": "감사합니다.",
    "네": "네.",
    "아니요": "아니요.",
    "죄송합니다": "죄송합니다.",
    "도와주세요": "도와주세요.",
    "괜찮아요": "괜찮아요.",
}


@dataclass(frozen=True)
class TranslationCandidate:
    sentence: str
    gloss: str
    score: float
    source: str


@dataclass(frozen=True)
class TranslationEntry:
    gloss: str
    sentence: str
    count: int = 1
    source: str = "memory"
    tokens: tuple[str, ...] = field(default_factory=tuple)


@dataclass
class SentenceState:
    tokens: list[str] = field(default_factory=list)
    finalized_sentences: list[str] = field(default_factory=list)
    latest_candidate: TranslationCandidate | None = None

    @property
    def gloss_text(self) -> str:
        return " ".join(self.tokens)

    @property
    def sentence_text(self) -> str:
        if self.latest_candidate is not None:
            return self.latest_candidate.sentence
        if self.tokens:
            return fallback_sentence(self.tokens)
        return "-"

    @property
    def final_text(self) -> str:
        parts = [sentence for sentence in self.finalized_sentences if sentence]
        if self.tokens:
            parts.append(self.sentence_text)
        return " ".join(parts) if parts else "-"


class GlossTranslationMemory:
    def __init__(self, entries: Iterable[TranslationEntry] = ()) -> None:
        self.entries = tuple(entries)
        self.exact_index: dict[str, TranslationEntry] = {}
        self.token_index: dict[str, set[int]] = {}
        for index, entry in enumerate(self.entries):
            key = normalize_gloss_sentence(entry.gloss)
            current = self.exact_index.get(key)
            if current is None or entry.count > current.count:
                self.exact_index[key] = entry
            for token in entry.tokens or split_gloss(entry.gloss):
                self.token_index.setdefault(token, set()).add(index)

    @classmethod
    def from_csv_paths(cls, paths: Iterable[str | Path]) -> "GlossTranslationMemory":
        counter: Counter[tuple[str, str, str]] = Counter()

        for path in paths:
            resolved = resolve_project_path(path)
            if not resolved.exists():
                continue
            with resolved.open(newline="", encoding="utf-8-sig") as file:
                reader = csv.DictReader(file)
                if GLOSS_COLUMN not in (reader.fieldnames or []) or KOREAN_COLUMN not in (reader.fieldnames or []):
                    raise ValueError(
                        f"{resolved} must contain `{GLOSS_COLUMN}` and `{KOREAN_COLUMN}` columns."
                    )
                for row in reader:
                    gloss = normalize_gloss_sentence(row.get(GLOSS_COLUMN, ""))
                    sentence = normalize_korean_sentence(row.get(KOREAN_COLUMN, ""))
                    if not gloss or not sentence:
                        continue
                    counter[(gloss, sentence, resolved.name)] += 1

        entries = [
            TranslationEntry(
                gloss=gloss,
                sentence=sentence,
                count=count,
                source=source,
                tokens=tuple(split_gloss(gloss)),
            )
            for (gloss, sentence, source), count in counter.items()
        ]
        return cls(entries)

    @classmethod
    def load(cls, path: str | Path) -> "GlossTranslationMemory":
        resolved = resolve_project_path(path)
        with resolved.open(encoding="utf-8") as file:
            payload = json.load(file)
        entries = [
            TranslationEntry(
                gloss=str(item["gloss"]),
                sentence=str(item["sentence"]),
                count=int(item.get("count", 1)),
                source=str(item.get("source", "memory")),
                tokens=tuple(str(token) for token in item.get("tokens", split_gloss(str(item["gloss"])))),
            )
            for item in payload.get("entries", [])
        ]
        return cls(entries)

    def save(self, path: str | Path) -> Path:
        resolved = resolve_project_path(path)
        resolved.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "version": 1,
            "gloss_column": GLOSS_COLUMN,
            "korean_column": KOREAN_COLUMN,
            "entries": [
                {
                    "gloss": entry.gloss,
                    "sentence": entry.sentence,
                    "count": entry.count,
                    "source": entry.source,
                    "tokens": list(entry.tokens or split_gloss(entry.gloss)),
                }
                for entry in self.entries
            ],
        }
        with resolved.open("w", encoding="utf-8") as file:
            json.dump(payload, file, ensure_ascii=False, indent=2)
        return resolved

    def translate(self, tokens: Iterable[str], fuzzy_threshold: float = 0.56) -> TranslationCandidate:
        normalized_tokens = tuple(normalize_token(token) for token in tokens if normalize_token(token))
        if not normalized_tokens:
            return TranslationCandidate("-", "", 0.0, "empty")

        gloss = " ".join(normalized_tokens)
        exact = self.exact_index.get(gloss)
        if exact is not None:
            return TranslationCandidate(exact.sentence, exact.gloss, 1.0, f"exact:{exact.source}")

        if len(normalized_tokens) == 1 and normalized_tokens[0] in COMMON_SENTENCES:
            token = normalized_tokens[0]
            return TranslationCandidate(COMMON_SENTENCES[token], token, 0.98, "builtin")

        best_entry: TranslationEntry | None = None
        best_score = 0.0

        candidate_indexes: set[int] = set()
        for token in normalized_tokens:
            candidate_indexes.update(self.token_index.get(token, ()))
        search_entries = (
            (self.entries[index] for index in sorted(candidate_indexes))
            if candidate_indexes
            else iter(self.entries)
        )

        for entry in search_entries:
            candidate_tokens = entry.tokens or tuple(split_gloss(entry.gloss))
            score = score_gloss_match(normalized_tokens, candidate_tokens)
            if score > best_score:
                best_entry = entry
                best_score = score

        if best_entry is not None and best_score >= fuzzy_threshold:
            return TranslationCandidate(
                best_entry.sentence,
                best_entry.gloss,
                round(best_score, 4),
                f"fuzzy:{best_entry.source}",
            )

        return TranslationCandidate(fallback_sentence(normalized_tokens), gloss, round(best_score, 4), "fallback")


class SignSentenceAssembler:
    def __init__(
        self,
        translation_memory: GlossTranslationMemory,
        max_tokens: int = 32,
        fuzzy_threshold: float = 0.56,
    ) -> None:
        self.translation_memory = translation_memory
        self.max_tokens = max_tokens
        self.fuzzy_threshold = fuzzy_threshold
        self.state = SentenceState()

    def append(self, token: str) -> SentenceState:
        normalized = normalize_token(token)
        if not normalized:
            return self.state
        if normalized in CLEAR_TOKENS:
            return self.clear()
        if normalized in BACKSPACE_TOKENS:
            return self.backspace()
        if normalized in END_TOKENS:
            return self.finalize()

        if not self.state.tokens or self.state.tokens[-1] != normalized:
            self.state.tokens.append(normalized)
            if len(self.state.tokens) > self.max_tokens:
                self.state.tokens = self.state.tokens[-self.max_tokens :]
        self._refresh()
        return self.state

    def clear(self) -> SentenceState:
        self.state = SentenceState()
        return self.state

    def backspace(self) -> SentenceState:
        if self.state.tokens:
            self.state.tokens.pop()
        self._refresh()
        return self.state

    def finalize(self) -> SentenceState:
        self._refresh()
        if self.state.tokens:
            self.state.finalized_sentences.append(self.state.sentence_text)
            self.state.tokens = []
            self.state.latest_candidate = None
        return self.state

    def _refresh(self) -> None:
        self.state.latest_candidate = self.translation_memory.translate(
            self.state.tokens,
            fuzzy_threshold=self.fuzzy_threshold,
        )


def load_sentence_memory(
    model_path: str | Path = DEFAULT_SENTENCE_MODEL_PATH,
    data_dir: str | Path = DEFAULT_SENTENCE_DATA_DIR,
) -> GlossTranslationMemory:
    resolved_model = resolve_project_path(model_path)
    if resolved_model.exists():
        return GlossTranslationMemory.load(resolved_model)

    csv_paths = default_sentence_csv_paths(data_dir)
    if any(path.exists() for path in csv_paths):
        memory = GlossTranslationMemory.from_csv_paths(csv_paths)
        if memory.entries:
            return memory

    return GlossTranslationMemory(
        TranslationEntry(gloss=token, sentence=sentence, source="builtin", tokens=(token,))
        for token, sentence in COMMON_SENTENCES.items()
    )


def default_sentence_csv_paths(data_dir: str | Path = DEFAULT_SENTENCE_DATA_DIR) -> tuple[Path, ...]:
    root = resolve_project_path(data_dir)
    return (root / "GKSL3k_original.csv", root / "GKSL13k_augmented.csv")


def download_gksl_sentence_data(output_dir: str | Path = DEFAULT_SENTENCE_DATA_DIR) -> dict[str, Path]:
    root = resolve_project_path(output_dir)
    root.mkdir(parents=True, exist_ok=True)
    downloaded: dict[str, Path] = {}
    for filename, url in DEFAULT_GKSL_URLS.items():
        output_path = root / filename
        downloaded[filename] = download_url(url, output_path)
    return downloaded


def build_sentence_memory_model(
    csv_paths: Iterable[str | Path],
    model_path: str | Path = DEFAULT_SENTENCE_MODEL_PATH,
) -> dict[str, object]:
    memory = GlossTranslationMemory.from_csv_paths(csv_paths)
    if not memory.entries:
        raise RuntimeError("No sentence pairs were loaded. Run `download-sentence-data` or pass valid --csv files.")
    output_path = memory.save(model_path)
    token_counts = Counter(token for entry in memory.entries for token in (entry.tokens or split_gloss(entry.gloss)))
    return {
        "model_path": str(output_path),
        "entries": len(memory.entries),
        "exact_glosses": len(memory.exact_index),
        "vocabulary": len(token_counts),
        "top_tokens": token_counts.most_common(20),
    }


def normalize_gloss_sentence(value: str) -> str:
    return " ".join(split_gloss(value))


def normalize_korean_sentence(value: str) -> str:
    sentence = re.sub(r"\s+", " ", value.strip())
    if sentence and sentence[-1] not in ".!?。？！":
        sentence += "."
    return sentence


def split_gloss(value: str) -> list[str]:
    cleaned = value.replace("\ufeff", " ")
    cleaned = re.sub(r"[/,;|]+", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned.strip())
    return [normalize_token(token) for token in cleaned.split(" ") if normalize_token(token)]


def normalize_token(value: str) -> str:
    token = str(value).strip()
    token = re.sub(r"\s+", "_", token)
    token = token.strip("_")
    return token


def score_gloss_match(query_tokens: tuple[str, ...], candidate_tokens: tuple[str, ...]) -> float:
    if not query_tokens or not candidate_tokens:
        return 0.0
    query_set = set(query_tokens)
    candidate_set = set(candidate_tokens)
    overlap = len(query_set & candidate_set)
    union = len(query_set | candidate_set)
    jaccard = overlap / union if union else 0.0
    lcs = longest_common_subsequence_length(query_tokens, candidate_tokens)
    ordered = lcs / max(len(query_tokens), len(candidate_tokens))
    coverage = overlap / len(query_set)
    prefix_bonus = 0.08 if candidate_tokens[: len(query_tokens)] == query_tokens else 0.0
    length_gap = abs(len(candidate_tokens) - len(query_tokens)) / max(len(candidate_tokens), len(query_tokens))
    return max(0.0, (0.44 * ordered) + (0.34 * coverage) + (0.22 * jaccard) + prefix_bonus - (0.12 * length_gap))


def longest_common_subsequence_length(left: tuple[str, ...], right: tuple[str, ...]) -> int:
    previous = [0] * (len(right) + 1)
    for left_token in left:
        current = [0]
        for index, right_token in enumerate(right, start=1):
            if left_token == right_token:
                current.append(previous[index - 1] + 1)
            else:
                current.append(max(previous[index], current[-1]))
        previous = current
    return previous[-1]


def fallback_sentence(tokens: Iterable[str]) -> str:
    normalized_tokens = [normalize_token(token) for token in tokens if normalize_token(token)]
    if not normalized_tokens:
        return "-"
    if len(normalized_tokens) == 1 and normalized_tokens[0] in COMMON_SENTENCES:
        return COMMON_SENTENCES[normalized_tokens[0]]

    joined = " ".join(token.replace("_", " ") for token in normalized_tokens)
    if joined.endswith(("요", "다", "까", "죠")):
        return normalize_korean_sentence(joined)
    particle = "이라는" if has_final_consonant(joined[-1]) else "라는"
    return f"{joined}{particle} 의미로 인식했어요."


def has_final_consonant(character: str) -> bool:
    code = ord(character)
    if not 0xAC00 <= code <= 0xD7A3:
        return False
    return (code - 0xAC00) % 28 != 0
