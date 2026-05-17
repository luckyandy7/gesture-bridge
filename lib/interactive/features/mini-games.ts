import type { MiniGameId } from "@/lib/interactive/types"

export type MiniGameDefinition = {
  id: MiniGameId
  label: string
  instruction: string
  command: string
}

export const MINI_GAME_DEFINITIONS: MiniGameDefinition[] = [
  {
    id: "catch",
    label: "낙하물 받기",
    instruction: "손바닥을 움직여 떨어지는 코어를 받아 점수를 얻습니다.",
    command: "게임 시작, 받기 게임",
  },
  {
    id: "bubble",
    label: "버블 터뜨리기",
    instruction: "검지 끝으로 떠다니는 버블을 터뜨립니다.",
    command: "버블 게임",
  },
  {
    id: "pong",
    label: "핸드 퐁",
    instruction: "손 위치로 패들을 움직여 에너지 볼을 튕깁니다.",
    command: "퐁 게임",
  },
  {
    id: "avoid",
    label: "장애물 피하기",
    instruction: "손 포인터를 움직여 빨간 장애물을 피합니다.",
    command: "피하기 게임",
  },
  {
    id: "slice",
    label: "에너지 절단",
    instruction: "빠른 손 궤적으로 떠오르는 조각을 가릅니다.",
    command: "자르기 게임",
  },
  {
    id: "throw",
    label: "가상 공 던지기",
    instruction: "집었다 놓는 느낌으로 공을 목표점에 던집니다.",
    command: "던지기 게임",
  },
  {
    id: "reaction",
    label: "반응 속도",
    instruction: "초록 신호가 켜지면 바로 손을 목표에 올립니다.",
    command: "반응 게임",
  },
  {
    id: "rhythm",
    label: "리듬 터치",
    instruction: "박자 링이 중앙에 닿는 순간 손끝을 올립니다.",
    command: "리듬 게임",
  },
  {
    id: "target",
    label: "표적 조준",
    instruction: "검지 포인터로 표적을 조준하고 집기 제스처로 발사합니다.",
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
