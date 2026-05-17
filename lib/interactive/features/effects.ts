import type { EffectId } from "@/lib/interactive/types"

export type EffectDefinition = {
  id: EffectId
  label: string
  description: string
  colors: [string, string, string]
  gestureHint: string
}

export type EffectParticle = {
  id: number
  effectId: EffectId
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  radius: number
  color: string
  spin: number
  kind: "burst" | "ring" | "beam" | "slash" | "wave"
}

export const EFFECT_DEFINITIONS: EffectDefinition[] = [
  {
    id: "red_energy",
    label: "붉은 에너지",
    description: "집기 후 펼치면 중심에서 붉은 에너지가 폭발합니다.",
    colors: ["#ff2d55", "#ff7a1a", "#ffd166"],
    gestureHint: "손바닥 → 주먹 → 집기",
  },
  {
    id: "blue_pull",
    label: "푸른 인력",
    description: "손을 모으면 푸른 입자가 손끝으로 빨려 들어옵니다.",
    colors: ["#38bdf8", "#2563eb", "#dbeafe"],
    gestureHint: "양손 모으기",
  },
  {
    id: "purple_fusion",
    label: "보랏빛 융합",
    description: "두 손 사이에서 보랏빛 궤도가 합쳐집니다.",
    colors: ["#a855f7", "#ec4899", "#f0abfc"],
    gestureHint: "양손 거리 조절",
  },
  {
    id: "fire_release",
    label: "화염 방출",
    description: "손바닥 방향으로 불꽃이 퍼지는 효과입니다.",
    colors: ["#ef4444", "#f97316", "#fde047"],
    gestureHint: "손바닥",
  },
  {
    id: "lightning_release",
    label: "번개 방출",
    description: "검지 방향으로 전기 줄기가 분기됩니다.",
    colors: ["#67e8f9", "#fef08a", "#ffffff"],
    gestureHint: "가리키기",
  },
  {
    id: "water_wave",
    label: "물결 파동",
    description: "손끝에서 투명한 물결이 확산됩니다.",
    colors: ["#22d3ee", "#0ea5e9", "#cffafe"],
    gestureHint: "좌우 스와이프",
  },
  {
    id: "wind_slash",
    label: "바람 절단",
    description: "빠른 손 이동으로 절단 궤적을 남깁니다.",
    colors: ["#bbf7d0", "#34d399", "#ecfdf5"],
    gestureHint: "빠른 이동",
  },
  {
    id: "shield",
    label: "방어막",
    description: "손 앞에 원형 보호막이 펼쳐집니다.",
    colors: ["#60a5fa", "#c4b5fd", "#ffffff"],
    gestureHint: "두 손가락 → 손바닥 → 집기",
  },
  {
    id: "portal",
    label: "포탈",
    description: "양손을 모았다 벌리면 회전하는 포탈이 생깁니다.",
    colors: ["#14b8a6", "#8b5cf6", "#f8fafc"],
    gestureHint: "양손 모으기 → 펼치기",
  },
  {
    id: "particle_burst",
    label: "입자 폭발",
    description: "짧은 폭발형 입자 효과입니다.",
    colors: ["#f8fafc", "#38bdf8", "#f97316"],
    gestureHint: "주먹 열기",
  },
  {
    id: "aura",
    label: "오라",
    description: "사용자 주변에 은은한 에너지 장을 만듭니다.",
    colors: ["#22c55e", "#84cc16", "#f0fdf4"],
    gestureHint: "손바닥 유지",
  },
  {
    id: "magic_circle",
    label: "마법진",
    description: "손끝 아래 회전 원형 문양을 표시합니다.",
    colors: ["#f0abfc", "#c084fc", "#ffffff"],
    gestureHint: "집기 유지",
  },
  {
    id: "laser_beam",
    label: "레이저 빔",
    description: "가리킨 방향으로 강한 광선을 발사합니다.",
    colors: ["#f43f5e", "#fef2f2", "#fb7185"],
    gestureHint: "가리키기",
  },
]

export function getEffectDefinition(id: EffectId) {
  return EFFECT_DEFINITIONS.find((effect) => effect.id === id) ?? EFFECT_DEFINITIONS[0]
}

export function createEffectParticles(effectId: EffectId, x: number, y: number, now: number, amount = 52): EffectParticle[] {
  const effect = getEffectDefinition(effectId)
  const kind = getParticleKind(effectId)

  return Array.from({ length: amount }, (_, index) => {
    const angle = (Math.PI * 2 * index) / amount + Math.random() * 0.35
    const speed = 0.8 + Math.random() * 4.4
    const ringBoost = kind === "ring" || kind === "wave" ? 1.7 : 1
    return {
      id: now + index,
      effectId,
      x,
      y,
      vx: Math.cos(angle) * speed * ringBoost,
      vy: Math.sin(angle) * speed * ringBoost,
      life: 1,
      maxLife: 46 + Math.random() * 42,
      radius: 2 + Math.random() * 7,
      color: effect.colors[index % effect.colors.length],
      spin: (Math.random() - 0.5) * 0.12,
      kind,
    }
  })
}

function getParticleKind(effectId: EffectId): EffectParticle["kind"] {
  if (effectId === "portal" || effectId === "shield" || effectId === "magic_circle" || effectId === "aura") return "ring"
  if (effectId === "laser_beam" || effectId === "lightning_release") return "beam"
  if (effectId === "wind_slash") return "slash"
  if (effectId === "water_wave" || effectId === "blue_pull") return "wave"
  return "burst"
}
