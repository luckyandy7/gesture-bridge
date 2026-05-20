import { randomUUID } from "node:crypto"
import { promises as fs } from "node:fs"
import path from "node:path"

type BrowserKnnModel = {
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

type SharedSignSample = {
  id: string
  label: string
  frames: number[][]
  sourceFrameCount?: number
  createdAt: string
  source: "web"
}

type SharedTrainingFile = {
  version: 1
  sequenceLength: number
  featureSize: number
  flatFeatureSize: number
  labels: string[]
  samples: SharedSignSample[]
  createdAt: string
  updatedAt: string
}

export type SharedTrainingPayload = {
  model: BrowserKnnModel
  sharedSampleCount: number
  sharedLabels: string[]
  updatedAt: string | null
}

const BASE_MODEL_PATH = path.join(process.cwd(), "public", "models", "sign_knn.browser.json")
const SHARED_TRAINING_PATH = path.join(process.cwd(), "data", "shared", "sign-text-training.json")

export async function getSharedTrainingPayload(): Promise<SharedTrainingPayload> {
  const baseModel = await readBaseModel()
  const sharedTraining = await readSharedTrainingFile(baseModel)
  return createSharedPayload(baseModel, sharedTraining)
}

export async function addSharedTrainingLabel(label: string): Promise<SharedTrainingPayload> {
  const baseModel = await readBaseModel()
  const sharedTraining = await readSharedTrainingFile(baseModel)
  const normalizedLabel = normalizeTrainingLabel(label)
  if (!normalizedLabel) throw new Error("라벨 이름을 입력하세요.")

  const now = new Date().toISOString()
  const nextTraining: SharedTrainingFile = {
    ...sharedTraining,
    labels: uniqueLabels([...sharedTraining.labels, normalizedLabel]),
    updatedAt: now,
  }
  await writeSharedTrainingFile(nextTraining)
  return createSharedPayload(baseModel, nextTraining)
}

export async function addSharedTrainingSample(label: string, sequence: unknown): Promise<SharedTrainingPayload> {
  const baseModel = await readBaseModel()
  const sharedTraining = await readSharedTrainingFile(baseModel)
  const normalizedLabel = normalizeTrainingLabel(label)
  if (!normalizedLabel) throw new Error("라벨 이름을 입력하세요.")

  const sourceFrames = normalizeTrainingSequence(sequence, baseModel.featureSize)
  const frames = resampleTrainingFrames(sourceFrames, baseModel.sequenceLength)
  const now = new Date().toISOString()
  const nextTraining: SharedTrainingFile = {
    ...sharedTraining,
    labels: uniqueLabels([...sharedTraining.labels, normalizedLabel]),
    samples: [
      ...sharedTraining.samples,
      {
        id: randomUUID(),
        label: normalizedLabel,
        frames,
        sourceFrameCount: sourceFrames.length,
        createdAt: now,
        source: "web",
      },
    ],
    updatedAt: now,
  }
  await writeSharedTrainingFile(nextTraining)
  return createSharedPayload(baseModel, nextTraining)
}

export async function clearSharedTraining(): Promise<SharedTrainingPayload> {
  const baseModel = await readBaseModel()
  const now = new Date().toISOString()
  const nextTraining = createEmptySharedTraining(baseModel, now)
  await writeSharedTrainingFile(nextTraining)
  return createSharedPayload(baseModel, nextTraining)
}

async function readBaseModel() {
  const raw = await fs.readFile(BASE_MODEL_PATH, "utf-8")
  const model = JSON.parse(raw) as BrowserKnnModel
  validateBaseModel(model)
  return model
}

async function readSharedTrainingFile(baseModel: BrowserKnnModel): Promise<SharedTrainingFile> {
  try {
    const raw = await fs.readFile(SHARED_TRAINING_PATH, "utf-8")
    const payload = JSON.parse(raw) as SharedTrainingFile
    if (!isCompatibleSharedTraining(payload, baseModel)) {
      return createEmptySharedTraining(baseModel)
    }
    return {
      ...payload,
      labels: uniqueLabels(payload.labels),
      samples: payload.samples.filter((sample) => isCompatibleSharedSample(sample, baseModel)),
    }
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return createEmptySharedTraining(baseModel)
    }
    throw error
  }
}

