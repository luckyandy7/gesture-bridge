# Korean Sign Sentence Pipeline Notes

## Goal

The original project recognizes isolated sign labels. The sentence pipeline keeps that baseline as a backup and adds a second layer:

1. Webcam holistic landmarks are classified into stable gloss tokens.
2. Stable gloss tokens are accumulated into a sentence buffer.
3. A gloss-to-Korean translation memory returns a Korean sentence by exact match, fuzzy ordered match, or a rule-based fallback.

This is not a full end-to-end neural sign-language translation system. It is a practical bridge that works with the current small landmark classifier and becomes stronger as more gloss-token training data is collected.

## References Checked

- KSL-Guide: large Korean Sign Language dataset with sentences, words, gloss, translation, 2D/3D pose keypoints, and timestamps. The repository points to AI Hub for dataset access, so the large video/keypoint data requires AI Hub login and cannot be fully automated here.
  - https://github.com/ChelseaGH/KSL-Guide
  - https://aihub.or.kr/aihubdata/data/view.do?aihubDataSe=&currMenu=&dataSetSn=636&topMenu=
- GKSL-dataset: open GitHub CSV dataset for gloss-level Korean Sign Language to Korean sentence pairs.
  - https://github.com/AIRC-KETI/GKSL-dataset
- KSL-LEX: public Korean Sign Language lexicon on Hugging Face. This is not a sentence video dataset, but it is useful for expanding candidate gloss/word labels and synonym groups.
  - https://huggingface.co/datasets/AAILab/KSL-LEX
- National Institute of Korean Language corpus request page: includes Korean Sign Language raw, annotation, and KSL/Korean parallel corpora, but access is request-based.
  - https://kli.korean.go.kr/corpus/request/corpusRegist.do
- MediaPipe Holistic / landmark-based recognition remains the current runtime basis in this project.
  - https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker/web_js

## Downloaded Data

The following public files are stored locally:

- `data/external/gksl/GKSL3k_original.csv`
- `data/external/gksl/GKSL13k_augmented.csv`
- `data/external/gksl/LICENSE.md`
- `data/external/gksl/README.md`
- `data/external/ksl_lex/KSL-LEX.csv`
- `data/external/ksl_lex/metadata.json`
- `data/external/ksl_guide/README.md`
- `configs/korean_sentence_gloss_labels.expanded.json`

License: CC BY-NC-SA 4.0. Do not use this bundled data in a commercial product unless the license is acceptable or replaced with a suitable dataset.

Regenerate public resources:

```bash
PYTHONPATH=src python -m gesture_bridge prepare-sentence-resources --max-labels 160
```

Import manually approved AI Hub/NIKL data after extracting it locally:

```bash
PYTHONPATH=src python -m gesture_bridge import-sentence-corpus /path/to/extracted/ksl-corpus
```

## Runtime Behavior

Default sentence mode:

```bash
PYTHONPATH=src python -m gesture_bridge sign-text --labels-config configs/korean_sentence_gloss_labels.example.json
```

Expanded candidate-label experiment:

```bash
PYTHONPATH=src python -m gesture_bridge sign-text --labels-config configs/korean_sentence_gloss_labels.expanded.json
```

The expanded config only defines candidate labels. The camera classifier still needs collected landmark samples and retraining for every label that should be recognized reliably.

Legacy word backup:

```bash
PYTHONPATH=src python -m gesture_bridge sign-text --labels-config configs/korean_sign_labels.example.json --output-mode words
```

Manual translation check:

```bash
PYTHONPATH=src python -m gesture_bridge translate-gloss 집 불
```

## Upgrade Path

For better real sentence recognition:

1. Expand `configs/korean_sentence_gloss_labels.example.json` with the target domain gloss vocabulary.
2. Collect enough landmark samples for every gloss token.
3. Retrain `models/sign_knn.joblib` or replace the isolated-token classifier with a temporal model.
4. Keep `models/sign_sentence_memory.json` as the Korean sentence realization layer.
5. If AI Hub KSL-Guide access is available, add an importer for its pose keypoints and train a continuous sign recognition model directly from sentence sequences.
