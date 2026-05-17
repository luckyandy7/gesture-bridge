"use client"

export type Landmark3D = {
  x: number
  y: number
  z?: number
}

export type FaceExpression = {
  label: string
  tone: "neutral" | "positive" | "question" | "negative" | "emphasis"
  confidence: number
  scores: {
    smile: number
    question: number
    negative: number
    emphasis: number
    mouthOpen: number
  }
}

export type BrowserKnnModel = {
  version: number
  modelType: string
  labels: string[]
  classes: string[]
  sequenceLength: number
  featureSize: number
  flatFeatureSize: number
  neighbors: number
  weights: string
  metric: string
  scalerMean: number[]
  scalerScale: number[]
  samples: number[][]
  sampleLabels: string[]
}

export type SignPrediction = {
  label: string
  confidence: number
  alternatives: Array<{ label: string; confidence: number }>
}

export type HolisticFeatureInput = {
  poseLandmarks?: Landmark3D[][]
  leftHandLandmarks?: Landmark3D[][]
  rightHandLandmarks?: Landmark3D[][]
}

export type BlendshapeCategory = {
  categoryName?: string
  displayName?: string
  score?: number
}

export type BlendshapeResult = {
  categories?: BlendshapeCategory[]
}

const EMPTY_FACE_EXPRESSION: FaceExpression = {
  label: "표정 대기",
  tone: "neutral",
  confidence: 0,
  scores: {
    smile: 0,
    question: 0,
    negative: 0,
    emphasis: 0,
    mouthOpen: 0,
  },
}

const SIGN_POSE_INDICES = [11, 12, 13, 14, 15, 16]

export async function loadBrowserKnnModel(path = "/models/sign_knn.browser.json") {
  const response = await fetch(path)
  if (!response.ok) {
    throw new Error(`Failed to load sign model: ${response.status}`)
  }
  return (await response.json()) as BrowserKnnModel
}

export function flattenHolisticFrameFeatures(input: HolisticFeatureInput) {
  const pose = pointsToArray(input.poseLandmarks?.[0])
  const leftHand = pointsToArray(input.leftHandLandmarks?.[0])
  const rightHand = pointsToArray(input.rightHandLandmarks?.[0])
  const { center, scale } = bodyReference(pose)

  const poseSubset =
    pose.length > Math.max(...SIGN_POSE_INDICES)
      ? SIGN_POSE_INDICES.map((index) => pose[index])
      : zeroPoints(SIGN_POSE_INDICES.length)

  const poseFeatures = normalizeGlobal(poseSubset, center, scale, SIGN_POSE_INDICES.length)
  const leftGlobal = normalizeGlobal(leftHand, center, scale, 21)
  const rightGlobal = normalizeGlobal(rightHand, center, scale, 21)
  const leftLocal = normalizeLocalHand(leftHand, 21)
  const rightLocal = normalizeLocalHand(rightHand, 21)
  const presence = [leftHand.length ? 1 : 0, rightHand.length ? 1 : 0]

  return [
    ...flattenPoints(poseFeatures),
    ...flattenPoints(leftGlobal),
    ...flattenPoints(rightGlobal),
    ...flattenPoints(leftLocal),
    ...flattenPoints(rightLocal),
    ...presence,
  ]
}

export function predictSignSequence(model: BrowserKnnModel, sequence: number[][]): SignPrediction {
  if (sequence.length !== model.sequenceLength) {
    throw new Error(`Expected ${model.sequenceLength} frames, received ${sequence.length}`)
  }

  const flat = sequence.flat()
  if (flat.length !== model.flatFeatureSize) {
    throw new Error(`Expected ${model.flatFeatureSize} features, received ${flat.length}`)
  }

  const scaled = flat.map((value, index) => (value - model.scalerMean[index]) / safeScale(model.scalerScale[index]))
  const nearest = model.samples
    .map((sample, index) => ({
      index,
      label: model.sampleLabels[index],
      distance: euclideanDistance(scaled, sample),
    }))
    .sort((left, right) => left.distance - right.distance)
    .slice(0, model.neighbors)

  const exact = nearest.find((item) => item.distance < 1e-9)
  if (exact) {
    return {
      label: exact.label,
      confidence: 1,
      alternatives: [{ label: exact.label, confidence: 1 }],
    }
  }

  const totals = new Map<string, number>()
  nearest.forEach((item) => {
    const weight = model.weights === "distance" ? 1 / Math.max(item.distance, 1e-9) : 1
    totals.set(item.label, (totals.get(item.label) ?? 0) + weight)
  })

  const totalWeight = Array.from(totals.values()).reduce((sum, value) => sum + value, 0)
  const alternatives = Array.from(totals.entries())
    .map(([label, weight]) => ({ label, confidence: totalWeight ? weight / totalWeight : 0 }))
    .sort((left, right) => right.confidence - left.confidence)

  return {
    label: alternatives[0]?.label ?? "대기",
    confidence: alternatives[0]?.confidence ?? 0,
    alternatives,
  }
}

