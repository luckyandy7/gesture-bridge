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
    headShake?: number
    stability?: number
    calibration?: number
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

export type BrowserKnnCustomTraining = {
  version: number
  sequenceLength: number
  featureSize: number
  flatFeatureSize: number
  labels: string[]
  samples: number[][]
  sampleLabels: string[]
  createdAt: string
  updatedAt: string
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

type FaceExpressionTone = FaceExpression["tone"]

type FaceExpressionCandidate = {
  label: string
  tone: FaceExpressionTone
  confidence: number
}

type ExpressionFrame = {
  timestamp: number
  scores: Required<FaceExpression["scores"]>
  yaw: number | null
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
    headShake: 0,
    stability: 0,
    calibration: 0,
  },
}

const SIGN_POSE_INDICES = [11, 12, 13, 14, 15, 16]
const CUSTOM_TRAINING_STORAGE_KEY = "gesture-bridge.sign-text.custom-training.v1"
const CUSTOM_TRAINING_MAX_SAMPLES = 120
const EXPRESSION_CALIBRATION_MS = 900
const EXPRESSION_WINDOW_MS = 850
const EXPRESSION_SWITCH_FRAMES = 2
const EXPRESSION_NEUTRAL_FRAMES = 4

export async function loadBaseBrowserKnnModel(path = "/models/sign_knn.browser.json") {
  const response = await fetch(path)
  if (!response.ok) {
    throw new Error(`Failed to load sign model: ${response.status}`)
  }
  return (await response.json()) as BrowserKnnModel
}

export async function loadBrowserKnnModel(path = "/models/sign_knn.browser.json") {
  const baseModel = await loadBaseBrowserKnnModel(path)
  return loadStoredBrowserKnnModel(baseModel)
}

export function loadStoredBrowserKnnModel(baseModel: BrowserKnnModel) {
  const custom = readBrowserKnnCustomTraining(baseModel)
  if (!custom) return baseModel

  const labels = uniqueLabels([...baseModel.labels, ...custom.labels, ...custom.sampleLabels])
  const classes = uniqueLabels([...baseModel.classes, ...labels])
  return {
    ...baseModel,
    labels,
    classes,
    samples: [...baseModel.samples, ...custom.samples],
    sampleLabels: [...baseModel.sampleLabels, ...custom.sampleLabels],
  }
}

export function readBrowserKnnCustomTraining(baseModel?: BrowserKnnModel | null): BrowserKnnCustomTraining | null {
  if (typeof window === "undefined") return null
  const raw = window.localStorage.getItem(CUSTOM_TRAINING_STORAGE_KEY)
  if (!raw) return null

  try {
    const payload = JSON.parse(raw) as BrowserKnnCustomTraining
    if (!isCustomTrainingPayload(payload)) return null
    if (baseModel && !isCustomTrainingCompatible(baseModel, payload)) return null
    return payload
  } catch {
    return null
  }
}

export function addBrowserKnnCustomLabel(baseModel: BrowserKnnModel, label: string) {
  const normalizedLabel = normalizeBrowserKnnLabel(label)
  if (!normalizedLabel) {
    throw new Error("라벨 이름을 입력하세요.")
  }

  const custom = readBrowserKnnCustomTraining(baseModel) ?? createEmptyCustomTraining(baseModel)
  const now = new Date().toISOString()
  const nextCustom: BrowserKnnCustomTraining = {
    ...custom,
    labels: uniqueLabels([...custom.labels, normalizedLabel]),
    updatedAt: now,
  }
  writeBrowserKnnCustomTraining(nextCustom)
  return loadStoredBrowserKnnModel(baseModel)
}

