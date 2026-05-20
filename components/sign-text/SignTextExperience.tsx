"use client"

import Image from "next/image"
import Link from "next/link"
import type React from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import {
  ArrowLeft,
  AudioLines,
  BadgeCheck,
  Camera,
  Captions,
  Check,
  Database,
  Hand,
  Mic2,
  Pause,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  Undo2,
} from "lucide-react"
import { SignTextBackdropFallback } from "@/components/sign-text/SignTextBackdropFallback"
import { CustomCursor } from "@/components/custom-cursor"
import { GrainOverlay } from "@/components/grain-overlay"
import {
  addSharedBrowserKnnCustomLabel,
  addSharedBrowserKnnTrainingSample,
  clearSharedBrowserKnnTraining,
  flattenHolisticFrameFeatures,
  getBrowserKnnLabelCounts,
  hasEnoughHolisticSignal,
  createFaceExpressionTracker,
  loadSharedBrowserKnnModel,
  normalizeBrowserKnnLabel,
  predictSignSequence,
  type BrowserKnnModel,
  type FaceExpression,
  type HolisticFeatureInput,
  type Landmark3D,
  type SignPrediction,
} from "@/lib/sign-text/browser-model"
import {
  loadSentenceMemory,
  refineSentenceLikeLlm,
  translateTokens,
  type SentenceMemoryEntry,
  type TokenRecord,
} from "@/lib/sign-text/sentence"

type HolisticLandmarkerLike = {
  detectForVideo: (video: HTMLVideoElement, timestamp: number) => HolisticResultLike
  close?: () => void
}

type HolisticResultLike = HolisticFeatureInput & {
  faceLandmarks?: Landmark3D[][]
  faceBlendshapes?: Array<{
    categories?: Array<{ categoryName?: string; displayName?: string; score?: number }>
  }>
}

type OverlayPointMapper = (point: Landmark3D) => { x: number; y: number }

type FinalizedSentence = {
  id: number
  text: string
  score: number
  source: string
  tokens: TokenRecord[]
}

type ServerRefineResult = {
  sentence: string
  score: number
  source: string
  usedLlm: boolean
  model?: string
  note?: string
}

