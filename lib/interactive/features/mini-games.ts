import type { MiniGameId } from "@/lib/interactive/types"

export type MiniGameDefinition = {
  id: MiniGameId
  label: string
  instruction: string
  objective: string
  inputHint: string
  skill: string
  durationSeconds: number
  targetScore: number
  accent: string
  command: string
}

export const MINI_GAME_DEFINITIONS: MiniGameDefinition[] = [
  {
    id: "catch",
    label: "낙하물 받기",
    instruction: "손바닥을 움직여 떨어지는 코어를 받아 점수를 얻습니다.",
    objective: "파란 코어를 받고 붉은 코어는 피해서 목표 점수에 도달하세요.",
    inputHint: "손 포인터 이동",
    skill: "위치 추적",
    durationSeconds: 45,
    targetScore: 120,
    accent: "#38bdf8",
    command: "게임 시작, 받기 게임",
  },
  {
    id: "bubble",
    label: "버블 터뜨리기",
    instruction: "검지 끝으로 떠다니는 버블을 터뜨립니다.",
    objective: "작아지기 전에 연속으로 버블을 터뜨려 콤보를 유지하세요.",
    inputHint: "검지 포인터 접촉",
    skill: "정밀 포인팅",
    durationSeconds: 40,
    targetScore: 95,
    accent: "#67e8f9",
    command: "버블 게임",
  },
  {
    id: "pong",
    label: "핸드 퐁",
    instruction: "손 위치로 패들을 움직여 에너지 볼을 튕깁니다.",
    objective: "오른쪽 패들을 지켜 공을 오래 살리고 반사 콤보를 쌓으세요.",
    inputHint: "손 포인터 상하 이동",
    skill: "타이밍 방어",
    durationSeconds: 50,
    targetScore: 70,
    accent: "#60a5fa",
    command: "퐁 게임",
  },
  {
    id: "avoid",
    label: "장애물 피하기",
    instruction: "손 포인터를 움직여 빨간 장애물을 피합니다.",
    objective: "위험체를 피하면서 보호막 타이밍으로 생존 점수를 모으세요.",
    inputHint: "이동 + 집기 보호막",
    skill: "회피 판단",
    durationSeconds: 45,
    targetScore: 80,
    accent: "#fb7185",
    command: "피하기 게임",
  },
  {
    id: "slice",
    label: "에너지 절단",
    instruction: "빠른 손 궤적으로 떠오르는 조각을 가릅니다.",
    objective: "충분히 빠른 손 궤적으로 노란 조각만 절단하세요.",
    inputHint: "빠른 손 이동",
    skill: "속도 제어",
    durationSeconds: 42,
    targetScore: 105,
    accent: "#facc15",
    command: "자르기 게임",
  },
  {
    id: "throw",
    label: "가상 공 던지기",
    instruction: "집었다 놓는 느낌으로 공을 목표점에 던집니다.",
    objective: "집기 상태로 에너지를 잡고 놓는 순간 목표 링을 맞히세요.",
    inputHint: "집기 후 놓기",
    skill: "투사체 조준",
    durationSeconds: 55,
    targetScore: 90,
    accent: "#f97316",
    command: "던지기 게임",
  },
  {
    id: "reaction",
    label: "반응 속도",
    instruction: "초록 신호가 켜지면 바로 손을 목표에 올립니다.",
    objective: "대기 신호에서는 참았다가 초록 신호에만 터치하세요.",
    inputHint: "신호 후 접촉",
    skill: "반응 억제",
    durationSeconds: 38,
    targetScore: 90,
    accent: "#22c55e",
    command: "반응 게임",
  },
  {
    id: "rhythm",
    label: "리듬 터치",
    instruction: "박자 링이 중앙에 닿는 순간 손끝을 올립니다.",
    objective: "박자 링이 판정선에 들어오는 순간 집기 또는 터치로 입력하세요.",
    inputHint: "박자 맞춰 집기",
    skill: "리듬 타이밍",
    durationSeconds: 48,
    targetScore: 110,
    accent: "#a855f7",
    command: "리듬 게임",
  },
  {
    id: "target",
    label: "표적 조준",
    instruction: "검지 포인터로 표적을 조준하고 집기 제스처로 발사합니다.",
    objective: "움직이는 표적을 조준하고 집기 제스처로 정확히 발사하세요.",
    inputHint: "조준 + 집기",
    skill: "정확도",
    durationSeconds: 45,
    targetScore: 100,
    accent: "#f43f5e",
    command: "표적 게임",
  },
]

export function getMiniGameDefinition(id: MiniGameId) {
  return MINI_GAME_DEFINITIONS.find((game) => game.id === id) ?? MINI_GAME_DEFINITIONS[0]
}

export function getNextMiniGame(current: MiniGameId) {
  const index = MINI_GAME_DEFINITIONS.findIndex((game) => game.id === current)
  return MINI_GAME_DEFINITIONS[(index + 1) % MINI_GAME_DEFINITIONS.length].id
}