async function writeSharedTrainingFile(payload: SharedTrainingFile) {
  await fs.mkdir(path.dirname(SHARED_TRAINING_PATH), { recursive: true })
  const tmpPath = `${SHARED_TRAINING_PATH}.${process.pid}.${Date.now()}.tmp`
  await fs.writeFile(tmpPath, `${JSON.stringify(payload)}\n`, "utf-8")
  await fs.rename(tmpPath, SHARED_TRAINING_PATH)
}

function createSharedPayload(baseModel: BrowserKnnModel, sharedTraining: SharedTrainingFile): SharedTrainingPayload {
  const sharedLabels = uniqueLabels([...sharedTraining.labels, ...sharedTraining.samples.map((sample) => sample.label)])
  const sharedRawSamples = sharedTraining.samples.map((sample) => sample.frames.flat())

  if (!sharedRawSamples.length) {
    const labels = uniqueLabels([...baseModel.labels, ...sharedLabels])
    return {
      model: {
        ...baseModel,
        labels,
        classes: uniqueLabels([...baseModel.classes, ...labels]),
      },
      sharedSampleCount: 0,
      sharedLabels,
      updatedAt: sharedTraining.samples.length || sharedTraining.labels.length ? sharedTraining.updatedAt : null,
    }
  }

  const baseRawSamples = baseModel.samples.map((sample) => unscaleFlatSample(sample, baseModel.scalerMean, baseModel.scalerScale))
  const rawSamples = [...baseRawSamples, ...sharedRawSamples]
  const sampleLabels = [...baseModel.sampleLabels, ...sharedTraining.samples.map((sample) => sample.label)]
  const scaler = fitStandardScaler(rawSamples, baseModel.flatFeatureSize)
  const scaledSamples = rawSamples.map((sample) => scaleFlatSample(sample, scaler.mean, scaler.scale))
  const labels = uniqueLabels([...baseModel.labels, ...sharedLabels, ...sampleLabels])

  return {
    model: {
      ...baseModel,
      modelType: "shared_standard_scaled_distance_knn",
      labels,
      classes: uniqueLabels([...baseModel.classes, ...labels, ...sampleLabels]),
      scalerMean: scaler.mean,
      scalerScale: scaler.scale,
      samples: scaledSamples,
      sampleLabels,
    },
    sharedSampleCount: sharedTraining.samples.length,
    sharedLabels,
    updatedAt: sharedTraining.updatedAt,
  }
}

function fitStandardScaler(samples: number[][], featureSize: number) {
  const count = samples.length
  const mean = Array.from({ length: featureSize }, () => 0)
  const scale = Array.from({ length: featureSize }, () => 1)
  const variance = Array.from({ length: featureSize }, () => 0)
  if (!count) return { mean, scale }

  samples.forEach((sample) => {
    for (let index = 0; index < featureSize; index += 1) {
      mean[index] += safeNumber(sample[index])
    }
  })
  for (let index = 0; index < featureSize; index += 1) {
    mean[index] = roundNumber(mean[index] / count)
  }

  samples.forEach((sample) => {
    for (let index = 0; index < featureSize; index += 1) {
      const delta = safeNumber(sample[index]) - mean[index]
      variance[index] += delta * delta
    }
  })
  for (let index = 0; index < featureSize; index += 1) {
    const std = Math.sqrt(variance[index] / count)
    scale[index] = roundNumber(std > 1e-12 ? std : 1)
  }

  return { mean, scale }
}

function unscaleFlatSample(sample: number[], mean: number[], scale: number[]) {
  return sample.map((value, index) => roundNumber(safeNumber(value) * safeScale(scale[index]) + safeNumber(mean[index])))
}

