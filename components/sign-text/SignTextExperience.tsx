"use client"

import Image from "next/image"
import Link from "next/link"
import type React from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import { Shader, ChromaFlow, Swirl } from "shaders/react"
import {
  ArrowLeft,
  AudioLines,
  BadgeCheck,
  Camera,
  Captions,
  Check,
  Hand,
  Mic2,
  Pause,
  RotateCcw,
  Sparkles,
  Trash2,
  Undo2,
} from "lucide-react"
import { CustomCursor } from "@/components/custom-cursor"
import { GrainOverlay } from "@/components/grain-overlay"
import {
  flattenHolisticFrameFeatures,
  hasEnoughHolisticSignal,
  loadBrowserKnnModel,
  predictSignSequence,
  readFaceExpression,
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
  },
}

export function SignTextExperience() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const landmarkerRef = useRef<HolisticLandmarkerLike | null>(null)
  const modelRef = useRef<BrowserKnnModel | null>(null)
  const memoryRef = useRef<SentenceMemoryEntry[]>([])
  const sequenceRef = useRef<number[][]>([])
  const predictionHistoryRef = useRef<Array<{ label: string; confidence: number; timestamp: number }>>([])
  const tokensRef = useRef<TokenRecord[]>([])
  const expressionRef = useRef<FaceExpression>(EMPTY_EXPRESSION)
  const frameIndexRef = useRef(0)
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

  const preloadResources = useCallback(async () => {
    try {
      setModelState("문장 메모리 로딩")
      const [model, memory] = await Promise.all([loadBrowserKnnModel(), loadSentenceMemory()])
      modelRef.current = model
      memoryRef.current = memory
      setModelState(`웹 KNN 준비 (${model.labels.length} labels)`)
    } catch (error) {
      console.error(error)
      setModelState("웹 모델 로딩 실패")
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    setIsLoaded(true)
    void preloadResources()
    return () => {
      mountedRef.current = false
      streamRef.current?.getTracks().forEach((track) => track.stop())
      landmarkerRef.current?.close?.()
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
      if (now - (lastEmitRef.current[label] ?? 0) < 1450) return
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
      const currentTokens = tokensRef.current
      if (!currentTokens.length) return
      finalizingRef.current = true
      setLlmState("LLM 문장 정리 중")
      try {
        const localRefined = updateDraftSentence(currentTokens, expressionRef.current)
        const refined = await refineWithServer(currentTokens, localRefined)
        const sentence: FinalizedSentence = {
          id: finalizedIdRef.current++,
          text: refined.sentence,
          score: refined.score,
          source: `${reason}:${refined.source}`,
          tokens: currentTokens,
        }
        setFinalized((previous) => [sentence, ...previous].slice(0, 5))
        tokensRef.current = []
        setTokens([])
        setDraftSentence("-")
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
    setTokens([])
    setCurrentPrediction(null)
    setDraftSentence("-")
    setFinishProgress(0)
    setLlmState("LLM 대기")
  }, [])

  const updateStablePrediction = useCallback((prediction: SignPrediction, now: number) => {
    if (prediction.confidence < 0.58 || prediction.label === "대기" || prediction.label === "버퍼링") {
      predictionHistoryRef.current = predictionHistoryRef.current.filter((item) => now - item.timestamp < 900)
      return null
    }

    predictionHistoryRef.current = [
      ...predictionHistoryRef.current.filter((item) => now - item.timestamp < 950),
      { label: prediction.label, confidence: prediction.confidence, timestamp: now },
    ].slice(-8)

    const matching = predictionHistoryRef.current.filter((item) => item.label === prediction.label)
    if (matching.length >= 5) {
      return {
        label: prediction.label,
        confidence: matching.reduce((sum, item) => sum + item.confidence, 0) / matching.length,
      }
    }
    return null
  }, [])

  const updateFinishSignal = useCallback(
    (result: HolisticResultLike, now: number) => {
      const finishActive = detectFinishSignal(result)
      if (!finishActive) {
        finishHoldStartRef.current = null
        finishArmedRef.current = true
        setFinishProgress(0)
        return
      }

      if (!finishHoldStartRef.current) finishHoldStartRef.current = now
      const progress = Math.min(1, (now - finishHoldStartRef.current) / 1050)
      setFinishProgress(progress)
      if (progress >= 1 && finishArmedRef.current) {
        finishArmedRef.current = false
        void finalizeSentence("gesture")
      }
    },
    [finalizeSentence],
  )

  useEffect(() => {
    let raf = 0

    const loop = () => {
      if (!mountedRef.current) return
      const video = videoRef.current
      const landmarker = landmarkerRef.current
      const model = modelRef.current
      const now = performance.now()

      if (video && landmarker && model && video.readyState >= 2) {
        try {
          const result = landmarker.detectForVideo(video, now)
          drawOverlay(result)
          const nextExpression = readFaceExpression(result.faceBlendshapes, Boolean(result.faceLandmarks?.[0]?.length))
          expressionRef.current = nextExpression
          setExpression(nextExpression)

          if (hasEnoughHolisticSignal(result)) {
            sequenceRef.current.push(flattenHolisticFrameFeatures(result))
            if (sequenceRef.current.length > model.sequenceLength) {
              sequenceRef.current = sequenceRef.current.slice(-model.sequenceLength)
            }
          } else {
            sequenceRef.current = []
            predictionHistoryRef.current = []
          }

          if (sequenceRef.current.length === model.sequenceLength) {
            frameIndexRef.current += 1
            if (frameIndexRef.current % 4 === 0) {
              const prediction = applyExpressionContext(predictSignSequence(model, sequenceRef.current), nextExpression)
              setCurrentPrediction(prediction)
              const stable = updateStablePrediction(prediction, now)
              if (stable) emitToken(stable.label, stable.confidence, nextExpression)
            }
          } else {
            setCurrentPrediction({
              label: hasEnoughHolisticSignal(result) ? "버퍼링" : "대기",
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
  }, [emitToken, updateFinishSignal, updateStablePrediction])

  const drawOverlay = (result: HolisticResultLike) => {
    const canvas = overlayCanvasRef.current
    const context = canvas?.getContext("2d")
    const video = videoRef.current
    if (!canvas || !context || !video) return

    resizeCanvas(canvas)
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    context.clearRect(0, 0, width, height)
    context.save()
    context.lineCap = "round"
    context.lineJoin = "round"

    drawPose(context, result.poseLandmarks?.[0] ?? [], width, height)
    drawHand(context, result.leftHandLandmarks?.[0] ?? [], width, height, "#55e6a5")
    drawHand(context, result.rightHandLandmarks?.[0] ?? [], width, height, "#58a6ff")
    drawFace(context, result.faceLandmarks?.[0] ?? [], width, height)
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
        <Shader className="h-full w-full">
          <Swirl colorA="#1275d8" colorB="#e19136" speed={0.7} detail={0.74} blend={46} coarseX={40} coarseY={40} mediumX={40} mediumY={40} fineX={40} fineY={40} />
          <ChromaFlow baseColor="#0066ff" upColor="#0066ff" downColor="#d1d1d1" leftColor="#e19136" rightColor="#e19136" intensity={0.82} radius={1.7} momentum={22} maskType="alpha" opacity={0.94} />
        </Shader>
        <div className="absolute inset-0 bg-black/54" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_24%,rgba(18,117,216,0.48),transparent_32%),radial-gradient(circle_at_80%_42%,rgba(225,145,54,0.42),transparent_30%)]" />
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
                    <p className="text-xs text-foreground/48">문장 후보</p>
                    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-foreground/10">
                      <div className="h-full bg-foreground transition-all duration-200" style={{ width: `${finishProgress * 100}%` }} />
                    </div>
                  </div>
                  <p className="mt-2 truncate text-lg font-light tracking-tight text-foreground md:text-2xl">{draftSentence}</p>
                </div>
              </div>
            </div>
          </section>

          <aside className="grid min-h-0 gap-4 lg:grid-rows-[auto_auto_minmax(0,1fr)]">
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
                <Metric label="질문/강조" value={`${Math.round(Math.max(expression.scores.question, expression.scores.emphasis) * 100)}%`} percent={Math.max(expression.scores.question, expression.scores.emphasis)} />
                <Metric label="부정" value={`${Math.round(expression.scores.negative * 100)}%`} percent={expression.scores.negative} />
              </div>
            </Panel>

            <Panel>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold">빠른 테스트</h2>
                <Captions className="h-4 w-4 text-foreground/54" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                {SAMPLE_TOKENS.map((sample) => (
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

function drawPose(context: CanvasRenderingContext2D, pose: Landmark3D[], width: number, height: number) {
  if (!pose.length) return
  context.strokeStyle = "rgba(255, 196, 102, 0.92)"
  context.lineWidth = 3
  POSE_CONNECTIONS.forEach(([start, end]) => {
    if (!pose[start] || !pose[end]) return
    drawLine(context, pose[start], pose[end], width, height)
  })
  ;[11, 12, 13, 14, 15, 16].forEach((index) => {
    if (pose[index]) drawPoint(context, pose[index], width, height, 4, "rgba(255, 196, 102, 0.96)")
  })
}

function drawHand(context: CanvasRenderingContext2D, hand: Landmark3D[], width: number, height: number, color: string) {
  if (!hand.length) return
  context.strokeStyle = color
  context.lineWidth = 2
  HAND_CONNECTIONS.forEach(([start, end]) => {
    if (!hand[start] || !hand[end]) return
    drawLine(context, hand[start], hand[end], width, height)
  })
  hand.forEach((point) => drawPoint(context, point, width, height, 3, color))
}

function drawFace(context: CanvasRenderingContext2D, face: Landmark3D[], width: number, height: number) {
  if (!face.length) return
  face.forEach((point, index) => {
    if (index % 12 === 0) drawPoint(context, point, width, height, 1.6, "rgba(255,255,255,0.55)")
  })
  ;[13, 14, 61, 291, 33, 263, 70, 300].forEach((index) => {
    if (face[index]) drawPoint(context, face[index], width, height, 2.6, "rgba(255,255,255,0.86)")
  })
}

function drawLine(context: CanvasRenderingContext2D, left: Landmark3D, right: Landmark3D, width: number, height: number) {
  context.beginPath()
  context.moveTo((1 - left.x) * width, left.y * height)
  context.lineTo((1 - right.x) * width, right.y * height)
  context.stroke()
}

function drawPoint(context: CanvasRenderingContext2D, point: Landmark3D, width: number, height: number, radius: number, color: string) {
  context.fillStyle = color
  context.beginPath()
  context.arc((1 - point.x) * width, point.y * height, radius, 0, Math.PI * 2)
  context.fill()
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