export function addBrowserKnnTrainingSample(baseModel: BrowserKnnModel, label: string, sequence: number[][]) {
  const normalizedLabel = normalizeBrowserKnnLabel(label)
  if (!normalizedLabel) {
    throw new Error("라벨 이름을 입력하세요.")
  }
  if (sequence.length < baseModel.sequenceLength) {
    throw new Error(`샘플이 부족합니다. ${baseModel.sequenceLength}프레임이 필요합니다.`)
  }

  const frames = sequence.slice(-baseModel.sequenceLength)
  frames.forEach((frame) => {
    if (frame.length !== baseModel.featureSize) {
      throw new Error(`샘플 프레임 크기가 다릅니다. ${baseModel.featureSize}개 특징이 필요합니다.`)
    }
  })

  const flat = frames.flat()
  if (flat.length !== baseModel.flatFeatureSize) {
    throw new Error(`샘플 특징 크기가 다릅니다. ${baseModel.flatFeatureSize}개 특징이 필요합니다.`)
  }

  const scaled = flat.map((value, index) => (value - baseModel.scalerMean[index]) / safeScale(baseModel.scalerScale[index]))
  const custom = readBrowserKnnCustomTraining(baseModel) ?? createEmptyCustomTraining(baseModel)
  const now = new Date().toISOString()
  const nextCustom: BrowserKnnCustomTraining = {
    ...custom,
    labels: uniqueLabels([...custom.labels, normalizedLabel]),
    samples: [...custom.samples, scaled].slice(-CUSTOM_TRAINING_MAX_SAMPLES),
    sampleLabels: [...custom.sampleLabels, normalizedLabel].slice(-CUSTOM_TRAINING_MAX_SAMPLES),
    updatedAt: now,
  }
  writeBrowserKnnCustomTraining(nextCustom)
  return loadStoredBrowserKnnModel(baseModel)
}

export function clearBrowserKnnCustomTraining() {
  if (typeof window === "undefined") return
  window.localStorage.removeItem(CUSTOM_TRAINING_STORAGE_KEY)
}

export function getBrowserKnnLabelCounts(model: BrowserKnnModel) {
  const counts = new Map<string, number>()
  model.labels.forEach((label) => counts.set(label, 0))
  model.sampleLabels.forEach((label) => counts.set(label, (counts.get(label) ?? 0) + 1))
  return model.labels.map((label) => ({ label, count: counts.get(label) ?? 0 }))
}

export function normalizeBrowserKnnLabel(value: string) {
  return value.trim().replace(/\s+/g, "_").replace(/^_+|_+$/g, "")
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
  const raw = readRawExpressionScores(blendshapes, hasFace)
  if (!raw) return EMPTY_FACE_EXPRESSION
  return classifyExpression(raw)
}

