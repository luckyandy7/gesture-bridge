# Gesture Bridge 동작 방법

검사 기준: 2026-05-20, 루트 폴더 `/Users/suhwan/Downloads/signlanguageProject`.

이 프로젝트는 하나의 저장소 안에 Next.js 웹앱과 Python CLI 런타임이 같이 들어 있는 멀티모달 인터랙션 프로젝트다. 실행 기준은 반드시 저장소 루트이며, 내부의 `signlanguageProject/` 폴더는 이전 Python 중심 구조가 일부 중첩된 복사본으로 보인다.

## 1. 전체 구성

| 영역 | 위치 | 역할 |
| --- | --- | --- |
| 웹앱 | `app/`, `components/`, `lib/`, `public/` | 랜딩, PC 제어 웹 모드, 수화 텍스트 웹 모드, 인터랙티브 체험 |
| Python CLI | `src/gesture_bridge/` | 카메라 탐색, 실제 PC 제어, 수화 데이터 수집/학습/추론, 문장 리소스 관리 |
| 모델 | `models/`, `public/models/` | Python용 `.joblib`, 브라우저용 KNN JSON, MediaPipe task 모델, 문장 메모리 |
| 데이터 | `data/raw/`, `data/external/` | 직접 수집한 landmark sequence, GKSL/KSL-LEX 등 문장 리소스 |
| 설정 | `configs/` | 제스처-액션 매핑, 수화 라벨 목록 |
| 문서 | `README.md`, `docs/` | 프로젝트 설명, 브랜드, 연구 메모, 실행 문서 |

현재 포함된 학습 모델은 한국어 4개 라벨 `안녕하세요`, `감사합니다`, `네`, `아니요`를 인식한다. 로컬 raw sample 수는 `안녕하세요 67`, `감사합니다 30`, `네 30`, `아니요 30`이다.

## 2. 최초 준비

### Python

```bash
cd /Users/suhwan/Downloads/signlanguageProject
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[vision,control,ml,dev]"
```

이미 `.venv`가 있으면 작업할 때마다 아래만 실행한다.

```bash
cd /Users/suhwan/Downloads/signlanguageProject
source .venv/bin/activate
```

### Node/Next.js

이 저장소는 `pnpm-lock.yaml` 기준 프로젝트다.

```bash
cd /Users/suhwan/Downloads/signlanguageProject
corepack enable
pnpm install --frozen-lockfile
```

`pnpm`이 없으면 Node.js를 먼저 설치하거나 Homebrew 환경에서 `corepack`/`pnpm`을 활성화한다. macOS에서 더블클릭 실행용으로 `start-server.command`도 준비되어 있으며, 이 파일은 `/opt/homebrew/bin`, `/usr/local/bin`, nvm, fnm, asdf 경로를 먼저 잡은 뒤 `pnpm dev`를 실행한다.

### 선택: OpenAI 문장 보정

웹 수화 텍스트 모드는 `OPENAI_API_KEY`가 있으면 `/api/sign-text/refine`에서 OpenAI Responses API로 문장을 더 자연스럽게 보정한다. 키가 없으면 로컬 문장 메모리와 규칙 기반 보정으로 동작한다.

```bash
cp .env.example .env.local
```

`.env.local`에는 필요한 경우 `OPENAI_API_KEY`와 `OPENAI_SIGN_TEXT_MODEL`만 설정한다.

## 3. 웹앱 실행

가장 쉬운 실행:

```bash
./start-server.command
```

터미널에서 직접 실행:

```bash
pnpm dev --hostname 127.0.0.1 --port 3000
```

브라우저 주소:

| URL | 화면 |
| --- | --- |
| `http://127.0.0.1:3000` | 세 가지 모드 선택 랜딩 |
| `http://127.0.0.1:3000/pc-control` | 브라우저 내부 PC 제어 데모 |
| `http://127.0.0.1:3000/sign-text` | 웹 수화 텍스트/문장 모드 |
| `http://127.0.0.1:3000/interactive` | 음성+손동작 인터랙티브 스테이지 |

