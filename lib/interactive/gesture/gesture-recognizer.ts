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
  cross: "손가락 교차",
  thumbs_up: "엄지 위",
  thumbs_down: "엄지 아래",
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
  const palmCenter = averagePoint([landmarks[0], landmarks[5], landmarks[9], landmarks[13], landmarks[17]])
  const pinchDistance = distance(landmarks[4], indexTip)
  const pinchStrength = clamp(1 - pinchDistance / (palmSize * 0.9), 0, 1)
  const fingers = {
    thumb: isThumbExtended(landmarks, palmCenter),
    index: isFingerExtended(landmarks, 8, 7, 6, 5, palmCenter, palmSize),
    middle: isFingerExtended(landmarks, 12, 11, 10, 9, palmCenter, palmSize),
    ring: isFingerExtended(landmarks, 16, 15, 14, 13, palmCenter, palmSize),
    pinky: isFingerExtended(landmarks, 20, 19, 18, 17, palmCenter, palmSize),
  }
  const extendedCount = [fingers.index, fingers.middle, fingers.ring, fingers.pinky].filter(Boolean).length
  const indexMiddleCrossed =
    fingers.index &&
    fingers.middle &&
    !fingers.ring &&
    !fingers.pinky &&
    distance(landmarks[8], landmarks[12]) < palmSize * 0.42
  const gesture = classifyGesture(fingers, extendedCount, pinchDistance, palmSize, indexMiddleCrossed, wrist, landmarks[4])
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
  indexMiddleCrossed: boolean,
  wrist: NormalizedLandmark,
  thumbTip: NormalizedLandmark,
): GestureName {
  if ((pinchDistance < palmSize * 0.48 && fingers.index) || pinchDistance < palmSize * 0.32) return "pinch"
  if (indexMiddleCrossed) return "cross"
  if (extendedCount >= 3) return "open_palm"
  if (extendedCount === 0 && !fingers.thumb) return "fist"
  if (fingers.thumb && extendedCount === 0) {
    const verticalDelta = thumbTip.y - wrist.y
    if (verticalDelta > palmSize * 0.28) return "thumbs_down"
    return "thumbs_up"
  }
  if (fingers.index && fingers.middle && !fingers.ring && !fingers.pinky) return "peace"
  if (fingers.index && !fingers.middle && !fingers.ring && !fingers.pinky) return "point"
  return "none"
}

function isFingerExtended(
  landmarks: NormalizedLandmark[],
  tipIndex: number,
  dipIndex: number,
  pipIndex: number,
  mcpIndex: number,
  palmCenter: Point,
  palmSize: number,
) {
  const tip = landmarks[tipIndex]
  const dip = landmarks[dipIndex]
  const pip = landmarks[pipIndex]
  const mcp = landmarks[mcpIndex]
  const reachFromMcp = distance(tip, mcp)
  const pipReachFromMcp = distance(pip, mcp)
  const tipPalmDistance = distance(tip, palmCenter)
  const pipPalmDistance = distance(pip, palmCenter)
  const straightness = cosine(
    { x: pip.x - mcp.x, y: pip.y - mcp.y },
    { x: tip.x - pip.x, y: tip.y - pip.y },
  )
  const distalStraightness = cosine(
    { x: dip.x - pip.x, y: dip.y - pip.y },
    { x: tip.x - dip.x, y: tip.y - dip.y },
  )
  const extendedByReach = reachFromMcp > pipReachFromMcp * 1.18 && tipPalmDistance > pipPalmDistance * 1.02
  const extendedByLength = reachFromMcp > palmSize * 1.08 && tipPalmDistance > palmSize * 0.72
  return (straightness > 0.18 && distalStraightness > 0.2 && extendedByReach) || extendedByLength
}

function isThumbExtended(landmarks: NormalizedLandmark[], palmCenter: Point) {
  const tip = landmarks[4]
  const ip = landmarks[3]
  const mcp = landmarks[2]
  const cmc = landmarks[1]
  const tipPalmDistance = distance(tip, palmCenter)
  const ipPalmDistance = distance(ip, palmCenter)
  const reachFromCmc = distance(tip, cmc)
  const ipReachFromCmc = distance(ip, cmc)
  const straightness = cosine(
    { x: mcp.x - cmc.x, y: mcp.y - cmc.y },
    { x: tip.x - mcp.x, y: tip.y - mcp.y },
  )
  return tipPalmDistance > ipPalmDistance * 1.08 && reachFromCmc > ipReachFromCmc * 1.08 && straightness > -0.15
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
    "cross",
    "open_palm",
    "fist",
    "point",
    "peace",
    "thumbs_up",
    "thumbs_down",
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

function cosine(a: Point, b: Point) {
  const denominator = Math.hypot(a.x, a.y) * Math.hypot(b.x, b.y)
  if (denominator < 1e-6) return 0
  return (a.x * b.x + a.y * b.y) / denominator
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