export function createFaceExpressionTracker() {
  let calibrationStartAt = 0
  let calibrationFrames: Required<FaceExpression["scores"]>[] = []
  let baseline: Required<FaceExpression["scores"]> | null = null
  let frames: ExpressionFrame[] = []
  let stableTone: FaceExpressionTone = "neutral"
  let stableLabel = "중립 표정"
  let candidateTone: FaceExpressionTone = "neutral"
  let candidateFrames = 0
  let neutralFrames = 0
  let missingFrames = 0

  const reset = () => {
    calibrationStartAt = 0
    calibrationFrames = []
    baseline = null
    frames = []
    stableTone = "neutral"
    stableLabel = "중립 표정"
    candidateTone = "neutral"
    candidateFrames = 0
    neutralFrames = 0
    missingFrames = 0
  }

  const read = ({
    blendshapes,
    faceLandmarks,
    timestamp,
  }: {
    blendshapes?: BlendshapeResult[]
    faceLandmarks?: Landmark3D[]
    timestamp: number
  }): FaceExpression => {
    const raw = readRawExpressionScores(blendshapes, Boolean(faceLandmarks?.length))
    if (!raw) {
      missingFrames += 1
      if (missingFrames > 6) reset()
      return EMPTY_FACE_EXPRESSION
    }

    missingFrames = 0
    if (!calibrationStartAt) calibrationStartAt = timestamp

    if (!baseline) {
      calibrationFrames.push(raw)
      const progress = clamp((timestamp - calibrationStartAt) / EXPRESSION_CALIBRATION_MS, 0, 1)
      if (progress >= 1 || calibrationFrames.length >= 18) {
        baseline = averageExpressionScores(calibrationFrames)
      } else {
        return {
          label: "중립 캘리브레이션",
          tone: "neutral",
          confidence: progress,
          scores: { ...raw, calibration: progress, stability: 0 },
        }
      }
    }

    const yaw = estimateFaceYaw(faceLandmarks)
    const adjusted = adjustExpressionScores(raw, baseline)
    frames = [...frames, { timestamp, scores: adjusted, yaw }].filter((frame) => timestamp - frame.timestamp <= EXPRESSION_WINDOW_MS)

    const headShake = readHeadShake(frames)
    const smoothed = averageExpressionScores(frames.map((frame) => frame.scores))
    smoothed.headShake = headShake
    smoothed.negative = clamp(smoothed.negative * 0.68 + headShake * 0.46, 0, 1)
    smoothed.calibration = 1

    const ranked = rankExpressionScores(smoothed)
    const top = ranked[0]
    const runnerUp = ranked[1]
    const topConfidence = top?.confidence ?? 0
    const margin = topConfidence - (runnerUp?.confidence ?? 0)

    if (!top || topConfidence < 0.18) {
      neutralFrames += 1
      if (neutralFrames >= EXPRESSION_NEUTRAL_FRAMES) {
        stableTone = "neutral"
        stableLabel = "중립 표정"
      }
    } else {
      neutralFrames = 0
      if (top.tone !== candidateTone) {
        candidateTone = top.tone
        candidateFrames = 1
      } else {
        candidateFrames += 1
      }

      const canSwitch = candidateFrames >= EXPRESSION_SWITCH_FRAMES && topConfidence >= 0.26 && (margin >= 0.035 || top.tone === stableTone)
      if (canSwitch) {
        stableTone = top.tone
        stableLabel = top.label
      }
    }
    smoothed.stability = readExpressionStability(frames, stableTone === "neutral" ? top?.tone ?? "neutral" : stableTone)

    if (stableTone === "neutral") {
      return {
        label: "중립 표정",
        tone: "neutral",
        confidence: clamp(1 - topConfidence, 0.24, 1),
        scores: smoothed,
      }
    }

    const stable = ranked.find((item) => item.tone === stableTone) ?? top
    return {
      label: stableLabel,
      tone: stableTone,
      confidence: stable?.confidence ?? 0,
      scores: smoothed,
    }
  }

  return { read, reset }
}

