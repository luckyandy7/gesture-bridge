import type { EffectId, GestureName, InteractiveMode } from "@/lib/interactive/types"
import { GESTURE_LABELS } from "@/lib/interactive/gesture/gesture-recognizer"

export type ComboAction =
  | { type: "effect"; effectId: EffectId; message: string }
  | { type: "mode"; mode: InteractiveMode; message: string }
  | { type: "image_next"; message: string }
  | { type: "reset"; message: string }

type ComboDefinition = {
  id: string
  label: string
  sequence: GestureName[]
  action: ComboAction
}

export type ComboFeedResult = {
  progress: string[]
  triggered: ComboDefinition | null
}

export const COMBO_DEFINITIONS: ComboDefinition[] = [
  {
    id: "red-energy",
    label: "붉은 에너지",
    sequence: ["open_palm", "fist", "pinch"],
    action: { type: "effect", effectId: "red_energy", message: "콤보 성공: 붉은 에너지" },
  },
  {
    id: "portal",
    label: "포탈 개방",
    sequence: ["two_hands_together", "two_hands_spread"],
    action: { type: "effect", effectId: "portal", message: "콤보 성공: 포탈 개방" },
  },
  {
    id: "image-next",
    label: "사진 넘기기",
    sequence: ["point", "swipe_right"],
    action: { type: "image_next", message: "콤보 성공: 다음 사진" },
  },
  {
    id: "shield",
    label: "방어막",
    sequence: ["peace", "open_palm", "pinch"],
    action: { type: "effect", effectId: "shield", message: "콤보 성공: 방어막" },
  },
  {
    id: "home-reset",
    label: "전체 초기화",
    sequence: ["fist", "open_palm", "fist"],
    action: { type: "reset", message: "콤보 성공: 전체 초기화" },
  },
]

export class GestureComboManager {
  private buffer: Array<{ gesture: GestureName; timestamp: number }> = []
  private lastGesture: GestureName = "none"

  feed(gesture: GestureName, timestamp: number): ComboFeedResult {
    if (gesture === "none") {
      return { progress: this.getProgress(), triggered: null }
    }

    if (gesture !== this.lastGesture) {
      this.buffer.push({ gesture, timestamp })
      this.lastGesture = gesture
    }

    this.buffer = this.buffer.filter((item) => timestamp - item.timestamp < 2600).slice(-5)

    const triggered = COMBO_DEFINITIONS.find((combo) => endsWithSequence(this.buffer.map((item) => item.gesture), combo.sequence)) ?? null
    if (triggered) {
      this.buffer = []
      this.lastGesture = "none"
    }

    return { progress: this.getProgress(), triggered }
  }

  reset() {
    this.buffer = []
    this.lastGesture = "none"
  }

  private getProgress() {
    return this.buffer.map((item) => GESTURE_LABELS[item.gesture])
  }
}

function endsWithSequence(buffer: GestureName[], sequence: GestureName[]) {
  if (buffer.length < sequence.length) return false
  const tail = buffer.slice(-sequence.length)
  return tail.every((gesture, index) => gesture === sequence[index])
}