const HAND_CONNECTIONS = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [0, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [0, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [0, 17],
  [17, 18],
  [18, 19],
  [19, 20],
] as const

const POSE_CONNECTIONS = [
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
] as const

const SAMPLE_TOKENS = ["안녕하세요", "감사합니다", "네", "아니요"]
const HOLISTIC_TRACKING_INTERVAL_MS = 1000 / 24
const SIGN_UI_STATE_INTERVAL_MS = 1000 / 10
const FINISH_PROGRESS_INTERVAL_MS = 1000 / 15
const TRAINING_CAPTURE_FRAMES = 45
const FINALIZE_RECENT_PREDICTION_WINDOW_MS = 2600
const FINALIZE_RECENT_PREDICTION_MIN_VOTES = 2
const RECENT_PREDICTION_HISTORY_LIMIT = 24
const FINALIZE_PREDICTION_MIN_CONFIDENCE = 0.45
const STABLE_PREDICTION_MIN_CONFIDENCE = 0.5
const STABLE_PREDICTION_WINDOW_MS = 1150
const STABLE_PREDICTION_REQUIRED_MATCHES = 4
const STABLE_PREDICTION_HISTORY_LIMIT = 10

const EMPTY_EXPRESSION: FaceExpression = {
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

type RecentSignPrediction = {
  prediction: SignPrediction
  expression: FaceExpression
  timestamp: number
}

export function SignTextExperience() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const landmarkerRef = useRef<HolisticLandmarkerLike | null>(null)
  const baseModelRef = useRef<BrowserKnnModel | null>(null)
  const modelRef = useRef<BrowserKnnModel | null>(null)
  const memoryRef = useRef<SentenceMemoryEntry[]>([])
  const sequenceRef = useRef<number[][]>([])
  const predictionHistoryRef = useRef<Array<{ label: string; confidence: number; timestamp: number }>>([])
  const recentPredictionsRef = useRef<RecentSignPrediction[]>([])
  const tokensRef = useRef<TokenRecord[]>([])
  const expressionRef = useRef<FaceExpression>(EMPTY_EXPRESSION)
  const expressionTrackerRef = useRef(createFaceExpressionTracker())
  const pendingTrainingLabelRef = useRef("")
  const trainingSequenceRef = useRef<number[][]>([])
  const sharedTrainingCountRef = useRef(0)
  const trainingSaveInFlightRef = useRef(false)
  const frameIndexRef = useRef(0)
  const lastHolisticDetectAtRef = useRef(0)
  const lastExpressionUiAtRef = useRef(0)
  const lastPredictionUiAtRef = useRef(0)
  const lastFinishUiAtRef = useRef(0)
  const lastTrainingUiAtRef = useRef(0)
  const finishProgressRef = useRef(0)
  const lastEmitRef = useRef<Record<string, number>>({})
  const finishHoldStartRef = useRef<number | null>(null)
  const finishArmedRef = useRef(true)
  const finalizingRef = useRef(false)
  const finalizedIdRef = useRef(1)
  const tokenIdRef = useRef(1)
  const mountedRef = useRef(false)

  const [isLoaded, setIsLoaded] = useState(false)
  const [cameraState, setCameraState] = useState("카메라 대기")
  const [modelState, setModelState] = useState("모델 대기")
  const [cameraActive, setCameraActive] = useState(false)
  const [voiceOutput, setVoiceOutput] = useState(true)
  const [llmState, setLlmState] = useState("LLM 대기")
  const [tokens, setTokens] = useState<TokenRecord[]>([])
  const [currentPrediction, setCurrentPrediction] = useState<SignPrediction | null>(null)
  const [expression, setExpression] = useState<FaceExpression>(EMPTY_EXPRESSION)
  const [draftSentence, setDraftSentence] = useState("-")
  const [finalized, setFinalized] = useState<FinalizedSentence[]>([])
  const [finishProgress, setFinishProgress] = useState(0)
  const [lastSpoken, setLastSpoken] = useState("")
  const [availableLabels, setAvailableLabels] = useState<string[]>(SAMPLE_TOKENS)
  const [labelCounts, setLabelCounts] = useState<Array<{ label: string; count: number }>>([])
  const [trainingLabel, setTrainingLabel] = useState("")
  const [selectedTrainingLabel, setSelectedTrainingLabel] = useState("")
  const [trainingMessage, setTrainingMessage] = useState("라벨과 샘플은 서버 공유 학습 데이터로 저장되어 다른 브라우저에서도 같이 사용됩니다.")
  const [sharedTrainingCount, setSharedTrainingCount] = useState(0)

  const syncModelUi = useCallback((model: BrowserKnnModel, message?: string, sharedSampleCount = sharedTrainingCountRef.current) => {
    const counts = getBrowserKnnLabelCounts(model)
    setAvailableLabels(model.labels)
    setLabelCounts(counts)
    setSharedTrainingCount(sharedSampleCount)
    setSelectedTrainingLabel((previous) => (previous && model.labels.includes(previous) ? previous : model.labels[0] ?? ""))
    setModelState(`공유 KNN 준비 (${model.labels.length} labels · ${model.samples.length} samples)`)
    if (message) setTrainingMessage(message)
  }, [])

  const preloadResources = useCallback(async () => {
    try {
      setModelState("공유 학습 모델 로딩")
      const [training, memory] = await Promise.all([loadSharedBrowserKnnModel(), loadSentenceMemory()])
      baseModelRef.current = training.model
      modelRef.current = training.model
      memoryRef.current = memory
      sharedTrainingCountRef.current = training.sharedSampleCount
      syncModelUi(training.model, undefined, training.sharedSampleCount)
    } catch (error) {
      console.error(error)
      setModelState("웹 모델 로딩 실패")
    }
  }, [syncModelUi])

  useEffect(() => {
    const expressionTracker = expressionTrackerRef.current
    mountedRef.current = true
    setIsLoaded(true)
    void preloadResources()
    return () => {
      mountedRef.current = false
      streamRef.current?.getTracks().forEach((track) => track.stop())
      landmarkerRef.current?.close?.()
      expressionTracker.reset()
      window.speechSynthesis?.cancel()
    }
  }, [preloadResources])

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraState("브라우저 카메라 미지원")
      return
    }

    try {
      setCameraState("카메라 권한 요청")
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720, facingMode: "user" },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }

      setCameraActive(true)
      setCameraState("Holistic 모델 로딩")
      expressionTrackerRef.current.reset()

      const vision = await import("@mediapipe/tasks-vision")
      const fileset = await vision.FilesetResolver.forVisionTasks("/mediapipe/wasm")
      landmarkerRef.current = await vision.HolisticLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: "/models/holistic_landmarker.task",
          delegate: "CPU",
        },
        runningMode: "VIDEO",
        outputFaceBlendshapes: true,
        minFaceDetectionConfidence: 0.5,
        minFacePresenceConfidence: 0.5,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minHandLandmarksConfidence: 0.5,
      })
      setCameraState("손+얼굴 추적 중")
    } catch (error) {
      console.error(error)
      setCameraState("카메라 또는 Holistic 시작 실패")
      setCameraActive(Boolean(streamRef.current))
    }
  }, [])

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    landmarkerRef.current?.close?.()
    landmarkerRef.current = null
    sequenceRef.current = []
    predictionHistoryRef.current = []
    recentPredictionsRef.current = []
    pendingTrainingLabelRef.current = ""
    trainingSequenceRef.current = []
    trainingSaveInFlightRef.current = false
    expressionTrackerRef.current.reset()
    lastHolisticDetectAtRef.current = 0
    lastExpressionUiAtRef.current = 0
    lastPredictionUiAtRef.current = 0
    lastFinishUiAtRef.current = 0
    lastTrainingUiAtRef.current = 0
    finishProgressRef.current = 0
    setCameraActive(false)
    setCameraState("카메라 대기")
    setCurrentPrediction(null)
    setFinishProgress(0)
  }, [])

  const speak = useCallback(
    (sentence: string) => {
      if (!voiceOutput || !("speechSynthesis" in window) || sentence === "-") return
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(sentence)
      utterance.lang = "ko-KR"
      utterance.rate = 0.92
      utterance.pitch = 1
      window.speechSynthesis.speak(utterance)
      setLastSpoken(sentence)
    },
    [voiceOutput],
  )

  const updateDraftSentence = useCallback((nextTokens: TokenRecord[], nextExpression: FaceExpression) => {
    const labels = nextTokens.map((token) => token.label)
    const candidate = translateTokens(labels, memoryRef.current)
    const refined = refineSentenceLikeLlm(nextTokens, candidate, nextExpression)
    setDraftSentence(refined.sentence)
    return refined
  }, [])

  const emitToken = useCallback(
    (label: string, confidence: number, sourceExpression = expressionRef.current) => {
      const now = performance.now()
      const lastEmittedAt = lastEmitRef.current[label]
      if (lastEmittedAt && now - lastEmittedAt < 1450) return
      const previous = tokensRef.current.at(-1)
      if (previous?.label === label && now - previous.timestamp < 2600) return

      lastEmitRef.current[label] = now
      const nextToken: TokenRecord = {
        id: tokenIdRef.current++,
        label,
        confidence,
        timestamp: now,
        expression: sourceExpression,
      }
      const nextTokens = [...tokensRef.current, nextToken].slice(-20)
      tokensRef.current = nextTokens
      setTokens(nextTokens)
      updateDraftSentence(nextTokens, sourceExpression)
    },
    [updateDraftSentence],
  )

  const refineWithServer = useCallback(
    async (currentTokens: TokenRecord[], localRefined: ReturnType<typeof refineSentenceLikeLlm>) => {
      try {
        const response = await fetch("/api/sign-text/refine", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tokens: currentTokens.map((token) => ({
              label: token.label,
              confidence: token.confidence,
              expression: {
                label: token.expression.label,
                tone: token.expression.tone,
                confidence: token.expression.confidence,
              },
            })),
            expression: expressionRef.current,
            localSentence: localRefined.sentence,
            localScore: localRefined.score,
            localSource: localRefined.source,
          }),
        })
        if (!response.ok) throw new Error(`refine failed ${response.status}`)
        return (await response.json()) as ServerRefineResult
      } catch (error) {
        console.error(error)
        return {
          sentence: localRefined.sentence,
          score: localRefined.score,
          source: `${localRefined.source}:client-fallback`,
          usedLlm: false,
          note: "문장 정리 API 호출 실패로 로컬 보정 결과를 사용했습니다.",
        }
      }
    },
    [],
  )

  const finalizeSentence = useCallback(
    async (reason: "gesture" | "manual" | "sample" = "manual") => {
      if (finalizingRef.current) return
      let currentTokens = tokensRef.current
      let sourceReason: string = reason
      if (!currentTokens.length) {
        const recentDecision = aggregateRecentPredictions(recentPredictionsRef.current, performance.now(), FINALIZE_RECENT_PREDICTION_WINDOW_MS)
        if (recentDecision && recentDecision.votes >= FINALIZE_RECENT_PREDICTION_MIN_VOTES) {
          const latestToken: TokenRecord = {
            id: tokenIdRef.current++,
            label: recentDecision.label,
            confidence: recentDecision.confidence,
            timestamp: performance.now(),
            expression: recentDecision.expression,
          }
          currentTokens = [latestToken]
          tokensRef.current = currentTokens
          setTokens(currentTokens)
          sourceReason = `${reason}:interval`
        } else {
          setLlmState("인식된 단어 없음")
          setDraftSentence("문장으로 만들 단어가 없습니다.")
          return
        }
      }
      finalizingRef.current = true
      setLlmState("LLM 문장 정리 중")
      try {
        const sentenceExpression = currentTokens.at(-1)?.expression ?? expressionRef.current
        const localRefined = updateDraftSentence(currentTokens, sentenceExpression)
        const refined = await refineWithServer(currentTokens, localRefined)
        const sentence: FinalizedSentence = {
          id: finalizedIdRef.current++,
          text: refined.sentence,
          score: refined.score,
          source: `${sourceReason}:${refined.source}`,
          tokens: currentTokens,
        }
        setFinalized((previous) => [sentence, ...previous].slice(0, 5))
        tokensRef.current = []
        recentPredictionsRef.current = []
        setTokens([])
        setDraftSentence(sentence.text)
        setFinishProgress(0)
        speak(sentence.text)
        setLlmState(refined.usedLlm ? `LLM 완료 (${refined.model ?? "OpenAI"})` : "로컬 문장 보정")
      } catch (error) {
        console.error(error)
        setLlmState("문장 정리 실패")
      } finally {
        finalizingRef.current = false
      }
    },
    [refineWithServer, speak, updateDraftSentence],
  )

  const backspaceToken = useCallback(() => {
    const nextTokens = tokensRef.current.slice(0, -1)
    tokensRef.current = nextTokens
    setTokens(nextTokens)
    if (nextTokens.length) {
      updateDraftSentence(nextTokens, expressionRef.current)
    } else {
      setDraftSentence("-")
    }
  }, [updateDraftSentence])

  const clearAll = useCallback(() => {
    tokensRef.current = []
    sequenceRef.current = []
    predictionHistoryRef.current = []
    recentPredictionsRef.current = []
    pendingTrainingLabelRef.current = ""
    trainingSequenceRef.current = []
    trainingSaveInFlightRef.current = false
    setTokens([])
    setCurrentPrediction(null)
    setDraftSentence("-")
    setFinishProgress(0)
    setLlmState("LLM 대기")
  }, [])

  const addTrainingLabel = useCallback(async () => {
    if (!modelRef.current) {
      setTrainingMessage("기본 모델이 아직 로딩되지 않았습니다.")
      return
    }

    try {
      const label = normalizeBrowserKnnLabel(trainingLabel)
      const training = await addSharedBrowserKnnCustomLabel(label)
      baseModelRef.current = training.model
      modelRef.current = training.model
      sharedTrainingCountRef.current = training.sharedSampleCount
      setTrainingLabel("")
      setSelectedTrainingLabel(label)
      predictionHistoryRef.current = []
      syncModelUi(training.model, `"${label}" 공유 라벨을 추가했습니다. 같은 동작을 여러 번 학습하면 안정도가 올라갑니다.`, training.sharedSampleCount)
    } catch (error) {
      setTrainingMessage(error instanceof Error ? error.message : "라벨 추가에 실패했습니다.")
    }
  }, [syncModelUi, trainingLabel])

  const saveTrainingSample = useCallback(
    async (label: string, sequence: number[][]) => {
      const model = modelRef.current
      if (!model) {
        setTrainingMessage("기본 모델이 아직 로딩되지 않았습니다.")
        return false
      }
      if (trainingSaveInFlightRef.current) return false
      const requiredFrames = Math.max(TRAINING_CAPTURE_FRAMES, model.sequenceLength)
      if (sequence.length < requiredFrames) {
        setTrainingMessage(`"${label}" 샘플 수집 중... ${sequence.length}/${requiredFrames}프레임`)
        return false
      }

      trainingSaveInFlightRef.current = true
      setTrainingMessage(`"${label}" 공유 샘플 저장 중...`)
      try {
        const training = await addSharedBrowserKnnTrainingSample(label, sequence)
        baseModelRef.current = training.model
        modelRef.current = training.model
        predictionHistoryRef.current = []
        pendingTrainingLabelRef.current = ""
        trainingSequenceRef.current = []
        sharedTrainingCountRef.current = training.sharedSampleCount
        const nextCount = getBrowserKnnLabelCounts(training.model).find((item) => item.label === label)?.count ?? 0
        syncModelUi(training.model, `"${label}" 공유 샘플을 저장했습니다. 현재 이 라벨 샘플 ${nextCount}개입니다.`, training.sharedSampleCount)
        return true
      } catch (error) {
        pendingTrainingLabelRef.current = ""
        trainingSequenceRef.current = []
        setTrainingMessage(error instanceof Error ? error.message : "샘플 학습에 실패했습니다.")
        return false
      } finally {
        trainingSaveInFlightRef.current = false
      }
    },
    [syncModelUi],
  )

  const captureTrainingSample = useCallback(() => {
    const baseModel = baseModelRef.current
    const label = normalizeBrowserKnnLabel(selectedTrainingLabel)
    if (!baseModel) {
      setTrainingMessage("기본 모델이 아직 로딩되지 않았습니다.")
      return
    }
    if (!label) {
      setTrainingMessage("학습할 라벨을 먼저 선택하세요.")
      return
    }
    if (!cameraActive) {
      setTrainingMessage("웹 실행을 켠 뒤 손동작을 카메라에 보이면서 샘플을 학습하세요.")
      return
    }
    pendingTrainingLabelRef.current = label
    trainingSequenceRef.current = []
    lastTrainingUiAtRef.current = 0
    setTrainingMessage(`"${label}" 새 샘플 수집 시작... 0/${Math.max(TRAINING_CAPTURE_FRAMES, baseModel.sequenceLength)}프레임`)
  }, [cameraActive, selectedTrainingLabel])

  const resetCustomTraining = useCallback(async () => {
    if (!modelRef.current) {
      setTrainingMessage("기본 모델이 아직 로딩되지 않았습니다.")
      return
    }

    try {
      const training = await clearSharedBrowserKnnTraining()
      baseModelRef.current = training.model
      modelRef.current = training.model
      sharedTrainingCountRef.current = training.sharedSampleCount
      sequenceRef.current = []
      predictionHistoryRef.current = []
      recentPredictionsRef.current = []
      pendingTrainingLabelRef.current = ""
      trainingSequenceRef.current = []
      syncModelUi(training.model, "공유 학습 라벨과 샘플을 초기화했습니다.", training.sharedSampleCount)
    } catch (error) {
      setTrainingMessage(error instanceof Error ? error.message : "공유 학습 초기화에 실패했습니다.")
    }
  }, [syncModelUi])

  const updateStablePrediction = useCallback((prediction: SignPrediction, now: number) => {
    if (prediction.confidence < STABLE_PREDICTION_MIN_CONFIDENCE || prediction.label === "대기" || prediction.label === "버퍼링") {
      predictionHistoryRef.current = predictionHistoryRef.current.filter((item) => now - item.timestamp < STABLE_PREDICTION_WINDOW_MS)
      return null
    }

    predictionHistoryRef.current = [
      ...predictionHistoryRef.current.filter((item) => now - item.timestamp < STABLE_PREDICTION_WINDOW_MS),
      { label: prediction.label, confidence: prediction.confidence, timestamp: now },
    ].slice(-STABLE_PREDICTION_HISTORY_LIMIT)

    const matching = predictionHistoryRef.current.filter((item) => item.label === prediction.label)
    if (matching.length >= STABLE_PREDICTION_REQUIRED_MATCHES) {
      return {
        label: prediction.label,
        confidence: matching.reduce((sum, item) => sum + item.confidence, 0) / matching.length,
      }
    }
    return null
  }, [])

  const recordSignPrediction = useCallback((prediction: SignPrediction, nextExpression: FaceExpression, now: number) => {
    if (!isFinalizablePrediction(prediction)) return
    recentPredictionsRef.current = [
      ...recentPredictionsRef.current.filter((item) => now - item.timestamp <= FINALIZE_RECENT_PREDICTION_WINDOW_MS),
      { prediction, expression: nextExpression, timestamp: now },
    ].slice(-RECENT_PREDICTION_HISTORY_LIMIT)
  }, [])

  const updateFinishSignal = useCallback(
    (result: HolisticResultLike, now: number) => {
      const finishActive = detectFinishSignal(result)
      if (!finishActive) {
        finishHoldStartRef.current = null
        finishArmedRef.current = true
        if (finishProgressRef.current !== 0) {
          finishProgressRef.current = 0
          setFinishProgress(0)
        }
        return
      }

      if (!finishHoldStartRef.current) finishHoldStartRef.current = now
      const progress = Math.min(1, (now - finishHoldStartRef.current) / 1050)
      if (now - lastFinishUiAtRef.current >= FINISH_PROGRESS_INTERVAL_MS || progress >= 1) {
        lastFinishUiAtRef.current = now
        finishProgressRef.current = progress
        setFinishProgress(progress)
      }
      if (progress >= 1 && finishArmedRef.current) {
        finishArmedRef.current = false
        void finalizeSentence("gesture")
      }
    },
    [finalizeSentence],
  )

  useEffect(() => {
    if (!cameraActive) {
      const canvas = overlayCanvasRef.current
      const context = canvas?.getContext("2d")
      if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height)
      return
    }

    let raf = 0

    const loop = () => {
      if (!mountedRef.current) return
      const video = videoRef.current
      const landmarker = landmarkerRef.current
      const model = modelRef.current
      const now = performance.now()

      if (video && landmarker && model && video.readyState >= 2) {
        if (now - lastHolisticDetectAtRef.current < HOLISTIC_TRACKING_INTERVAL_MS) {
          raf = requestAnimationFrame(loop)
          return
        }
        lastHolisticDetectAtRef.current = now

        try {
          const result = landmarker.detectForVideo(video, now)
          drawOverlay(result)
          const nextExpression = expressionTrackerRef.current.read({
            blendshapes: result.faceBlendshapes,
            faceLandmarks: result.faceLandmarks?.[0],
            timestamp: now,
          })
          const previousExpression = expressionRef.current
          expressionRef.current = nextExpression
          if (nextExpression.label !== previousExpression.label || now - lastExpressionUiAtRef.current >= SIGN_UI_STATE_INTERVAL_MS) {
            lastExpressionUiAtRef.current = now
            setExpression(nextExpression)
          }

          const hasSignal = hasEnoughHolisticSignal(result)
          if (hasSignal) {
            const frameFeatures = flattenHolisticFrameFeatures(result)
            sequenceRef.current.push(frameFeatures)
            if (sequenceRef.current.length > model.sequenceLength) {
              sequenceRef.current = sequenceRef.current.slice(-model.sequenceLength)
            }
            const pendingTrainingLabel = pendingTrainingLabelRef.current
            if (pendingTrainingLabel && !trainingSaveInFlightRef.current) {
              const requiredTrainingFrames = Math.max(TRAINING_CAPTURE_FRAMES, model.sequenceLength)
              if (trainingSequenceRef.current.length < requiredTrainingFrames) {
                trainingSequenceRef.current = [...trainingSequenceRef.current, frameFeatures]
                const trainingFrameCount = trainingSequenceRef.current.length
                lastTrainingUiAtRef.current = now
                setTrainingMessage(`"${pendingTrainingLabel}" 샘플 수집 중... ${trainingFrameCount}/${requiredTrainingFrames}프레임`)
              }
              if (trainingSequenceRef.current.length >= requiredTrainingFrames) {
                void saveTrainingSample(pendingTrainingLabel, trainingSequenceRef.current.slice(-requiredTrainingFrames))
              }
            }
          } else {
            sequenceRef.current = []
            predictionHistoryRef.current = []
            if (pendingTrainingLabelRef.current && now - lastTrainingUiAtRef.current >= 500) {
              lastTrainingUiAtRef.current = now
              setTrainingMessage(`손이 잡히지 않습니다. 현재 ${trainingSequenceRef.current.length}/${Math.max(TRAINING_CAPTURE_FRAMES, model.sequenceLength)}프레임입니다.`)
            }
          }

          if (sequenceRef.current.length === model.sequenceLength) {
            frameIndexRef.current += 1
            if (frameIndexRef.current % 4 === 0) {
              const prediction = applyExpressionContext(predictSignSequence(model, sequenceRef.current), nextExpression)
              recordSignPrediction(prediction, nextExpression, now)
              lastPredictionUiAtRef.current = now
              setCurrentPrediction(prediction)
              const stable = updateStablePrediction(prediction, now)
              if (stable) emitToken(stable.label, stable.confidence, nextExpression)
            }
          } else if (now - lastPredictionUiAtRef.current >= SIGN_UI_STATE_INTERVAL_MS) {
            lastPredictionUiAtRef.current = now
            setCurrentPrediction({
              label: hasSignal ? "버퍼링" : "대기",
              confidence: model.sequenceLength ? sequenceRef.current.length / model.sequenceLength : 0,
              alternatives: [],
            })
          }

          updateFinishSignal(result, now)
        } catch (error) {
          console.error(error)
          setCameraState("추적 재시도 중")
        }
      } else {
        clearOverlay()
      }

      raf = requestAnimationFrame(loop)
    }

    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [cameraActive, emitToken, recordSignPrediction, saveTrainingSample, updateFinishSignal, updateStablePrediction])

  const drawOverlay = (result: HolisticResultLike) => {
    const canvas = overlayCanvasRef.current
    const context = canvas?.getContext("2d")
    const video = videoRef.current
    if (!canvas || !context || !video) return

    resizeCanvas(canvas)
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    const mapPoint = createOverlayPointMapper(video, width, height)
    context.clearRect(0, 0, width, height)
    context.save()
    context.lineCap = "round"
    context.lineJoin = "round"

    drawPose(context, result.poseLandmarks?.[0] ?? [], mapPoint)
    drawHand(context, result.leftHandLandmarks?.[0] ?? [], mapPoint, "#55e6a5")
    drawHand(context, result.rightHandLandmarks?.[0] ?? [], mapPoint, "#58a6ff")
    drawFace(context, result.faceLandmarks?.[0] ?? [], mapPoint)
    context.restore()
  }

  const clearOverlay = () => {
    const canvas = overlayCanvasRef.current
    const context = canvas?.getContext("2d")
    if (!canvas || !context) return
    context.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight)
  }

  const currentPercent = Math.round((currentPrediction?.confidence ?? 0) * 100)
  const expressionPercent = Math.round(expression.confidence * 100)

  return (
    <main className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <CustomCursor />
      <GrainOverlay />

      <div className={`fixed inset-0 z-0 transition-opacity duration-700 ${isLoaded ? "opacity-100" : "opacity-0"}`} style={{ contain: "strict" }}>
        <SignTextBackdropFallback />
      </div>

      <section className="relative z-10 flex min-h-screen flex-col px-4 py-4 md:px-6 lg:px-8">
        <header className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 border-b border-foreground/10 pb-4">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/"
              prefetch={false}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-foreground/12 bg-foreground/8 text-foreground/80 backdrop-blur-md transition hover:bg-foreground/14 hover:text-foreground"
              aria-label="처음 화면으로 돌아가기"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-foreground/12 bg-foreground/10 backdrop-blur-md">
              <Image
                src="/brand/mode-sign-sentence-512.png"
                alt=""
                width={30}
                height={30}
                priority
                className="h-7 w-7 object-contain drop-shadow-[0_0_10px_rgba(34,211,238,0.5)]"
              />
            </div>
            <div className="min-w-0">
              <h1 className="truncate font-sans text-xl font-light tracking-tight md:text-2xl">수화 텍스트</h1>
              <p className="truncate text-xs text-foreground/62 md:text-sm">손, 얼굴 표정, 종료 신호를 한 화면에서 처리하는 웹 실행 모드</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ControlButton icon={cameraActive ? Pause : Camera} label={cameraActive ? "카메라 끄기" : "웹 실행"} onClick={cameraActive ? stopCamera : startCamera} active={cameraActive} />
            <ControlButton icon={voiceOutput ? AudioLines : Mic2} label={voiceOutput ? "보이스 켜짐" : "보이스 꺼짐"} onClick={() => setVoiceOutput((value) => !value)} active={voiceOutput} />
            <ControlButton icon={Check} label="문장 끝" onClick={() => finalizeSentence("manual")} />
            <ControlButton icon={RotateCcw} label="초기화" onClick={clearAll} />
          </div>
        </header>

        <div className="mx-auto grid w-full max-w-7xl min-h-0 flex-1 gap-4 py-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section className="relative min-h-[650px] overflow-hidden rounded-lg border border-foreground/12 bg-black shadow-2xl shadow-black/30">
            <video
              ref={videoRef}
              className={`absolute inset-0 z-0 h-full w-full scale-x-[-1] object-cover transition-opacity duration-500 ${cameraActive ? "opacity-100" : "opacity-0"}`}
              autoPlay
              playsInline
              muted
            />
            {!cameraActive ? (
              <div className="absolute inset-0 z-0 overflow-hidden bg-[radial-gradient(circle_at_28%_22%,rgba(18,117,216,0.24),transparent_30%),radial-gradient(circle_at_76%_70%,rgba(225,145,54,0.18),transparent_32%),linear-gradient(135deg,#030611,#08101f)]">
                <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.055)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.045)_1px,transparent_1px)] bg-[size:62px_62px] opacity-20" />
                <div className="absolute left-1/2 top-1/2 grid h-28 w-28 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-lg border border-foreground/10 bg-background/28 backdrop-blur-xl">
                  <Image src="/brand/mode-sign-sentence-512.png" alt="" width={72} height={72} priority className="h-16 w-16 object-contain opacity-82" />
                </div>
                <div className="absolute inset-0 bg-black/30" />
              </div>
            ) : null}
            <canvas ref={overlayCanvasRef} className="pointer-events-none absolute inset-0 z-20 h-full w-full" />

            <div className="absolute left-4 right-4 top-4 z-40 flex flex-wrap items-start justify-between gap-3">
              <div className="rounded-lg border border-foreground/10 bg-background/42 px-4 py-3 backdrop-blur-xl">
                <p className="text-xs text-foreground/48">실시간 예측</p>
                <div className="mt-1 flex items-end gap-3">
                  <p className="text-3xl font-light tracking-tight">{currentPrediction?.label ?? "대기"}</p>
                  <p className="pb-1 font-mono text-sm text-foreground/64">{currentPercent}%</p>
                </div>
                <ConfidenceBar value={currentPrediction?.confidence ?? 0} />
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                <StageChip icon={Camera} label={cameraState} />
                <StageChip icon={BadgeCheck} label={modelState} />
                <StageChip icon={Sparkles} label={llmState} />
                <StageChip icon={Sparkles} label={`${expression.label} ${expressionPercent}%`} />
              </div>
            </div>

            <div className="absolute bottom-0 left-0 right-0 z-50 border-t border-foreground/10 bg-background/62 p-4 backdrop-blur-2xl">
              <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-foreground/48">누적 단어</p>
                  <div className="mt-2 flex min-h-11 flex-wrap items-center gap-2">
                    {tokens.length ? (
                      tokens.map((token) => (
                        <span key={token.id} className="inline-flex items-center gap-2 rounded-lg border border-foreground/12 bg-foreground/10 px-3 py-2">
                          <span className="text-sm font-semibold">{token.label}</span>
                          <span className="font-mono text-[11px] text-foreground/56">{Math.round(token.confidence * 100)}%</span>
                        </span>
                      ))
                    ) : (
                      <span className="text-sm text-foreground/54">카메라 앞에서 단어 수화를 시작하면 여기에 표시됩니다.</span>
                    )}
                  </div>
                </div>

                <div className="min-w-0 md:w-[390px]">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-foreground/48">{tokens.length || draftSentence === "-" ? "문장 후보" : "완성 문장"}</p>
                    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-foreground/10">
                      <div className="h-full bg-foreground transition-all duration-200" style={{ width: `${finishProgress * 100}%` }} />
                    </div>
                  </div>
                  <p className="mt-2 max-h-20 overflow-y-auto break-keep text-lg font-light leading-snug tracking-tight text-foreground md:text-2xl">{draftSentence}</p>
                </div>
              </div>
            </div>
          </section>

          <aside className="grid min-h-0 gap-4 lg:grid-rows-[auto_auto_minmax(0,1fr)_auto]">
            <Panel>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs text-foreground/48">상태</p>
                  <h2 className="mt-1 text-2xl font-light tracking-tight">손 + 표정 반영</h2>
                </div>
                <Hand className="h-7 w-7 text-foreground/74" />
              </div>
              <div className="mt-5 grid gap-3">
                <Metric label="얼굴 표정" value={expression.label} percent={expression.confidence} />
                <Metric label="웃음" value={`${Math.round(expression.scores.smile * 100)}%`} percent={expression.scores.smile} />
                <Metric label="질문" value={`${Math.round(expression.scores.question * 100)}%`} percent={expression.scores.question} />
                <Metric label="강조" value={`${Math.round(expression.scores.emphasis * 100)}%`} percent={expression.scores.emphasis} />
                <Metric label="부정" value={`${Math.round(expression.scores.negative * 100)}%`} percent={expression.scores.negative} />
                <Metric label="고개 좌우" value={`${Math.round((expression.scores.headShake ?? 0) * 100)}%`} percent={expression.scores.headShake ?? 0} />
                <Metric label="안정도" value={`${Math.round((expression.scores.stability ?? 0) * 100)}%`} percent={expression.scores.stability ?? 0} />
              </div>
            </Panel>

            <Panel>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold">빠른 테스트</h2>
                <Captions className="h-4 w-4 text-foreground/54" />
              </div>
              <div className="grid max-h-36 grid-cols-2 gap-2 overflow-y-auto pr-1">
                {availableLabels.map((sample) => (
                  <button
                    key={sample}
                    onClick={() => emitToken(sample, 0.96, expressionRef.current)}
                    className="rounded-lg border border-foreground/10 bg-foreground/7 px-3 py-2 text-sm text-foreground/78 transition hover:border-foreground/24 hover:bg-foreground/12 hover:text-foreground"
                  >
                    {sample}
                  </button>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button onClick={backspaceToken} className="inline-flex items-center justify-center gap-2 rounded-lg border border-foreground/10 bg-background/18 px-3 py-2 text-xs text-foreground/76 transition hover:bg-foreground/10">
                  <Undo2 className="h-3.5 w-3.5" />
                  되돌리기
                </button>
                <button onClick={clearAll} className="inline-flex items-center justify-center gap-2 rounded-lg border border-foreground/10 bg-background/18 px-3 py-2 text-xs text-foreground/76 transition hover:bg-foreground/10">
                  <Trash2 className="h-3.5 w-3.5" />
                  지우기
                </button>
              </div>
            </Panel>

            <Panel className="min-h-0">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold">완성 문장</h2>
                <span className="font-mono text-xs text-foreground/42">최근 5개</span>
              </div>
              <div className="min-h-0 space-y-3 overflow-y-auto pr-1">
                {finalized.length ? (
                  finalized.map((item) => (
                    <div key={item.id} className="rounded-lg border border-foreground/10 bg-background/22 p-3">
                      <p className="text-base leading-relaxed text-foreground">{item.text}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-foreground/50">
                        <span className="font-mono">{Math.round(item.score * 100)}%</span>
                        <span>{item.source}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-lg border border-dashed border-foreground/12 bg-background/18 p-4 text-sm leading-relaxed text-foreground/58">
                    단어가 쌓인 뒤 문장 끝 신호를 유지하거나 상단의 문장 끝 버튼을 누르면 보이스 출력까지 실행됩니다.
                  </div>
                )}
              </div>
              {lastSpoken ? <p className="mt-3 truncate text-xs text-foreground/46">마지막 음성: {lastSpoken}</p> : null}
            </Panel>

            <Panel>
              <div className="mb-3 flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs text-foreground/48">공유 웹 학습</p>
                  <h2 className="mt-1 text-lg font-semibold">공유 라벨 · 샘플 학습</h2>
                </div>
                <Database className="h-5 w-5 text-foreground/58" />
              </div>

              <div className="grid gap-2">
                <div className="flex gap-2">
                  <input
                    value={trainingLabel}
                    onChange={(event) => setTrainingLabel(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") addTrainingLabel()
                    }}
                    placeholder="예: 도와주세요"
                    className="min-w-0 flex-1 rounded-lg border border-foreground/10 bg-background/24 px-3 py-2 text-sm text-foreground outline-none transition placeholder:text-foreground/32 focus:border-foreground/32"
                  />
                  <button onClick={addTrainingLabel} className="inline-flex items-center justify-center gap-2 rounded-lg border border-foreground/12 bg-foreground/10 px-3 py-2 text-xs font-medium text-foreground/82 transition hover:bg-foreground/16">
                    <Plus className="h-3.5 w-3.5" />
                    추가
                  </button>
                </div>

                <select
                  value={selectedTrainingLabel}
                  onChange={(event) => setSelectedTrainingLabel(event.target.value)}
                  className="h-10 rounded-lg border border-foreground/10 bg-background/24 px-3 text-sm text-foreground outline-none transition focus:border-foreground/32"
                >
                  {availableLabels.map((label) => (
                    <option key={label} value={label} className="bg-background text-foreground">
                      {label}
                    </option>
                  ))}
                </select>

                <button onClick={captureTrainingSample} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-foreground/16 bg-foreground/14 px-3 text-sm font-semibold text-foreground transition hover:bg-foreground/20">
                  <BadgeCheck className="h-4 w-4" />
                  현재 동작 샘플 학습
                </button>
              </div>

              <p className="mt-3 text-xs leading-relaxed text-foreground/58">{trainingMessage}</p>

              <div className="mt-3 flex flex-wrap gap-2">
                {labelCounts.map((item) => (
                  <span key={item.label} className={`rounded-lg border px-2.5 py-1.5 text-[11px] ${item.label === selectedTrainingLabel ? "border-foreground/30 bg-foreground/14 text-foreground" : "border-foreground/10 bg-background/18 text-foreground/62"}`}>
                    {item.label} · {item.count}
                  </span>
                ))}
              </div>

              <div className="mt-3 flex items-center justify-between gap-3 border-t border-foreground/10 pt-3 text-xs text-foreground/52">
                <span>공유 샘플 {sharedTrainingCount}개</span>
                <button onClick={resetCustomTraining} className="inline-flex items-center gap-1.5 text-foreground/58 transition hover:text-foreground">
                  <Trash2 className="h-3.5 w-3.5" />
                  공유 학습 초기화
                </button>
              </div>
            </Panel>
          </aside>
        </div>
      </section>
    </main>
  )

  function applyExpressionContext(prediction: SignPrediction, nextExpression: FaceExpression): SignPrediction {
    const boostByLabel: Record<string, number> = {
      "감사합니다": nextExpression.scores.smile * 0.08,
      "아니요": nextExpression.scores.negative * 0.1,
      "네": Math.max(nextExpression.scores.smile, nextExpression.scores.emphasis) * 0.07,
      "안녕하세요": Math.max(nextExpression.scores.smile, nextExpression.scores.question) * 0.05,
    }
    const boost = boostByLabel[prediction.label] ?? 0
    return {
      ...prediction,
      confidence: Math.min(1, prediction.confidence + boost),
      alternatives: prediction.alternatives.map((item) =>
        item.label === prediction.label ? { ...item, confidence: Math.min(1, item.confidence + boost) } : item,
      ),
    }
  }
}

function ControlButton({
  icon: Icon,
  label,
  onClick,
  active = false,
}: {
  icon: typeof Camera
  label: string
  onClick: () => void
  active?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`flex min-h-10 items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition ${
        active
          ? "border-foreground/36 bg-foreground/16 text-foreground"
          : "border-foreground/10 bg-foreground/7 text-foreground/72 hover:bg-foreground/12 hover:text-foreground"
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  )
}

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-foreground/10 bg-foreground/7 p-4 backdrop-blur-xl ${className}`}>{children}</div>
}

function StageChip({ icon: Icon, label }: { icon: typeof Camera; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-foreground/10 bg-background/42 px-3 py-2 text-xs text-foreground/72 backdrop-blur-xl">
      <Icon className="h-3.5 w-3.5 text-foreground/80" />
      <span>{label}</span>
    </div>
  )
}

function Metric({ label, value, percent }: { label: string; value: string; percent: number }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3 text-xs">
        <span className="text-foreground/48">{label}</span>
        <span className="text-foreground/74">{value}</span>
      </div>
      <ConfidenceBar value={percent} />
    </div>
  )
}

function ConfidenceBar({ value }: { value: number }) {
  return (
    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-foreground/10">
      <div className="h-full bg-foreground transition-all duration-200" style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  )
}

function aggregateRecentPredictions(predictions: RecentSignPrediction[], now: number, windowMs: number) {
  const recent = predictions.filter((item) => now - item.timestamp <= windowMs && isFinalizablePrediction(item.prediction))
  if (!recent.length) return null

  const byLabel = new Map<
    string,
    {
      confidenceSum: number
      score: number
      votes: number
      expression: FaceExpression
      lastSeenAt: number
    }
  >()

  recent.forEach((item) => {
    const current = byLabel.get(item.prediction.label)
    const weightedConfidence = item.prediction.confidence * item.prediction.confidence
    if (!current) {
      byLabel.set(item.prediction.label, {
        confidenceSum: item.prediction.confidence,
        score: weightedConfidence,
        votes: 1,
        expression: item.expression,
        lastSeenAt: item.timestamp,
      })
      return
    }

    current.confidenceSum += item.prediction.confidence
    current.score += weightedConfidence
    current.votes += 1
    if (item.timestamp >= current.lastSeenAt) {
      current.expression = item.expression
      current.lastSeenAt = item.timestamp
    }
  })

  const ranked = Array.from(byLabel.entries())
    .map(([label, item]) => ({
      label,
      confidence: clamp(item.confidenceSum / item.votes, 0, 1),
      score: item.score,
      votes: item.votes,
      expression: item.expression,
      lastSeenAt: item.lastSeenAt,
    }))
    .sort((left, right) => right.score - left.score || right.votes - left.votes || right.lastSeenAt - left.lastSeenAt)

  return ranked[0] ?? null
}

function isFinalizablePrediction(prediction: SignPrediction) {
  return prediction.confidence >= FINALIZE_PREDICTION_MIN_CONFIDENCE && prediction.label !== "대기" && prediction.label !== "버퍼링"
}

function detectFinishSignal(result: HolisticResultLike) {
  const left = result.leftHandLandmarks?.[0]
  const right = result.rightHandLandmarks?.[0]
  if (!left?.length || !right?.length) return false
  const leftCenter = averagePoint([left[0], left[5], left[9], left[13], left[17]])
  const rightCenter = averagePoint([right[0], right[5], right[9], right[13], right[17]])
  const wristDistance = distance(left[0], right[0])
  const palmDistance = distance(leftCenter, rightCenter)
  return wristDistance < 0.17 && palmDistance < 0.19
}

function resizeCanvas(canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect()
  const scale = window.devicePixelRatio || 1
  const width = Math.floor(rect.width * scale)
  const height = Math.floor(rect.height * scale)
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
    canvas.style.width = `${rect.width}px`
    canvas.style.height = `${rect.height}px`
  }
  const context = canvas.getContext("2d")
  context?.setTransform(scale, 0, 0, scale, 0, 0)
}

function createOverlayPointMapper(video: HTMLVideoElement, canvasWidth: number, canvasHeight: number): OverlayPointMapper {
  if (!video.videoWidth || !video.videoHeight || !canvasWidth || !canvasHeight) {
    return (point) => ({ x: clamp((1 - point.x) * canvasWidth, 0, canvasWidth), y: clamp(point.y * canvasHeight, 0, canvasHeight) })
  }

  const scale = Math.max(canvasWidth / video.videoWidth, canvasHeight / video.videoHeight)
  const displayWidth = video.videoWidth * scale
  const displayHeight = video.videoHeight * scale
  const cropX = (displayWidth - canvasWidth) / 2
  const cropY = (displayHeight - canvasHeight) / 2

  return (point) => ({
    x: clamp((1 - point.x) * displayWidth - cropX, 0, canvasWidth),
    y: clamp(point.y * displayHeight - cropY, 0, canvasHeight),
  })
}

function drawPose(context: CanvasRenderingContext2D, pose: Landmark3D[], mapPoint: OverlayPointMapper) {
  if (!pose.length) return
  context.strokeStyle = "rgba(255, 196, 102, 0.92)"
  context.lineWidth = 3
  POSE_CONNECTIONS.forEach(([start, end]) => {
    if (!pose[start] || !pose[end]) return
    drawLine(context, pose[start], pose[end], mapPoint)
  })
  ;[11, 12, 13, 14, 15, 16].forEach((index) => {
    if (pose[index]) drawPoint(context, pose[index], mapPoint, 4, "rgba(255, 196, 102, 0.96)")
  })
}

function drawHand(context: CanvasRenderingContext2D, hand: Landmark3D[], mapPoint: OverlayPointMapper, color: string) {
  if (!hand.length) return
  context.strokeStyle = color
  context.lineWidth = 2
  HAND_CONNECTIONS.forEach(([start, end]) => {
    if (!hand[start] || !hand[end]) return
    drawLine(context, hand[start], hand[end], mapPoint)
  })
  hand.forEach((point) => drawPoint(context, point, mapPoint, 3, color))
}

function drawFace(context: CanvasRenderingContext2D, face: Landmark3D[], mapPoint: OverlayPointMapper) {
  if (!face.length) return
  face.forEach((point, index) => {
    if (index % 12 === 0) drawPoint(context, point, mapPoint, 1.6, "rgba(255,255,255,0.55)")
  })
  ;[13, 14, 61, 291, 33, 263, 70, 300].forEach((index) => {
    if (face[index]) drawPoint(context, face[index], mapPoint, 2.6, "rgba(255,255,255,0.86)")
  })
}

function drawLine(context: CanvasRenderingContext2D, left: Landmark3D, right: Landmark3D, mapPoint: OverlayPointMapper) {
  const start = mapPoint(left)
  const end = mapPoint(right)
  context.beginPath()
  context.moveTo(start.x, start.y)
  context.lineTo(end.x, end.y)
  context.stroke()
}

function drawPoint(context: CanvasRenderingContext2D, point: Landmark3D, mapPoint: OverlayPointMapper, radius: number, color: string) {
  const mapped = mapPoint(point)
  context.fillStyle = color
  context.beginPath()
  context.arc(mapped.x, mapped.y, radius, 0, Math.PI * 2)
  context.fill()
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function averagePoint(points: Landmark3D[]) {
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  }
}

function distance(left: { x: number; y: number }, right: { x: number; y: number }) {
  return Math.hypot(left.x - right.x, left.y - right.y)
}