웹 모드는 카메라 권한이 없어도 마우스 시뮬레이션으로 대부분 확인할 수 있다. 음성 명령은 Web Speech API를 쓰므로 Chrome 계열 브라우저에서 가장 안정적이다.

## 4. 웹 모드별 동작

### 랜딩

`app/page.tsx`가 첫 화면이다. `PC 제어`, `수화 텍스트`, `인터랙티브` 세 모드의 설명과 실행 링크를 보여준다.

### PC 제어 웹 모드

위치: `app/pc-control/page.tsx`, `components/pc-control/PcControlExperience.tsx`.

동작 흐름:

1. `웹 실행 시작`을 누르면 `getUserMedia`로 카메라를 켠다.
2. `@mediapipe/tasks-vision`의 `HandLandmarker`를 `/mediapipe/wasm`, `/models/hand_landmarker.task`에서 로딩한다.
3. `lib/interactive/gesture/gesture-recognizer.ts`가 손 랜드마크를 제스처로 판정한다.
4. 제스처는 브라우저 내부 데스크톱 UI의 커서, 클릭, 슬라이드 이동, 스크롤로 매핑된다.

주요 매핑:

| 제스처 | 동작 |
| --- | --- |
| 검지만 펴기 `point` | 커서 이동 |
| 엄지+검지 집기 `pinch` | 왼쪽 클릭 |
| 브이 `peace` | 다음 슬라이드 |
| 좌우 스와이프 | 이전/다음 슬라이드 |
| 엄지 위/아래 | 문서 스크롤 |

웹 PC 제어는 실제 OS를 조작하지 않고 브라우저 내부 데모 화면만 조작한다.

### 수화 텍스트 웹 모드

위치: `app/sign-text/page.tsx`, `components/sign-text/SignTextExperience.tsx`, `lib/sign-text/*`.

동작 흐름:

1. 모델과 문장 메모리를 먼저 로딩한다.
   - `/models/sign_knn.browser.json`
   - `/models/sign_sentence_memory.json`
2. `웹 실행`을 누르면 MediaPipe `HolisticLandmarker`를 로딩한다.
3. 손, 팔 포즈, 얼굴 blendshape를 24fps 기준으로 추적한다.
4. `flattenHolisticFrameFeatures`가 30프레임 sequence를 만든다.
5. 브라우저 KNN 모델이 라벨과 confidence를 예측한다.
6. 같은 라벨이 최근 히스토리에서 충분히 안정되면 단어 토큰으로 emit한다.
7. 단어 토큰은 `translateTokens`로 GKSL 문장 메모리 exact/fuzzy/fallback 매칭을 거친다.
8. 양손을 가까이 모아 1초 정도 유지하거나 `문장 끝` 버튼을 누르면 문장을 확정하고 한국어 음성으로 읽는다.

추가 기능:

- 얼굴 표정은 질문/부정/강조/긍정 후보로 읽어 문장 후보와 confidence에 반영한다.
- 브라우저에서 라벨과 샘플을 추가 학습할 수 있으며, 추가 샘플은 `localStorage`에 저장된다.
- 브라우저 추가 학습은 해당 브라우저에만 남는다. Python 모델이나 `public/models/sign_knn.browser.json`을 자동 갱신하지 않는다.

### 인터랙티브 스테이지

위치: `app/interactive/page.tsx`, `components/interactive/InteractiveExperience.tsx`, `lib/interactive/*`.

동작 흐름:

1. 카메라가 있으면 MediaPipe Hands로 손 포인터와 제스처를 만든다.
2. 카메라가 없으면 마우스 이동은 `point`, 마우스 누름은 `pinch`로 시뮬레이션한다.
3. 음성 켜기를 누르면 Web Speech API `ko-KR`로 한국어 명령을 듣는다.
4. `korean-command-parser.ts`가 명령 intent를 만든다.
5. 제스처, 콤보, 음성 intent가 모드별 dispatcher로 들어간다.

대표 모드:

| 모드 | 동작 |
| --- | --- |
| 사진 | 이미지 선택, 이동, 확대/축소, 다음/이전 |
| 그림 | 공중 드로잉, 지우개, 색상, 굵기, undo, 저장 |
| 날씨 | Open-Meteo 호출, 실패 시 mock weather |
| 효과 | Canvas 입자 효과 13종 |
| 게임 | 낙하물 받기, 버블, 퐁, 회피, 절단, 던지기, 반응, 리듬, 표적 |
| 3D | Three.js 기반 제스처 코어, 핸드 리그, 오비탈 랩, 깊이 필드 |
| 음악 | Web Audio oscillator 기반 재생/정지/볼륨 |

대표 음성 명령:

```text
날씨 알려줘
부산 날씨 알려줘
사진 보여줘
다음 사진
그림 그리기 시작
지우개
효과 실행
게임 시작
3D 보여줘
음악 재생
볼륨 올려줘
초기화해줘
```

## 5. Python CLI 실행

모든 Python 명령은 루트에서 실행한다.

```bash
cd /Users/suhwan/Downloads/signlanguageProject
source .venv/bin/activate
```

### 구조 확인

```bash
PYTHONPATH=src python -m gesture_bridge overview
PYTHONPATH=src python -m gesture_bridge tree
PYTHONPATH=src python -m gesture_bridge roadmap
```

### 카메라 확인

```bash
PYTHONPATH=src python -m gesture_bridge probe-camera --camera-backend auto --indices 0 1 2
```

읽히는 카메라가 0번이면 이후 명령에 `--camera-index 0`을 붙인다. macOS에서 카메라가 안 열리면 시스템 설정의 카메라 권한과 FaceTime/Zoom 같은 점유 앱을 확인한다.

### 실제 PC 제어

기본은 안전한 dry-run이다. 화면에 overlay만 띄우고 실제 마우스/키보드는 움직이지 않는다.

```bash
PYTHONPATH=src python -m gesture_bridge pc-control --camera-index 0
```

실제 OS 입력을 내보내려면 `--live`를 명시한다.

```bash
PYTHONPATH=src python -m gesture_bridge pc-control --camera-index 0 --live
```

macOS live 모드는 터미널 또는 Python 실행 앱에 접근성/입력 모니터링 권한이 필요할 수 있다.

Python PC 제어 매핑은 `configs/gesture_actions.example.json`을 읽는다.

| 제스처 | 액션 |
| --- | --- |
| `open_palm` | idle |
| `point` | move_cursor |
| `pinch` | left_click |
| `peace` | next_slide |
| `thumbs_up` | scroll_up |
| `thumbs_down` | scroll_down |

### 수화 문장 추론

현재 학습 모델은 한국어 4라벨 기준이므로 아래 설정을 우선 사용한다.

```bash
PYTHONPATH=src python -m gesture_bridge sign-text \
  --camera-index 0 \
  --labels-config configs/korean_sign_labels.example.json \
  --output-mode both
```

단어만 보고 싶으면:

```bash
PYTHONPATH=src python -m gesture_bridge sign-text \
  --camera-index 0 \
  --labels-config configs/korean_sign_labels.example.json \
  --output-mode words
```

문장 메모리만 카메라 없이 확인:

```bash
PYTHONPATH=src python -m gesture_bridge translate-gloss 집 불
```

현재 확인된 출력:

```text
Gloss:
집 불
Korean sentence:
집에 불이 났어요.
Source: exact:GKSL3k_original.csv, score=1.00, matched_gloss=집 불
```

주의: `configs/korean_sentence_gloss_labels.expanded.json`에는 160개 후보 라벨이 있지만, 해당 라벨을 카메라가 바로 인식한다는 뜻은 아니다. 각 라벨별 sequence를 직접 수집하고 다시 학습해야 한다.

### 수화 데이터 수집과 재학습

라벨 수집:

```bash
PYTHONPATH=src python -m gesture_bridge collect-signs \
  --camera-index 0 \
  --labels-config configs/korean_sign_labels.example.json \
  --label 안녕하세요 \
  --sequences 30
```

학습:

```bash
PYTHONPATH=src python -m gesture_bridge train-signs \
  --labels-config configs/korean_sign_labels.example.json \
  --data-dir data/raw/signs \
  --model-path models/sign_knn.joblib
```