function readRawExpressionScores(blendshapes?: BlendshapeResult[], hasFace = true): Required<FaceExpression["scores"]> | null {
  if (!hasFace || !blendshapes?.[0]?.categories?.length) return null

  const scores = new Map<string, number>()
  blendshapes[0].categories.forEach((category) => {
    scores.set(category.categoryName ?? category.displayName ?? "", category.score ?? 0)
  })

  const smile = symmetric(score(scores, "mouthSmileLeft"), score(scores, "mouthSmileRight"))
  const cheekSquint = symmetric(score(scores, "cheekSquintLeft"), score(scores, "cheekSquintRight"))
  const browInnerUp = score(scores, "browInnerUp")
  const browOuterUp = symmetric(score(scores, "browOuterUpLeft"), score(scores, "browOuterUpRight"))
  const eyeWide = symmetric(score(scores, "eyeWideLeft"), score(scores, "eyeWideRight"))
  const eyeSquint = symmetric(score(scores, "eyeSquintLeft"), score(scores, "eyeSquintRight"))
  const browDown = symmetric(score(scores, "browDownLeft"), score(scores, "browDownRight"))
  const mouthFrown = symmetric(score(scores, "mouthFrownLeft"), score(scores, "mouthFrownRight"))
  const jawOpen = score(scores, "jawOpen")
  const mouthPucker = score(scores, "mouthPucker")
  const mouthPress = symmetric(score(scores, "mouthPressLeft"), score(scores, "mouthPressRight"))
  const mouthStretch = symmetric(score(scores, "mouthStretchLeft"), score(scores, "mouthStretchRight"))
  const mouthUpperUp = symmetric(score(scores, "mouthUpperUpLeft"), score(scores, "mouthUpperUpRight"))
  const mouthLowerDown = symmetric(score(scores, "mouthLowerDownLeft"), score(scores, "mouthLowerDownRight"))
  const mouthShrug = average(score(scores, "mouthShrugLower"), score(scores, "mouthShrugUpper"))
  const noseSneer = symmetric(score(scores, "noseSneerLeft"), score(scores, "noseSneerRight"))

  return {
    smile: clamp(smile * 0.82 + cheekSquint * 0.18, 0, 1),
    question: clamp(browInnerUp * 0.42 + browOuterUp * 0.2 + eyeWide * 0.26 + jawOpen * 0.12, 0, 1),
    negative: clamp(browDown * 0.3 + mouthFrown * 0.28 + mouthPress * 0.12 + mouthShrug * 0.12 + noseSneer * 0.1 + eyeSquint * 0.08, 0, 1),
    emphasis: clamp(jawOpen * 0.42 + mouthPucker * 0.18 + mouthPress * 0.12 + mouthStretch * 0.13 + mouthUpperUp * 0.08 + mouthLowerDown * 0.07, 0, 1),
    mouthOpen: jawOpen,
    headShake: 0,
    stability: 0,
    calibration: 1,
  }
}

function classifyExpression(expressionScores: Required<FaceExpression["scores"]>): FaceExpression {
  const ranked = [
    ...rankExpressionScores(expressionScores),
  ]

  const top = ranked[0]
  if (!top || top.confidence < 0.22) {
    return { label: "중립 표정", tone: "neutral", confidence: 1 - (top?.confidence ?? 0), scores: expressionScores }
  }

  return { ...top, scores: expressionScores }
}

function rankExpressionScores(scores: Required<FaceExpression["scores"]>): FaceExpressionCandidate[] {
  const candidates: FaceExpressionCandidate[] = [
    { label: "질문 표정", tone: "question", confidence: scores.question },
    { label: "부정/긴장 표정", tone: "negative", confidence: scores.negative },
    { label: "강조 표정", tone: "emphasis", confidence: scores.emphasis },
    { label: "긍정 표정", tone: "positive", confidence: scores.smile },
  ]
  return candidates.sort((left, right) => right.confidence - left.confidence)
}

function adjustExpressionScores(current: Required<FaceExpression["scores"]>, baseline: Required<FaceExpression["scores"]>): Required<FaceExpression["scores"]> {
  return {
    smile: liftExpressionScore(current.smile, baseline.smile, 1.42),
    question: liftExpressionScore(current.question, baseline.question, 1.48),
    negative: liftExpressionScore(current.negative, baseline.negative, 1.5),
    emphasis: liftExpressionScore(current.emphasis, baseline.emphasis, 1.36),
    mouthOpen: liftExpressionScore(current.mouthOpen, baseline.mouthOpen, 1.28),
    headShake: 0,
    stability: 0,
    calibration: 1,
  }
}

function liftExpressionScore(value: number, baseline: number, gain: number) {
  return clamp((value - baseline * 0.72) * gain, 0, 1)
}

function averageExpressionScores(items: Required<FaceExpression["scores"]>[]): Required<FaceExpression["scores"]> {
  if (!items.length) {
    return {
      smile: 0,
      question: 0,
      negative: 0,
      emphasis: 0,
      mouthOpen: 0,
      headShake: 0,
      stability: 0,
      calibration: 0,
    }
  }

  return {
    smile: mean(items, "smile"),
    question: mean(items, "question"),
    negative: mean(items, "negative"),
    emphasis: mean(items, "emphasis"),
    mouthOpen: mean(items, "mouthOpen"),
    headShake: mean(items, "headShake"),
    stability: mean(items, "stability"),
    calibration: mean(items, "calibration"),
  }
}

