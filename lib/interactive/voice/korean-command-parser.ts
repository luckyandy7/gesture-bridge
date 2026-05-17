import type { EffectId, InteractiveMode, MiniGameId, ParsedCommand } from "@/lib/interactive/types"

const MODE_KEYWORDS: Array<{ mode: InteractiveMode; words: string[]; feedback: string }> = [
  { mode: "home", words: ["홈", "처음", "메인"], feedback: "홈 모드로 전환합니다." },
  { mode: "image", words: ["사진 모드", "이미지 모드", "사진"], feedback: "사진 모드로 전환합니다." },
  { mode: "drawing", words: ["그림 모드", "드로잉 모드", "그림 그리기"], feedback: "그림 모드로 전환합니다." },
  { mode: "weather", words: ["날씨 모드", "날씨"], feedback: "날씨 모드로 전환합니다." },
  { mode: "effects", words: ["효과 모드", "효과", "이펙트"], feedback: "효과 모드로 전환합니다." },
  { mode: "game", words: ["게임 모드", "게임"], feedback: "게임 모드로 전환합니다." },
  { mode: "three", words: ["3d 모드", "쓰리디 모드", "입체"], feedback: "3D 모드로 전환합니다." },
  { mode: "music", words: ["음악 모드", "뮤직"], feedback: "음악 모드로 전환합니다." },
  { mode: "settings", words: ["설정", "도움말", "도움"], feedback: "설정과 도움말을 엽니다." },
]

const EFFECT_KEYWORDS: Array<{ id: EffectId; words: string[] }> = [
  { id: "red_energy", words: ["붉은 에너지", "빨간 에너지", "레드"] },
  { id: "blue_pull", words: ["푸른 인력", "파란 인력", "블루"] },
  { id: "purple_fusion", words: ["보랏빛 융합", "보라", "융합"] },
  { id: "fire_release", words: ["화염 방출", "불", "화염"] },
  { id: "lightning_release", words: ["번개 방출", "번개", "전기"] },
  { id: "water_wave", words: ["물결 파동", "물결", "파동"] },
  { id: "wind_slash", words: ["바람 절단", "바람", "절단"] },
  { id: "shield", words: ["방어막", "보호막", "쉴드"] },
  { id: "portal", words: ["포탈", "문 열어", "차원문"] },
  { id: "particle_burst", words: ["입자 폭발", "폭발"] },
  { id: "aura", words: ["오라", "기운"] },
  { id: "magic_circle", words: ["마법진", "원형"] },
  { id: "laser_beam", words: ["레이저", "광선"] },
]

const GAME_KEYWORDS: Array<{ id: MiniGameId; words: string[] }> = [
  { id: "catch", words: ["받기", "캐치", "떨어지는"] },
  { id: "bubble", words: ["버블", "방울", "터뜨리기"] },
  { id: "pong", words: ["퐁", "탁구"] },
  { id: "avoid", words: ["피하기", "회피"] },
  { id: "slice", words: ["자르기", "슬라이스"] },
  { id: "throw", words: ["던지기", "공 던지기"] },
  { id: "reaction", words: ["반응", "순발력"] },
  { id: "rhythm", words: ["리듬", "박자"] },
  { id: "target", words: ["표적", "타겟", "조준"] },
]

const CITY_ALIASES: Record<string, string> = {
  서울: "서울",
  부산: "부산",
  대구: "대구",
  인천: "인천",
  광주: "광주",
  대전: "대전",
  울산: "울산",
  제주: "제주",
  도쿄: "도쿄",
  오사카: "오사카",
  뉴욕: "뉴욕",
  런던: "런던",
}

const COLOR_COMMANDS: Array<{ color: string; words: string[] }> = [
  { color: "#38bdf8", words: ["하늘색", "파란색", "파랑"] },
  { color: "#ef4444", words: ["빨간색", "빨강"] },
  { color: "#f97316", words: ["주황색", "주황"] },
  { color: "#facc15", words: ["노란색", "노랑"] },
  { color: "#22c55e", words: ["초록색", "초록"] },
  { color: "#a855f7", words: ["보라색", "보라"] },
  { color: "#ffffff", words: ["흰색", "하얀색"] },
]