Python 재학습은 `models/sign_knn.joblib`을 갱신한다. 웹 수화 모드가 쓰는 `public/models/sign_knn.browser.json`을 갱신하는 변환 스크립트는 현재 저장소에서 확인되지 않았다. 웹 모델까지 바꾸려면 별도 변환 로직이 필요하다.

### 문장 리소스 재생성

공개 GKSL/KSL-LEX 리소스를 다시 받고 문장 메모리와 확장 라벨 설정을 만든다.

```bash
PYTHONPATH=src python -m gesture_bridge prepare-sentence-resources --max-labels 160
```

개별 명령:

```bash
PYTHONPATH=src python -m gesture_bridge download-sentence-data
PYTHONPATH=src python -m gesture_bridge download-ksl-lex
PYTHONPATH=src python -m gesture_bridge build-sentence-model
PYTHONPATH=src python -m gesture_bridge build-sentence-labels --max-labels 160
```

AI Hub/NIKL처럼 승인이 필요한 데이터는 직접 내려받아 압축을 푼 뒤 import한다.

```bash
PYTHONPATH=src python -m gesture_bridge import-sentence-corpus /path/to/extracted/ksl-corpus
```

## 6. 검증 결과

이번 검사에서 통과한 항목:

```bash
PYTHONPATH=src ./.venv/bin/python -m pytest -q
PYTHONPATH=src ./.venv/bin/ruff check src tests
PYTHONPATH=src ./.venv/bin/python -m compileall -q src tests
PYTHONPATH=src ./.venv/bin/python -m gesture_bridge translate-gloss 집 불
./node_modules/.bin/eslint .
./node_modules/.bin/tsc --noEmit
```

결과:

- Python 테스트: `8 passed`
- Ruff: `All checks passed`
- Python compileall: 통과
- gloss 번역: `집 불 -> 집에 불이 났어요.`
- ESLint: 통과
- TypeScript: 통과

현재 Codex 검사 환경에서 제한된 항목:

- `pnpm`/`npm` 명령이 PATH에 없었다.
- `./node_modules/.bin/next build`는 macOS `@next/swc-darwin-arm64` 바이너리 코드 서명 문제로 실패했다.

같은 SWC 오류가 일반 터미널에서도 나면 의존성을 정상 Node/pnpm 환경에서 다시 설치한다.

```bash
rm -rf node_modules .next
corepack enable
pnpm install --frozen-lockfile
pnpm build
```

## 7. 자주 막히는 부분

| 증상 | 확인할 것 |
| --- | --- |
| 웹 서버가 안 켜짐 | `pnpm` 설치/활성화, `./start-server.command` 사용 |
| Next SWC 로딩 실패 | `node_modules` 재설치, macOS 보안/코드 서명 문제 해소 |
| 웹 카메라 권한 실패 | 브라우저 사이트 권한, macOS 카메라 권한 |
| Web Speech API 미지원 | Chrome 계열 브라우저 사용 |
| Python 카메라가 안 열림 | `probe-camera`, `--camera-index`, `--camera-backend auto` 확인 |
| `pc-control --live`가 안 움직임 | macOS 접근성/입력 모니터링 권한 |
| 확장 라벨이 인식 안 됨 | config는 후보 목록일 뿐, 해당 라벨 sequence 수집과 재학습 필요 |
| Python 모델은 바뀌었는데 웹 인식이 그대로임 | 웹은 `public/models/sign_knn.browser.json`을 따로 사용함 |

## 8. 추천 실행 순서

1. `./start-server.command`로 웹 서버 실행
2. `/interactive`에서 마우스 시뮬레이션으로 전체 UI 확인
3. `/pc-control`에서 브라우저 내부 제스처 제어 확인
4. `/sign-text`에서 빠른 테스트 버튼으로 문장 확정/음성 출력 확인
5. 카메라 권한을 허용하고 웹 손 추적 확인
6. Python은 먼저 `probe-camera`를 돌린 뒤 `pc-control` dry-run 실행
7. 실제 OS 제어가 필요할 때만 `pc-control --live` 실행
8. 수화 라벨을 늘릴 때는 `collect-signs -> train-signs -> sign-text` 순서로 진행
