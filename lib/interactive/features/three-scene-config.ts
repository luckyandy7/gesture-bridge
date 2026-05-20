export type ThreeSceneId = "gesture_core" | "hand_rig" | "orbital_lab" | "depth_field"
export type ThreeQuality = "performance" | "balanced" | "cinematic"

export type ThreeSceneDefinition = {
  id: ThreeSceneId
  label: string
  description: string
  gestureFocus: string
  accent: string
}

export const THREE_SCENE_DEFINITIONS: ThreeSceneDefinition[] = [
  {
    id: "gesture_core",
    label: "제스처 코어",
    description: "손 포인터를 중심으로 회전하는 크리스탈 코어와 궤도 링입니다.",
    gestureFocus: "가리키기 · 집기",
    accent: "#8ee7d8",
  },
  {
    id: "hand_rig",
    label: "핸드 리그",
    description: "카메라 손 랜드마크를 3D 관절 구조로 재구성합니다.",
    gestureFocus: "손바닥 · 집기",
    accent: "#f7c96b",
  },
  {
    id: "orbital_lab",
    label: "오비탈 랩",
    description: "명령 노드와 위성 오브젝트가 손 방향에 맞춰 재배치됩니다.",
    gestureFocus: "양손 · 스와이프",
    accent: "#9db7ff",
  },
  {
    id: "depth_field",
    label: "깊이 필드",
    description: "포인터 주변의 공간 깊이를 막대와 파동으로 표시합니다.",
    gestureFocus: "이동 · 확대",
    accent: "#fb8f67",
  },
]

export const THREE_QUALITY_OPTIONS: Array<{ id: ThreeQuality; label: string }> = [
  { id: "performance", label: "경량" },
  { id: "balanced", label: "균형" },
  { id: "cinematic", label: "고품질" },
]

export function getThreeSceneDefinition(id: ThreeSceneId) {
  return THREE_SCENE_DEFINITIONS.find((scene) => scene.id === id) ?? THREE_SCENE_DEFINITIONS[0]
}

export function getNextThreeScene(id: ThreeSceneId) {
  const index = THREE_SCENE_DEFINITIONS.findIndex((scene) => scene.id === id)
  return THREE_SCENE_DEFINITIONS[(index + 1 + THREE_SCENE_DEFINITIONS.length) % THREE_SCENE_DEFINITIONS.length].id
}