function readHeadShake(frames: ExpressionFrame[]) {
  const yawValues = frames.map((frame) => frame.yaw).filter((value): value is number => typeof value === "number" && Number.isFinite(value))
  if (yawValues.length < 4) return 0
  const min = Math.min(...yawValues)
  const max = Math.max(...yawValues)
  return clamp((max - min - 0.11) / 0.22, 0, 1)
}

function readExpressionStability(frames: ExpressionFrame[], tone: FaceExpressionTone) {
  if (tone === "neutral" || !frames.length) return 0
  const key = tone === "positive" ? "smile" : tone
  const values = frames.map((frame) => frame.scores[key])
  const averageValue = values.reduce((sum, value) => sum + value, 0) / values.length
  const variance = values.reduce((sum, value) => sum + Math.abs(value - averageValue), 0) / values.length
  return clamp(1 - variance * 4.2, 0, 1)
}

function estimateFaceYaw(faceLandmarks?: Landmark3D[]) {
  const leftEye = faceLandmarks?.[33]
  const rightEye = faceLandmarks?.[263]
  const nose = faceLandmarks?.[1] ?? faceLandmarks?.[4]
  if (!leftEye || !rightEye || !nose) return null
  const eyeDistance = Math.max(Math.abs(rightEye.x - leftEye.x), 1e-5)
  return (nose.x - (leftEye.x + rightEye.x) / 2) / eyeDistance
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

function createEmptyCustomTraining(baseModel: BrowserKnnModel): BrowserKnnCustomTraining {
  const now = new Date().toISOString()
  return {
    version: 1,
    sequenceLength: baseModel.sequenceLength,
    featureSize: baseModel.featureSize,
    flatFeatureSize: baseModel.flatFeatureSize,
    labels: [],
    samples: [],
    sampleLabels: [],
    createdAt: now,
    updatedAt: now,
  }
}

function writeBrowserKnnCustomTraining(payload: BrowserKnnCustomTraining) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(CUSTOM_TRAINING_STORAGE_KEY, JSON.stringify(payload))
}

function isCustomTrainingPayload(payload: BrowserKnnCustomTraining) {
  return (
    payload?.version === 1 &&
    Number.isFinite(payload.sequenceLength) &&
    Number.isFinite(payload.featureSize) &&
    Number.isFinite(payload.flatFeatureSize) &&
    Array.isArray(payload.labels) &&
    Array.isArray(payload.samples) &&
    Array.isArray(payload.sampleLabels) &&
    payload.samples.length === payload.sampleLabels.length
  )
}

function isCustomTrainingCompatible(baseModel: BrowserKnnModel, payload: BrowserKnnCustomTraining) {
  return (
    payload.sequenceLength === baseModel.sequenceLength &&
    payload.featureSize === baseModel.featureSize &&
    payload.flatFeatureSize === baseModel.flatFeatureSize &&
    payload.samples.every((sample) => Array.isArray(sample) && sample.length === baseModel.flatFeatureSize)
  )
}

function uniqueLabels(labels: string[]) {
  return Array.from(new Set(labels.map(normalizeBrowserKnnLabel).filter(Boolean)))
}

function score(scores: Map<string, number>, key: string) {
  return scores.get(key) ?? 0
}

function average(left: number, right: number) {
  return (left + right) / 2
}

function symmetric(left: number, right: number) {
  return clamp(average(left, right) * 0.75 + Math.max(left, right) * 0.25, 0, 1)
}

function mean(items: Required<FaceExpression["scores"]>[], key: keyof Required<FaceExpression["scores"]>) {
  return items.reduce((sum, item) => sum + item[key], 0) / items.length
}

function distance2d(left: number[], right: number[]) {
  return Math.hypot(left[0] - right[0], left[1] - right[1])
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