function scaleFlatSample(sample: number[], mean: number[], scale: number[]) {
  return sample.map((value, index) => roundNumber((safeNumber(value) - safeNumber(mean[index])) / safeScale(scale[index])))
}

function normalizeTrainingSequence(sequence: unknown, featureSize: number) {
  if (!Array.isArray(sequence) || !sequence.length) {
    throw new Error("샘플 프레임이 필요합니다.")
  }

  return sequence.map((frame) => {
    if (!Array.isArray(frame) || frame.length !== featureSize) {
      throw new Error(`샘플 프레임 크기가 다릅니다. ${featureSize}개 특징이 필요합니다.`)
    }
    return frame.map((value) => roundNumber(safeNumber(value)))
  })
}

function resampleTrainingFrames(frames: number[][], targetLength: number) {
  if (frames.length < targetLength) {
    throw new Error(`${targetLength}프레임 이상이 필요합니다.`)
  }
  if (frames.length === targetLength) return frames
  if (targetLength <= 1) return [frames[0]]

  const lastSourceIndex = frames.length - 1
  const lastTargetIndex = targetLength - 1
  return Array.from({ length: targetLength }, (_item, targetIndex) => {
    const sourcePosition = (targetIndex / lastTargetIndex) * lastSourceIndex
    const leftIndex = Math.floor(sourcePosition)
    const rightIndex = Math.min(lastSourceIndex, Math.ceil(sourcePosition))
    const mix = sourcePosition - leftIndex
    if (leftIndex === rightIndex) return frames[leftIndex]
    return frames[leftIndex].map((value, featureIndex) => roundNumber(value * (1 - mix) + frames[rightIndex][featureIndex] * mix))
  })
}

function createEmptySharedTraining(baseModel: BrowserKnnModel, timestamp = new Date().toISOString()): SharedTrainingFile {
  return {
    version: 1,
    sequenceLength: baseModel.sequenceLength,
    featureSize: baseModel.featureSize,
    flatFeatureSize: baseModel.flatFeatureSize,
    labels: [],
    samples: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

function validateBaseModel(model: BrowserKnnModel) {
  if (
    !model ||
    !Array.isArray(model.labels) ||
    !Array.isArray(model.samples) ||
    !Array.isArray(model.sampleLabels) ||
    !Array.isArray(model.scalerMean) ||
    !Array.isArray(model.scalerScale) ||
    model.samples.length !== model.sampleLabels.length ||
    model.scalerMean.length !== model.flatFeatureSize ||
    model.scalerScale.length !== model.flatFeatureSize
  ) {
    throw new Error("브라우저 KNN 기본 모델 형식이 올바르지 않습니다.")
  }
}

function isCompatibleSharedTraining(payload: SharedTrainingFile, baseModel: BrowserKnnModel) {
  return (
    payload?.version === 1 &&
    payload.sequenceLength === baseModel.sequenceLength &&
    payload.featureSize === baseModel.featureSize &&
    payload.flatFeatureSize === baseModel.flatFeatureSize &&
    Array.isArray(payload.labels) &&
    Array.isArray(payload.samples)
  )
}

function isCompatibleSharedSample(sample: SharedSignSample, baseModel: BrowserKnnModel) {
  return (
    Boolean(normalizeTrainingLabel(sample?.label ?? "")) &&
    Array.isArray(sample.frames) &&
    sample.frames.length === baseModel.sequenceLength &&
    sample.frames.every((frame) => Array.isArray(frame) && frame.length === baseModel.featureSize)
  )
}

function normalizeTrainingLabel(value: string) {
  return value.trim().replace(/\s+/g, "_").replace(/^_+|_+$/g, "")
}

function uniqueLabels(labels: string[]) {
  return Array.from(new Set(labels.map(normalizeTrainingLabel).filter(Boolean)))
}

function safeScale(value: number) {
  return Math.abs(safeNumber(value)) > 1e-12 ? safeNumber(value) : 1
}

function safeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function roundNumber(value: number) {
  return Math.round(safeNumber(value) * 1_000_000) / 1_000_000
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error
}
