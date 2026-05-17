from __future__ import annotations

from pathlib import Path

from gesture_bridge.sign.sentence import (
    GlossTranslationMemory,
    SignSentenceAssembler,
    build_sentence_memory_model,
    fallback_sentence,
    score_gloss_match,
)
from gesture_bridge.sign.resources import (
    build_sentence_label_config,
    import_local_sentence_corpus,
    load_ksl_lexicon_terms,
)


def write_parallel_csv(path: Path) -> None:
    path.write_text(
        "\ufeffdataset,video_num,question_w_q_morph,question,Gloss level Korean Sign Language (GKSL) sentence,Word level Korean Language (WKL) sentence\n"
        "sample,,,,집 불,집에 불이 났어요.\n"
        "sample,,,,집 도둑 넘어오다,집에 도둑이 들어왔어요.\n"
        "sample,,,,도착 10분 전,10분 전에 도착합니다.\n",
        encoding="utf-8",
    )


def test_translation_memory_exact_match(tmp_path: Path) -> None:
    csv_path = tmp_path / "sample.csv"
    write_parallel_csv(csv_path)

    memory = GlossTranslationMemory.from_csv_paths([csv_path])
    candidate = memory.translate(["집", "불"])

    assert candidate.sentence == "집에 불이 났어요."
    assert candidate.score == 1.0
    assert candidate.source.startswith("exact:")


def test_translation_memory_fuzzy_match(tmp_path: Path) -> None:
    csv_path = tmp_path / "sample.csv"
    write_parallel_csv(csv_path)

    memory = GlossTranslationMemory.from_csv_paths([csv_path])
    candidate = memory.translate(["집", "도둑"], fuzzy_threshold=0.45)

    assert candidate.sentence == "집에 도둑이 들어왔어요."
    assert candidate.source.startswith("fuzzy:")


def test_sentence_assembler_finalize_and_backspace(tmp_path: Path) -> None:
    csv_path = tmp_path / "sample.csv"
    write_parallel_csv(csv_path)
    assembler = SignSentenceAssembler(GlossTranslationMemory.from_csv_paths([csv_path]))

    assembler.append("집")
    assembler.append("도둑")
    assembler.append("넘어오다")
    state = assembler.append("완료")

    assert state.final_text == "집에 도둑이 들어왔어요."
    assert state.tokens == []

    assembler.append("집")
    assembler.append("불")
    state = assembler.append("되돌리기")
    assert state.gloss_text == "집"


def test_builtin_and_fallback_sentences() -> None:
    memory = GlossTranslationMemory()

    assert memory.translate(["안녕하세요"]).sentence == "안녕하세요."
    assert fallback_sentence(["새로운", "토큰"]) == "새로운 토큰이라는 의미로 인식했어요."


def test_build_sentence_memory_model(tmp_path: Path) -> None:
    csv_path = tmp_path / "sample.csv"
    model_path = tmp_path / "memory.json"
    write_parallel_csv(csv_path)

    report = build_sentence_memory_model([csv_path], model_path)
    loaded = GlossTranslationMemory.load(model_path)

    assert report["entries"] == 3
    assert loaded.translate(["도착", "10분", "전"]).sentence == "10분 전에 도착합니다."


def test_ordered_score_prefers_matching_sequences() -> None:
    assert score_gloss_match(("집", "불"), ("집", "불")) > score_gloss_match(
        ("집", "불"),
        ("도착", "10분", "전"),
    )


def test_build_sentence_label_config_from_gksl_and_lexicon(tmp_path: Path) -> None:
    gksl_csv = tmp_path / "gksl.csv"
    write_parallel_csv(gksl_csv)
    lexicon_csv = tmp_path / "KSL-LEX.csv"
    lexicon_csv.write_text(
        "Headword,POS,Same_Sign_Words,Additional_Info,Homonym_Info\n"
        "화재,Noun,불 | 재난,,\n",
        encoding="utf-8",
    )
    seed_config = tmp_path / "seed.json"
    seed_config.write_text('{"sequence_length": 30, "labels": ["안녕하세요"]}', encoding="utf-8")
    output_config = tmp_path / "labels.json"

    report = build_sentence_label_config(
        output_path=output_config,
        seed_config_path=seed_config,
        gksl_csv_paths=[gksl_csv],
        ksl_lex_csv_path=lexicon_csv,
        max_labels=8,
    )
    labels_payload = output_config.read_text(encoding="utf-8")

    assert report["labels"] == 8
    assert "안녕하세요" in labels_payload
    assert "집" in labels_payload
    assert load_ksl_lexicon_terms(lexicon_csv)["불"] == 1


def test_import_local_sentence_corpus_from_aihub_style_json(tmp_path: Path) -> None:
    corpus_dir = tmp_path / "corpus"
    corpus_dir.mkdir()
    (corpus_dir / "sample.json").write_text(
        """
        {
          "Metadata": {"video": "sample.mp4"},
          "Korean text": "집에 불이 났어요",
          "Sign_gestures_both": [
            {"gloss_id": "집"},
            {"gloss_id": "불"}
          ]
        }
        """,
        encoding="utf-8",
    )
    output_csv = tmp_path / "imported.csv"
    manifest = tmp_path / "manifest.json"

    report = import_local_sentence_corpus(corpus_dir, output_csv=output_csv, manifest_path=manifest)
    memory = GlossTranslationMemory.from_csv_paths([output_csv])

    assert report["pairs"] == 1
    assert memory.translate(["집", "불"]).sentence == "집에 불이 났어요."