export function readFaceExpression(blendshapes?: BlendshapeResult[], hasFace = true): FaceExpression {
  if (!hasFace || !blendshapes?.[0]?.categories?.length) return EMPTY_FACE_EXPRESSION

  const scores = new Map<string, number>()
  blendshapes[0].categories.forEach((category) => {
    scores.set(category.categoryName ?? category.displayName ?? "", category.score ?? 0)
  })

  const smile = average(score(scores, "mouthSmileLeft"), score(scores, "mouthSmileRight"))
  const browInnerUp = score(scores, "browInnerUp")
  const eyeWide = average(score(scores, "eyeWideLeft"), score(scores, "eyeWideRight"))
  const browDown = average(score(scores, "browDownLeft"), score(scores, "browDownRight"))
  const mouthFrown = average(score(scores, "mouthFrownLeft"), score(scores, "mouthFrownRight"))
  const jawOpen = score(scores, "jawOpen")
  const mouthPucker = score(scores, "mouthPucker")

  const expressionScores = {
    smile,
    question: clamp(browInnerUp * 0.65 + eyeWide * 0.35, 0, 1),
    negative: clamp(browDown * 0.55 + mouthFrown * 0.45, 0, 1),
    emphasis: clamp(jawOpen * 0.68 + mouthPucker * 0.32, 0, 1),
    mouthOpen: jawOpen,
  }

  const ranked = [
    { label: "질문 표정", tone: "question" as const, confidence: expressionScores.question },
    { label: "부정/긴장 표정", tone: "negative" as const, confidence: expressionScores.negative },
    { label: "강조 표정", tone: "emphasis" as const, confidence: expressionScores.emphasis },
    { label: "긍정 표정", tone: "positive" as const, confidence: expressionScores.smile },
  ].sort((left, right) => right.confidence - left.confidence)

  const top = ranked[0]
  if (!top || top.confidence < 0.22) {
    return { label: "중립 표정", tone: "neutral", confidence: 1 - (top?.confidence ?? 0), scores: expressionScores }
  }

  return { ...top, scores: expressionScores }
}

export function hasEnoughHolisticSignal(input: HolisticFeatureInput) {
  const hasPose = Boolean(input.poseLandmarks?.[0]?.length)
  const hasHand = Boolean(input.leftHandLandmarks?.[0]?.length || input.rightHandLandmarks?.[0]?.length)
  return hasPose && hasHand
}

function pointsToArray(points?: Landmark3D[]) {
  return points?.map((point) => [point.x, point.y, point.z ?? 0]) ?? []
}

function zeroPoints(count: number) {
  return Array.from({ length: count }, () => [0, 0, 0])
}

function bodyReference(pose: number[][]) {
  if (pose.length < 17) {
    return { center: [0, 0, 0], scale: 1 }
  }

  const leftShoulder = pose[11]
  const rightShoulder = pose[12]
  const center = [
    (leftShoulder[0] + rightShoulder[0]) / 2,
    (leftShoulder[1] + rightShoulder[1]) / 2,
    (leftShoulder[2] + rightShoulder[2]) / 2,
  ]

  let scale = distance2d(leftShoulder, rightShoulder)
  if (scale < 1e-6) scale = distance2d(pose[13], pose[14])
  if (scale < 1e-6) scale = 1
  return { center, scale }
}

function normalizeGlobal(points: number[][], center: number[], scale: number, expectedCount: number) {
  const source = points.length ? points : zeroPoints(expectedCount)
  return source.map((point) => [(point[0] - center[0]) / scale, (point[1] - center[1]) / scale, (point[2] - center[2]) / scale])
}

function normalizeLocalHand(points: number[][], expectedCount: number) {
  if (!points.length) return zeroPoints(expectedCount)
  const wrist = points[0]
  const shifted = points.map((point) => [point[0] - wrist[0], point[1] - wrist[1], point[2] - wrist[2]])
  const scale = Math.max(...shifted.map((point) => Math.hypot(point[0], point[1])), 1e-6)
  return shifted.map((point) => [point[0] / scale, point[1] / scale, point[2] / scale])
}

function flattenPoints(points: number[][]) {
  return points.flat().map((value) => Number.isFinite(value) ? value : 0)
}

function euclideanDistance(left: number[], right: number[]) {
  let sum = 0
  for (let index = 0; index < left.length; index += 1) {
    const delta = left[index] - right[index]
    sum += delta * delta
  }
  return Math.sqrt(sum)
}

function safeScale(value: number) {
  return Math.abs(value) > 1e-12 ? value : 1
}

function score(scores: Map<string, number>, key: string) {
  return scores.get(key) ?? 0
}

function average(left: number, right: number) {
  return (left + right) / 2
}

function distance2d(left: number[], right: number[]) {
  return Math.hypot(left[0] - right[0], left[1] - right[1])
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