export function parseKoreanCommand(transcript: string): ParsedCommand {
  const normalized = normalize(transcript)
  const compact = normalized.replace(/\s/g, "")

  if (!normalized) return unknown(transcript)

  if (includesAny(compact, ["초기화", "리셋", "reset"])) {
    return result("reset_all", transcript, "전체 화면을 초기화합니다.")
  }

  if (compact.includes("날씨")) {
    return {
      intent: "weather",
      transcript,
      city: extractCity(normalized),
      feedback: `${extractCity(normalized)} 날씨를 확인하고 있어요.`,
    }
  }

  if (includesAny(compact, ["다음사진", "다음이미지", "nextphoto", "nextimage"])) return result("image_next", transcript, "다음 사진으로 넘깁니다.")
  if (includesAny(compact, ["이전사진", "이전이미지", "previousphoto", "previmage"])) return result("image_prev", transcript, "이전 사진으로 돌아갑니다.")
  if (includesAny(compact, ["확대", "키워", "zoomin"])) return result("image_zoom_in", transcript, "선택한 사진을 확대합니다.")
  if (includesAny(compact, ["축소", "줄여", "zoomout"])) return result("image_zoom_out", transcript, "선택한 사진을 축소합니다.")
  if (includesAny(compact, ["사진숨겨", "이미지숨겨", "사진닫아"])) return result("image_hide", transcript, "사진 패널을 숨깁니다.")
  if (includesAny(compact, ["사진보여", "이미지보여", "사진열어", "사진모드"])) {
    return { ...result("image_show", transcript, "사진 패널을 표시합니다."), mode: "image" }
  }

  if (includesAny(compact, ["그림그리기시작", "드로잉시작", "그림모드"])) {
    return { ...result("drawing_start", transcript, "그림 그리기를 시작합니다."), mode: "drawing" }
  }
  if (includesAny(compact, ["지우개", "erase"])) return result("drawing_eraser", transcript, "지우개로 전환합니다.")
  if (includesAny(compact, ["펜", "그리기펜"])) return result("drawing_pen", transcript, "펜으로 전환합니다.")
  if (includesAny(compact, ["굵게", "두껍게"])) return result("drawing_thicker", transcript, "펜 굵기를 키웁니다.")
  if (includesAny(compact, ["얇게", "가늘게"])) return result("drawing_thinner", transcript, "펜 굵기를 줄입니다.")
  if (includesAny(compact, ["전체지워", "모두지워", "그림지워", "clearcanvas"])) return result("drawing_clear", transcript, "그림을 모두 지웁니다.")
  if (includesAny(compact, ["되돌려", "실행취소", "undo"])) return result("drawing_undo", transcript, "마지막 선을 되돌립니다.")
  if (includesAny(compact, ["저장", "save"])) return result("drawing_save", transcript, "캔버스를 이미지로 저장합니다.")
  if (includesAny(compact, ["펜색", "색바꿔", "색상"])) {
    const color = COLOR_COMMANDS.find((entry) => includesAny(normalized, entry.words))?.color
    return { ...result("drawing_color", transcript, "펜 색을 변경합니다."), color }
  }

  if (includesAny(compact, ["게임시작", "게임모드", "game"])) {
    return { ...result("game_start", transcript, "게임 모드를 시작합니다."), mode: "game", miniGameId: extractGame(normalized) }
  }
  if (includesAny(compact, ["게임바꿔", "다른게임", "다음게임"])) {
    return { ...result("game_switch", transcript, "다음 게임으로 전환합니다."), mode: "game", miniGameId: extractGame(normalized) }
  }

  if (includesAny(compact, ["효과실행", "효과보여", "이펙트", "effect"])) {
    return {
      ...result("effect_trigger", transcript, "효과를 실행합니다."),
      mode: "effects",
      effectId: extractEffect(normalized) ?? "particle_burst",
    }
  }

  if (includesAny(compact, ["3d보여", "쓰리디보여", "입체보여"])) return { ...result("three_show", transcript, "3D 오브젝트를 표시합니다."), mode: "three" }
  if (includesAny(compact, ["3d숨겨", "쓰리디숨겨"])) return result("three_hide", transcript, "3D 오브젝트를 숨깁니다.")

  if (includesAny(compact, ["음악재생", "노래재생", "playmusic"])) return { ...result("music_play", transcript, "음악을 재생합니다."), mode: "music" }
  if (includesAny(compact, ["음악멈춰", "노래멈춰", "pausemusic"])) return result("music_pause", transcript, "음악을 멈춥니다.")
  if (includesAny(compact, ["다음곡", "다음음악"])) return result("music_next", transcript, "다음 트랙으로 넘어갑니다.")
  if (includesAny(compact, ["이전곡", "이전음악"])) return result("music_prev", transcript, "이전 트랙으로 돌아갑니다.")
  if (includesAny(compact, ["볼륨올려", "소리키워"])) return result("music_volume_up", transcript, "볼륨을 올립니다.")
  if (includesAny(compact, ["볼륨내려", "소리줄여"])) return result("music_volume_down", transcript, "볼륨을 내립니다.")
  if (includesAny(compact, ["음소거", "mute"])) return result("music_mute", transcript, "음소거를 전환합니다.")

  const mode = MODE_KEYWORDS.find((entry) => entry.words.some((word) => normalized.includes(word)))
  if (mode && includesAny(compact, ["모드", "변경", "전환", "열어", "보여"])) {
    return { intent: "set_mode", transcript, mode: mode.mode, feedback: mode.feedback }
  }

  return unknown(transcript)
}

function result(intent: ParsedCommand["intent"], transcript: string, feedback: string): ParsedCommand {
  return { intent, transcript, feedback }
}

function unknown(transcript: string): ParsedCommand {
  return { intent: "unknown", transcript, feedback: "명령을 이해하지 못했어요. 도움말에서 사용할 수 있는 말을 확인해 주세요." }
}

function extractCity(text: string) {
  const match = Object.keys(CITY_ALIASES).find((city) => text.includes(city))
  return match ? CITY_ALIASES[match] : "서울"
}

function extractEffect(text: string): EffectId | undefined {
  return EFFECT_KEYWORDS.find((entry) => entry.words.some((word) => text.includes(word)))?.id
}

function extractGame(text: string): MiniGameId | undefined {
  return GAME_KEYWORDS.find((entry) => entry.words.some((word) => text.includes(word)))?.id
}

function includesAny(text: string, words: string[]) {
  return words.some((word) => text.includes(normalize(word).replace(/\s/g, "")) || text.includes(normalize(word)))
}

function normalize(value: string) {
  return value.trim().toLowerCase()
}
