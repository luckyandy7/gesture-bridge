import type {
  GestureHistoryFrame,
  GestureName,
  GestureSnapshot,
  NormalizedLandmark,
  Point,
  TrackedHand,
} from "@/lib/interactive/types"

type RecognizeInput = {
  landmarks: NormalizedLandmark[][]
  handednesses?: Array<Array<{ categoryName?: string; displayName?: string }>>
  previousHistory: GestureHistoryFrame[]
  previousTwoHandDistance: number | null
  timestamp: number
}

export type RecognizeResult = {
  snapshot: GestureSnapshot
  history: GestureHistoryFrame[]
}

const EMPTY_POINTER: Point = { x: 0.5, y: 0.5 }

export const GESTURE_LABELS: Record<GestureName, string> = {
  none: "대기",
  open_palm: "손바닥",
  fist: "주먹",
  pinch: "집기",
  point: "가리키기",
  peace: "두 손가락",
  thumbs_up: "엄지 위",
  two_hands_together: "양손 모으기",
  two_hands_spread: "양손 펼치기",
  swipe_left: "왼쪽 넘기기",
  swipe_right: "오른쪽 넘기기",
}

export function createEmptyGestureSnapshot(timestamp = 0): GestureSnapshot {
  return {
    hands: [],
    primaryHand: null,
    pointer: EMPTY_POINTER,
    activeGesture: "none",
    activeGestures: ["none"],
    swipe: null,
    twoHandDistance: null,
    twoHandDelta: 0,
    comboProgress: [],
    timestamp,
  }
}

export function recognizeGestureSnapshot(input: RecognizeInput): RecognizeResult {
  const hands = input.landmarks
    .filter((hand) => hand.length >= 21)
    .slice(0, 2)
    .map((hand, index) => recognizeHand(hand, getHandedness(input.handednesses, index), index))

  const primaryHand = hands[0] ?? null
  const pointer = primaryHand?.pointer ?? EMPTY_POINTER
  const history = trimHistory([
    ...input.previousHistory,
    {
      timestamp: input.timestamp,
      x: pointer.x,
      y: pointer.y,
      gesture: primaryHand?.gesture ?? "none",
    },
  ])
  const swipe = detectSwipe(history)
  const twoHandDistance = hands.length >= 2 ? distance(hands[0].center, hands[1].center) : null
  const twoHandDelta = twoHandDistance !== null && input.previousTwoHandDistance !== null ? twoHandDistance - input.previousTwoHandDistance : 0

  const activeGestures = new Set<GestureName>()
  hands.forEach((hand) => activeGestures.add(hand.gesture))

  if (swipe === "left") activeGestures.add("swipe_left")
  if (swipe === "right") activeGestures.add("swipe_right")
  if (twoHandDistance !== null && twoHandDistance < 0.2) activeGestures.add("two_hands_together")
  if (twoHandDistance !== null && twoHandDelta > 0.055) activeGestures.add("two_hands_spread")
  if (activeGestures.size === 0) activeGestures.add("none")

  const activeGesture = chooseDominantGesture(Array.from(activeGestures), primaryHand?.gesture ?? "none")

  return {
    snapshot: {
      hands,
      primaryHand,
      pointer,
      activeGesture,
      activeGestures: Array.from(activeGestures),
      swipe,
      twoHandDistance,
      twoHandDelta,
      comboProgress: [],
      timestamp: input.timestamp,
    },
    history,
  }
}

function recognizeHand(landmarks: NormalizedLandmark[], handedness: TrackedHand["handedness"], index: number): TrackedHand {
  const wrist = landmarks[0]
  const indexTip = landmarks[8]
  const middleMcp = landmarks[9]
  const palmSize = Math.max(distance(wrist, middleMcp), 0.035)
  const pinchDistance = distance(landmarks[4], indexTip)
  const pinchStrength = clamp(1 - pinchDistance / (palmSize * 0.9), 0, 1)
  const fingers = {
    thumb: distance(landmarks[4], wrist) > distance(landmarks[3], wrist) * 1.08,
    index: isFingerExtended(landmarks, 8, 6),
    middle: isFingerExtended(landmarks, 12, 10),
    ring: isFingerExtended(landmarks, 16, 14),
    pinky: isFingerExtended(landmarks, 20, 18),
  }
  const extendedCount = [fingers.index, fingers.middle, fingers.ring, fingers.pinky].filter(Boolean).length
  const gesture = classifyGesture(fingers, extendedCount, pinchDistance, palmSize)
  const center = averagePoint([landmarks[0], landmarks[5], landmarks[9], landmarks[13], landmarks[17]])

  return {
    id: `${handedness}-${index}`,
    handedness,
    landmarks,
    center,
    pointer: indexTip,
    palmSize,
    rotation: Math.atan2(middleMcp.y - wrist.y, middleMcp.x - wrist.x),
    pinchDistance,
    pinchStrength,
    gesture,
    fingers,
  }
}

function classifyGesture(
  fingers: TrackedHand["fingers"],
  extendedCount: number,
  pinchDistance: number,
  palmSize: number,
): GestureName {
  if (pinchDistance < palmSize * 0.38) return "pinch"
  if (extendedCount >= 4) return "open_palm"
  if (extendedCount === 0 && !fingers.thumb) return "fist"
  if (fingers.thumb && extendedCount === 0) return "thumbs_up"
  if (fingers.index && fingers.middle && !fingers.ring && !fingers.pinky) return "peace"
  if (fingers.index && !fingers.middle && !fingers.ring && !fingers.pinky) return "point"
  return "none"
}

function isFingerExtended(landmarks: NormalizedLandmark[], tipIndex: number, pipIndex: number) {
  const tip = landmarks[tipIndex]
  const pip = landmarks[pipIndex]
  const mcp = landmarks[Math.max(pipIndex - 1, 0)]
  const verticalExtended = tip.y < pip.y - 0.015
  const radialExtended = distance(tip, mcp) > distance(pip, mcp) * 1.08
  return verticalExtended || radialExtended
}

function detectSwipe(history: GestureHistoryFrame[]) {
  const recent = history.filter((frame) => history.at(-1)!.timestamp - frame.timestamp < 420)
  if (recent.length < 4) return null
  const first = recent[0]
  const last = recent.at(-1)!
  const dx = last.x - first.x
  const dy = last.y - first.y
  if (Math.abs(dx) > 0.18 && Math.abs(dx) > Math.abs(dy) * 1.55) {
    return dx > 0 ? "right" : "left"
  }
  return null
}

function chooseDominantGesture(gestures: GestureName[], primary: GestureName): GestureName {
  const priority: GestureName[] = [
    "two_hands_spread",
    "two_hands_together",
    "swipe_right",
    "swipe_left",
    "pinch",
    "open_palm",
    "fist",
    "point",
    "peace",
    "thumbs_up",
  ]
  return priority.find((gesture) => gestures.includes(gesture)) ?? primary
}

function getHandedness(input: RecognizeInput["handednesses"], index: number): TrackedHand["handedness"] {
  const value = input?.[index]?.[0]?.categoryName ?? input?.[index]?.[0]?.displayName
  if (value === "Left" || value === "Right") return value
  return "Unknown"
}

function trimHistory(history: GestureHistoryFrame[]) {
  const newest = history.at(-1)?.timestamp ?? 0
  return history.filter((frame) => newest - frame.timestamp < 900).slice(-24)
}

function averagePoint(points: Point[]): Point {
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  }
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
