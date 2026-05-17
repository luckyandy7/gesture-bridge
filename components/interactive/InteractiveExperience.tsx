"use client"

import Image from "next/image"
import Link from "next/link"
import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { Shader, ChromaFlow, Swirl } from "shaders/react"
import {
  ArrowLeft,
  Box,
  Camera,
  ChevronRight,
  CloudSun,
  Crosshair,
  Eraser,
  Gamepad2,
  Hand,
  HeartPulse,
  HelpCircle,
  Home,
  ImageIcon,
  Layers,
  Mic,
  MicOff,
  MousePointer2,
  Music,
  Paintbrush,
  Pause,
  Play,
  Minus,
  Plus,
  RefreshCw,
  Save,
  Settings,
  Sparkles,
  Timer,
  Trash2,
  Trophy,
  Undo2,
  WandSparkles,
  Volume2,
  VolumeX,
} from "lucide-react"
import { CosmicParticlePlayground } from "@/components/interactive/CosmicParticlePlayground"
import { SatoruTechniquePanel } from "@/components/interactive/SatoruTechniquePanel"
import { CustomCursor } from "@/components/custom-cursor"
import { GrainOverlay } from "@/components/grain-overlay"
import {
  createEffectParticles,
  drawEffectField,
  drawEffectParticles,
  EFFECT_DEFINITIONS,
  EFFECT_PARTICLE_LIMIT,
  getEffectDefinition,
  stepEffectParticles,
  type EffectParticle,
} from "@/lib/interactive/features/effects"
import {
  createMiniGameRuntime,
  drawMiniGame,
  getMiniGameHudState,
  stepMiniGame,
  type MiniGameHudState,
  type MiniGameRuntime,
} from "@/lib/interactive/features/mini-game-runtime"
import { getMiniGameDefinition, getNextMiniGame, MINI_GAME_DEFINITIONS } from "@/lib/interactive/features/mini-games"
import {
  getNextThreeScene,
  getThreeSceneDefinition,
  InteractiveThreeRuntime,
  THREE_QUALITY_OPTIONS,
  THREE_SCENE_DEFINITIONS,
  type ThreeQuality,
  type ThreeRuntimeTelemetry,
  type ThreeSceneId,
} from "@/lib/interactive/features/three-scene-runtime"
import { GestureComboManager } from "@/lib/interactive/gesture/gesture-combo-manager"
import {
  createEmptyGestureSnapshot,
  GESTURE_LABELS,
  recognizeGestureSnapshot,
} from "@/lib/interactive/gesture/gesture-recognizer"
import { getWeatherInfo } from "@/lib/interactive/services/weather-service"
import type {
  EffectId,
  FloatingImagePanel,
  GestureHistoryFrame,
  GestureName,
  GestureSnapshot,
  InteractionLog,
  InteractiveMode,
  MiniGameId,
  NormalizedLandmark,
  ParsedCommand,
  Point,
  WeatherInfo,
} from "@/lib/interactive/types"
import { parseKoreanCommand } from "@/lib/interactive/voice/korean-command-parser"

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

type SpeechRecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start: () => void
  stop: () => void
  abort?: () => void
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: { error?: string }) => void) | null
  onend: (() => void) | null
}

type SpeechRecognitionEventLike = {
  resultIndex: number
  results: ArrayLike<{
    isFinal?: boolean
    0: { transcript: string }
  }>
}

type HandLandmarkerLike = {
  detectForVideo: (
    video: HTMLVideoElement,
    timestamp: number,
  ) => {
    landmarks?: NormalizedLandmark[][]
    handednesses?: Array<Array<{ categoryName?: string; displayName?: string }>>
  }
  close?: () => void
}

type DrawingTool = "pen" | "eraser"

const MODE_LABELS: Record<InteractiveMode, string> = {
  home: "홈",
  image: "사진",
  drawing: "그림",
  satoru: "술식",
  particles: "파티클",
  weather: "날씨",
  effects: "효과",
  game: "게임",
  three: "3D",
  music: "음악",
  settings: "설정",
}

const MODE_ITEMS: Array<{ mode: InteractiveMode; icon: typeof Home; helper: string }> = [
  { mode: "home", icon: Home, helper: "전체 상태" },
  { mode: "drawing", icon: Paintbrush, helper: "공중 드로잉" },
  { mode: "satoru", icon: WandSparkles, helper: "SAT0RU 레퍼런스" },
  { mode: "particles", icon: Sparkles, helper: "우주 입자장" },
  { mode: "effects", icon: Sparkles, helper: "제스처 효과" },
  { mode: "game", icon: Gamepad2, helper: "미니게임" },
  { mode: "three", icon: Box, helper: "입체 조작" },
  { mode: "weather", icon: CloudSun, helper: "한국어 날씨" },
  { mode: "image", icon: ImageIcon, helper: "이미지 패널" },
  { mode: "music", icon: Music, helper: "미디어 제어" },
  { mode: "settings", icon: Settings, helper: "명령 도움말" },
]

const INITIAL_IMAGES: FloatingImagePanel[] = [
  {
    id: 0,
    title: "인터랙티브 스테이지",
    src: "/brand/mode-interactive-stage.png",
    x: 0.46,
    y: 0.48,
    scale: 1,
    rotation: -4,
    visible: true,
  },
  {
    id: 1,
    title: "수어 문장 모드",
    src: "/brand/mode-sign-sentence.png",
    x: 0.63,
    y: 0.38,
    scale: 0.76,
    rotation: 7,
    visible: true,
  },
  {
    id: 2,
    title: "PC 제어 모드",
    src: "/brand/mode-pc-control.png",
    x: 0.34,
    y: 0.62,
    scale: 0.72,
    rotation: -9,
    visible: true,
  },
  {
    id: 3,
    title: "Gesture Bridge",
    src: "/brand/gesture-bridge-banner.png",
    x: 0.68,
    y: 0.66,
    scale: 0.64,
    rotation: 4,
    visible: true,
  },
]

const DRAW_COLORS = ["#38bdf8", "#ef4444", "#f97316", "#facc15", "#22c55e", "#a855f7", "#ffffff"]
const MUSIC_TRACKS = ["네온 펄스", "스카이 라인", "에너지 필드"]
const COMMAND_SAMPLES = [
  "날씨 알려줘",
  "서울 날씨 알려줘",
  "사진 보여줘",
  "다음 사진",
  "확대해줘",
  "그림 그리기 시작",
  "지우개",
  "전체 지워줘",
  "사토루 보여줘",
  "파티클 모드",
  "효과 실행",
  "게임 시작",
  "3D 보여줘",
  "음악 재생",
  "볼륨 올려줘",
  "초기화해줘",
]
const EFFECT_BY_GESTURE: Partial<Record<GestureName, EffectId>> = {
  open_palm: "fire_release",
  point: "laser_beam",
  pinch: "magic_circle",
  two_hands_spread: "portal",
  swipe_left: "wind_slash",
  swipe_right: "water_wave",
  fist: "particle_burst",
  peace: "shield",
}

const EFFECT_GESTURE_PRIORITY: GestureName[] = ["pinch", "point", "open_palm", "fist", "peace", "swipe_left", "swipe_right", "two_hands_spread"]

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

const UI_SNAPSHOT_INTERVAL_MS = 50
const HAND_TRACKING_INTERVAL_MS = 1000 / 30
const EFFECT_FRAME_INTERVAL_MS = 1000 / 30
const INTERACTIVE_CANVAS_MAX_DPR = 1.4

export function InteractiveExperience() {
  const stageRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const drawingCanvasRef = useRef<HTMLCanvasElement>(null)
  const effectsCanvasRef = useRef<HTMLCanvasElement>(null)
  const gameCanvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const landmarkerRef = useRef<HandLandmarkerLike | null>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const comboManagerRef = useRef(new GestureComboManager())
  const gestureHistoryRef = useRef<GestureHistoryFrame[]>([])
  const previousTwoHandDistanceRef = useRef<number | null>(null)
  const latestSnapshotRef = useRef<GestureSnapshot>(createEmptyGestureSnapshot())
  const pointerRef = useRef<Point>({ x: 0.52, y: 0.52 })
  const smoothedPointerRef = useRef<Point | null>(null)
  const pointerDownRef = useRef(false)
  const particlesRef = useRef<EffectParticle[]>([])
  const drawingHistoryRef = useRef<ImageData[]>([])
  const lastDrawPointRef = useRef<Point | null>(null)
  const gameRuntimeRef = useRef<MiniGameRuntime | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const gainNodeRef = useRef<GainNode | null>(null)
  const oscillatorRef = useRef<OscillatorNode | null>(null)
  const logIdRef = useRef(1)
  const lastGestureActionRef = useRef<Record<string, number>>({})
  const lastEffectAtRef = useRef(-9999)
  const lastPinchUiRef = useRef(0)
  const lastSnapshotUiAtRef = useRef(0)
  const lastHandDetectAtRef = useRef(0)
  const lastCameraSnapshotRef = useRef<GestureSnapshot | null>(null)
  const mountedRef = useRef(false)

  const [mode, setMode] = useState<InteractiveMode>("home")
  const [cameraState, setCameraState] = useState("카메라 대기")
  const [voiceState, setVoiceState] = useState("음성 대기")
  const [voiceActive, setVoiceActive] = useState(false)
  const [trackingMode, setTrackingMode] = useState<"camera" | "simulation">("simulation")
  const [cameraPreviewActive, setCameraPreviewActive] = useState(false)
  const [snapshot, setSnapshot] = useState<GestureSnapshot>(createEmptyGestureSnapshot())
  const [logs, setLogs] = useState<InteractionLog[]>([{ id: 0, text: "체험 시작 버튼으로 카메라를 켜거나 마우스 시뮬레이션을 사용하세요.", tone: "info" }])
  const [images, setImages] = useState<FloatingImagePanel[]>(INITIAL_IMAGES)
  const [selectedImageId, setSelectedImageId] = useState(0)
  const [weather, setWeather] = useState<WeatherInfo | null>(null)
  const [weatherLoading, setWeatherLoading] = useState(false)
  const [drawingTool, setDrawingTool] = useState<DrawingTool>("pen")
  const [drawingColor, setDrawingColor] = useState(DRAW_COLORS[0])
  const [drawingSize, setDrawingSize] = useState(5)
  const [activeEffect, setActiveEffect] = useState<EffectId>("particle_burst")
  const [effectPower, setEffectPower] = useState(1)
  const [miniGame, setMiniGame] = useState<MiniGameId>("catch")
  const [gameHud, setGameHud] = useState<MiniGameHudState>(() => getMiniGameHudState(createMiniGameRuntime("catch")))
  const [threeVisible, setThreeVisible] = useState(true)
  const [threeScale, setThreeScale] = useState(1)
  const [threeScene, setThreeScene] = useState<ThreeSceneId>("gesture_core")
  const [threeQuality, setThreeQuality] = useState<ThreeQuality>("balanced")
  const [musicPlaying, setMusicPlaying] = useState(false)
  const [volume, setVolume] = useState(0.46)
  const [muted, setMuted] = useState(false)
  const [trackIndex, setTrackIndex] = useState(0)
  const [helpOpen, setHelpOpen] = useState(true)

  const selectedImage = images.find((image) => image.id === selectedImageId) ?? images[0]
  const activeEffectDefinition = getEffectDefinition(activeEffect)
  const activeGameDefinition = getMiniGameDefinition(miniGame)

  const addLog = useCallback((text: string, tone: InteractionLog["tone"] = "info") => {
    setLogs((previous) => [{ id: logIdRef.current++, text, tone }, ...previous].slice(0, 7))
  }, [])

  const changeMode = useCallback(
    (nextMode: InteractiveMode, reason?: string) => {
      if (nextMode !== "effects") {
        particlesRef.current = []
        lastEffectAtRef.current = -9999
      }
      setMode(nextMode)
      addLog(reason ?? `${MODE_LABELS[nextMode]} 모드로 전환했습니다.`, "success")
    },
    [addLog],
  )

  const pushEffect = useCallback(
    (effectId: EffectId, point = latestSnapshotRef.current.pointer, amount?: number) => {
      const rect = stageRef.current?.getBoundingClientRect()
      const x = point.x * (rect?.width ?? window.innerWidth)
      const y = point.y * (rect?.height ?? window.innerHeight)
      const now = performance.now()
      const manualTrigger = typeof amount === "number"
      if (!manualTrigger && now - lastEffectAtRef.current < 1180) return
      lastEffectAtRef.current = now
      setActiveEffect(effectId)
      const burstAmount = amount ?? Math.round(getEffectDefinition(effectId).burstSize * effectPower)
      particlesRef.current = [...particlesRef.current, ...createEffectParticles(effectId, x, y, Math.floor(now), burstAmount)].slice(-EFFECT_PARTICLE_LIMIT)
      if (manualTrigger || now - (lastGestureActionRef.current["effect-log"] ?? 0) > 1600) {
        lastGestureActionRef.current["effect-log"] = now
        addLog(`${getEffectDefinition(effectId).label} 효과를 실행했습니다.`, "success")
      }
    },
    [addLog, effectPower],
  )

  const triggerEffectFromPanel = useCallback(
    (effectId: EffectId) => {
      pushEffect(effectId, undefined, Math.round(getEffectDefinition(effectId).burstSize * effectPower))
    },
    [effectPower, pushEffect],
  )

  const resetImages = useCallback(() => {
    setImages(INITIAL_IMAGES)
    setSelectedImageId(0)
  }, [])

  const updateSelectedImage = useCallback((updater: (image: FloatingImagePanel) => FloatingImagePanel) => {
    setImages((previous) => previous.map((image) => (image.id === selectedImageId ? updater(image) : image)))
  }, [selectedImageId])

  const nextImage = useCallback(() => {
    setImages((previous) => {
      const visible = previous.filter((image) => image.visible)
      if (visible.length === 0) {
        setSelectedImageId(previous[0]?.id ?? 0)
        return previous.map((image) => ({ ...image, visible: true }))
      }
      const index = visible.findIndex((image) => image.id === selectedImageId)
      const next = visible[(index + 1 + visible.length) % visible.length]
      setSelectedImageId(next.id)
      return previous
    })
    addLog("다음 사진을 선택했습니다.", "success")
  }, [addLog, selectedImageId])

  const previousImage = useCallback(() => {
    setImages((previous) => {
      const visible = previous.filter((image) => image.visible)
      if (visible.length === 0) {
        setSelectedImageId(previous[0]?.id ?? 0)
        return previous.map((image) => ({ ...image, visible: true }))
      }
      const index = visible.findIndex((image) => image.id === selectedImageId)
      const next = visible[(index - 1 + visible.length) % visible.length]
      setSelectedImageId(next.id)
      return previous
    })
    addLog("이전 사진을 선택했습니다.", "success")
  }, [addLog, selectedImageId])

  const selectImage = useCallback((imageId: number) => {
    setSelectedImageId(imageId)
    setImages((previous) => previous.map((image) => (image.id === imageId ? { ...image, visible: true } : image)))
  }, [])

  const saveDrawing = useCallback(() => {
    const canvas = drawingCanvasRef.current
    if (!canvas) return
    const anchor = document.createElement("a")
    anchor.href = canvas.toDataURL("image/png")
    anchor.download = `air-drawing-${Date.now()}.png`
    anchor.click()
    addLog("그림을 PNG 이미지로 저장했습니다.", "success")
  }, [addLog])

  const clearDrawing = useCallback(() => {
    const canvas = drawingCanvasRef.current
    const context = canvas?.getContext("2d")
    if (!canvas || !context) return
    drawingHistoryRef.current = []
    context.clearRect(0, 0, canvas.width, canvas.height)
    addLog("그림을 모두 지웠습니다.", "success")
  }, [addLog])

  const undoDrawing = useCallback(() => {
    const canvas = drawingCanvasRef.current
    const context = canvas?.getContext("2d")
    const last = drawingHistoryRef.current.pop()
    if (!canvas || !context || !last) return
    context.putImageData(last, 0, 0)
    addLog("마지막 선을 되돌렸습니다.", "success")
  }, [addLog])

  const requestWeather = useCallback(
    async (city = "서울") => {
      setWeatherLoading(true)
      changeMode("weather", `${city} 날씨를 확인하고 있어요.`)
      try {
        const info = await getWeatherInfo(city)
        setWeather(info)
        addLog(`${info.city} 현재 ${info.temperature}도, ${info.condition}${info.isMock ? " (대체 데이터)" : ""}`, info.isMock ? "warning" : "success")
      } finally {
        setWeatherLoading(false)
      }
    },
    [addLog, changeMode],
  )

  const switchMiniGame = useCallback(
    (next?: MiniGameId) => {
      const target = next ?? getNextMiniGame(miniGame)
      const runtime = createMiniGameRuntime(target)
      setMiniGame(target)
      gameRuntimeRef.current = runtime
      setGameHud(getMiniGameHudState(runtime))
      changeMode("game", `${getMiniGameDefinition(target).label} 게임을 시작합니다.`)
    },
    [changeMode, miniGame],
  )

  const restartMiniGame = useCallback(() => {
    const runtime = createMiniGameRuntime(miniGame)
    gameRuntimeRef.current = runtime
    setGameHud(getMiniGameHudState(runtime))
    changeMode("game", `${getMiniGameDefinition(miniGame).label} 게임을 다시 시작합니다.`)
  }, [changeMode, miniGame])

  const ensureAudio = useCallback(async () => {
    const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextCtor) {
      addLog("이 브라우저는 Web Audio API를 지원하지 않습니다.", "warning")
      return false
    }
    if (!audioContextRef.current) {
      const context = new AudioContextCtor()
      const gain = context.createGain()
      gain.gain.value = muted ? 0 : volume
      gain.connect(context.destination)
      audioContextRef.current = context
      gainNodeRef.current = gain
    }
    if (audioContextRef.current.state === "suspended") {
      await audioContextRef.current.resume()
    }
    return true
  }, [addLog, muted, volume])

  const startMusic = useCallback(async () => {
    const ok = await ensureAudio()
    if (!ok || !audioContextRef.current || !gainNodeRef.current) return
    oscillatorRef.current?.stop()
    const oscillator = audioContextRef.current.createOscillator()
    oscillator.type = trackIndex === 0 ? "sawtooth" : trackIndex === 1 ? "triangle" : "sine"
    oscillator.frequency.value = [142, 196, 262][trackIndex]
    oscillator.connect(gainNodeRef.current)
    oscillator.start()
    oscillatorRef.current = oscillator
    setMusicPlaying(true)
    changeMode("music", `${MUSIC_TRACKS[trackIndex]} 트랙을 재생합니다.`)
  }, [changeMode, ensureAudio, trackIndex])

  const pauseMusic = useCallback(() => {
    oscillatorRef.current?.stop()
    oscillatorRef.current = null
    setMusicPlaying(false)
    addLog("음악을 멈췄습니다.", "success")
  }, [addLog])

  const applyVolume = useCallback((nextVolume: number, nextMuted = muted) => {
    const value = Math.max(0, Math.min(1, nextVolume))
    setVolume(value)
    setMuted(nextMuted)
    if (gainNodeRef.current) gainNodeRef.current.gain.value = nextMuted ? 0 : value
  }, [muted])

  const dispatchCommand = useCallback(
    (command: ParsedCommand) => {
      addLog(`음성: ${command.transcript}`, command.intent === "unknown" ? "warning" : "info")
      if (command.mode) changeMode(command.mode, command.feedback)

      switch (command.intent) {
        case "set_mode":
          if (command.mode) changeMode(command.mode, command.feedback)
          break
        case "weather":
          void requestWeather(command.city)
          break
        case "image_show":
          changeMode("image", command.feedback)
          setImages((previous) => previous.map((image) => ({ ...image, visible: true })))
          break
        case "image_next":
          nextImage()
          break
        case "image_prev":
          previousImage()
          break
        case "image_zoom_in":
          changeMode("image", command.feedback)
          updateSelectedImage((image) => ({ ...image, scale: Math.min(1.85, image.scale + 0.14) }))
          break
        case "image_zoom_out":
          changeMode("image", command.feedback)
          updateSelectedImage((image) => ({ ...image, scale: Math.max(0.54, image.scale - 0.14) }))
          break
        case "image_reset":
          resetImages()
          break
        case "image_hide":
          updateSelectedImage((image) => ({ ...image, visible: false }))
          break
        case "drawing_start":
          changeMode("drawing", command.feedback)
          setDrawingTool("pen")
          break
        case "drawing_pen":
          setDrawingTool("pen")
          addLog(command.feedback, "success")
          break
        case "drawing_eraser":
          setDrawingTool("eraser")
          addLog(command.feedback, "success")
          break
        case "drawing_color":
          setDrawingColor(command.color ?? DRAW_COLORS[(DRAW_COLORS.indexOf(drawingColor) + 1) % DRAW_COLORS.length])
          addLog(command.feedback, "success")
          break
        case "drawing_thicker":
          setDrawingSize((size) => Math.min(20, size + 2))
          break
        case "drawing_thinner":
          setDrawingSize((size) => Math.max(2, size - 2))
          break
        case "drawing_clear":
          clearDrawing()
          break
        case "drawing_undo":
          undoDrawing()
          break
        case "drawing_save":
          saveDrawing()
          break
        case "effect_trigger":
          changeMode("effects", command.feedback)
          pushEffect(command.effectId ?? "particle_burst")
          break
        case "game_start":
        case "game_switch":
          switchMiniGame(command.miniGameId)
          break
        case "three_show":
          setThreeVisible(true)
          changeMode("three", command.feedback)
          break
        case "three_hide":
          setThreeVisible(false)
          addLog(command.feedback, "success")
          break
        case "music_play":
          void startMusic()
          break
        case "music_pause":
          pauseMusic()
          break
        case "music_next":
          setTrackIndex((index) => (index + 1) % MUSIC_TRACKS.length)
          if (musicPlaying) window.setTimeout(() => void startMusic(), 20)
          break
        case "music_prev":
          setTrackIndex((index) => (index - 1 + MUSIC_TRACKS.length) % MUSIC_TRACKS.length)
          if (musicPlaying) window.setTimeout(() => void startMusic(), 20)
          break
        case "music_volume_up":
          applyVolume(volume + 0.12)
          break
        case "music_volume_down":
          applyVolume(volume - 0.12)
          break
        case "music_mute":
          applyVolume(volume, !muted)
          break
        case "reset_all":
          resetImages()
          clearDrawing()
          particlesRef.current = []
          comboManagerRef.current.reset()
          setThreeScale(1)
          addLog(command.feedback, "success")
          break
        default:
          addLog(command.feedback, "warning")
      }
    },
    [
      addLog,
      applyVolume,
      changeMode,
      clearDrawing,
      drawingColor,
      musicPlaying,
      muted,
      nextImage,
      pauseMusic,
      previousImage,
      pushEffect,
      requestWeather,
      resetImages,
      saveDrawing,
      startMusic,
      switchMiniGame,
      undoDrawing,
      updateSelectedImage,
      volume,
    ],
  )

  const startVoice = useCallback(() => {
    const SpeechRecognition =
      (window as typeof window & { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor }).SpeechRecognition ??
      (window as typeof window & { webkitSpeechRecognition?: SpeechRecognitionConstructor }).webkitSpeechRecognition

    if (!SpeechRecognition) {
      setVoiceState("음성 인식 미지원")
      addLog("현재 브라우저는 Web Speech API 음성 인식을 지원하지 않습니다.", "warning")
      return
    }

    recognitionRef.current?.stop()
    const recognition = new SpeechRecognition()
    recognition.lang = "ko-KR"
    recognition.continuous = true
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    recognition.onresult = (event) => {
      const result = event.results[event.resultIndex]
      const transcript = result?.[0]?.transcript ?? ""
      if (!transcript) return
      dispatchCommand(parseKoreanCommand(transcript))
    }
    recognition.onerror = (event) => {
      setVoiceState(`음성 오류: ${event.error ?? "알 수 없음"}`)
    }
    recognition.onend = () => {
      if (recognitionRef.current === recognition) {
        recognitionRef.current = null
        setVoiceActive(false)
        setVoiceState("음성 대기")
      }
    }
    try {
      recognition.start()
      recognitionRef.current = recognition
      setVoiceActive(true)
      setVoiceState("한국어 명령 듣는 중")
      addLog("한국어 음성 인식을 시작했습니다.", "success")
    } catch {
      recognitionRef.current = null
      setVoiceActive(false)
      setVoiceState("음성 시작 실패")
      addLog("음성 인식을 시작하지 못했습니다. 브라우저 권한을 확인해 주세요.", "warning")
    }
  }, [addLog, dispatchCommand])

  const stopVoice = useCallback(() => {
    recognitionRef.current?.stop()
    recognitionRef.current = null
    setVoiceActive(false)
    setVoiceState("음성 대기")
    addLog("음성 인식을 멈췄습니다.", "info")
  }, [addLog])

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setTrackingMode("simulation")
      setCameraState("카메라 미지원, 마우스 시뮬레이션")
      addLog("카메라 API가 없어 마우스 시뮬레이션으로 전환했습니다.", "warning")
      return
    }

    try {
      setCameraState("카메라 권한 요청 중")
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720, facingMode: "user" }, audio: false })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }

      setCameraPreviewActive(true)
      setTrackingMode("camera")
      setCameraState("손 추적 모델 로딩")
      const vision = await import("@mediapipe/tasks-vision")
      const fileset = await vision.FilesetResolver.forVisionTasks("/mediapipe/wasm")

      const createLandmarker = (delegate: "GPU" | "CPU") =>
        vision.HandLandmarker.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath: "/models/hand_landmarker.task",
            delegate,
          },
          runningMode: "VIDEO",
          numHands: 2,
        })

      try {
        setCameraState("GPU 손 추적 모델 로딩")
        landmarkerRef.current = await createLandmarker("GPU")
        setCameraState("GPU 손 추적 중")
        addLog("GPU 손 추적을 시작했습니다.", "success")
      } catch (gpuError) {
        console.warn("GPU hand tracking initialization failed. Falling back to CPU.", gpuError)
        setCameraState("GPU 실패, CPU 재시도")
        landmarkerRef.current = await createLandmarker("CPU")
        setCameraState("CPU 손 추적 중")
        addLog("GPU 초기화에 실패해 CPU 손 추적으로 전환했습니다.", "warning")
      }
    } catch (error) {
      console.error(error)
      const hasCameraStream = Boolean(streamRef.current)
      setCameraPreviewActive(hasCameraStream)
      setTrackingMode(hasCameraStream ? "camera" : "simulation")
      setCameraState(hasCameraStream ? "카메라 표시 중, 손 추적 실패" : "카메라 실패, 마우스 시뮬레이션")
      addLog(
        hasCameraStream
          ? "카메라는 표시하지만 손 추적 모델은 시작하지 못했습니다."
          : "카메라 또는 손 추적 모델을 시작하지 못해 마우스 시뮬레이션으로 전환했습니다.",
        "warning",
      )
    }
  }, [addLog])

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setCameraPreviewActive(false)
    landmarkerRef.current?.close?.()
    landmarkerRef.current = null
    smoothedPointerRef.current = null
    lastCameraSnapshotRef.current = null
    lastHandDetectAtRef.current = 0
    setTrackingMode("simulation")
    setCameraState("마우스 시뮬레이션")
    addLog("카메라를 끄고 시뮬레이션으로 전환했습니다.", "info")
  }, [addLog])

  const drawAtPointer = useCallback(
    (point: Point, active: boolean) => {
      const canvas = drawingCanvasRef.current
      const context = canvas?.getContext("2d")
      const rect = stageRef.current?.getBoundingClientRect()
      if (!canvas || !context || !rect || !active) {
        lastDrawPointRef.current = null
        return
      }
      const current = { x: point.x * rect.width, y: point.y * rect.height }
      const previous = lastDrawPointRef.current
      if (!previous) {
        if (drawingHistoryRef.current.length > 18) drawingHistoryRef.current.shift()
        drawingHistoryRef.current.push(context.getImageData(0, 0, canvas.width, canvas.height))
        lastDrawPointRef.current = current
        return
      }

      context.save()
      context.lineCap = "round"
      context.lineJoin = "round"
      context.lineWidth = drawingTool === "eraser" ? drawingSize * 2.4 : drawingSize
      context.globalCompositeOperation = drawingTool === "eraser" ? "destination-out" : "source-over"
      context.strokeStyle = drawingColor
      context.shadowColor = drawingColor
      context.shadowBlur = drawingTool === "eraser" ? 0 : 12
      context.beginPath()
      context.moveTo(previous.x, previous.y)
      context.lineTo(current.x, current.y)
      context.stroke()
      context.restore()
      lastDrawPointRef.current = current
    },
    [drawingColor, drawingSize, drawingTool],
  )

  const handleGestureActions = useCallback(
    (nextSnapshot: GestureSnapshot) => {
      const now = nextSnapshot.timestamp
      const dominant = nextSnapshot.activeGesture
      const pinching = isPinching(nextSnapshot)
      const simulationIdlePoint = trackingMode === "simulation" && dominant === "point" && !pointerDownRef.current
      const combo = comboManagerRef.current.feed(dominant, now)
      nextSnapshot.comboProgress = combo.progress

      if (combo.triggered) {
        const action = combo.triggered.action
        if (action.type === "effect") {
          if (mode === "effects") {
            addLog(action.message, "success")
            pushEffect(action.effectId, nextSnapshot.pointer, 78)
          }
        } else {
          addLog(action.message, "success")
        }
        if (action.type === "image_next") nextImage()
        if (action.type === "mode") changeMode(action.mode, action.message)
        if (action.type === "reset") {
          resetImages()
          clearDrawing()
          particlesRef.current = []
        }
      }

      if (pinching && now - lastPinchUiRef.current > 650) {
        const rect = stageRef.current?.getBoundingClientRect()
        const element = rect
          ? document.elementFromPoint(rect.left + nextSnapshot.pointer.x * rect.width, rect.top + nextSnapshot.pointer.y * rect.height)
          : document.elementFromPoint(nextSnapshot.pointer.x * window.innerWidth, nextSnapshot.pointer.y * window.innerHeight)
        const target = element?.closest<HTMLElement>("[data-gesture-mode]")
        if (target?.dataset.gestureMode) {
          lastPinchUiRef.current = now
          changeMode(target.dataset.gestureMode as InteractiveMode)
        }
      }

      if (mode === "image") {
        if (nextSnapshot.swipe === "left" && shouldRun("swipe-left", now, 760)) previousImage()
        if (nextSnapshot.swipe === "right" && shouldRun("swipe-right", now, 760)) nextImage()
        if (pinching) {
          updateSelectedImage((image) => ({
            ...image,
            x: clamp(nextSnapshot.pointer.x, 0.16, 0.84),
            y: clamp(nextSnapshot.pointer.y, 0.2, 0.78),
            rotation: image.rotation + (nextSnapshot.primaryHand?.rotation ?? 0) * 0.22,
            visible: true,
          }))
        }
        if (Math.abs(nextSnapshot.twoHandDelta) > 0.012) {
          updateSelectedImage((image) => ({ ...image, scale: clamp(image.scale + nextSnapshot.twoHandDelta * 1.8, 0.55, 1.9) }))
        }
      }

      if (mode === "drawing") {
        const shouldDraw = nextSnapshot.activeGestures.includes("point") || pinching
        drawAtPointer(nextSnapshot.pointer, shouldDraw)
      } else {
        lastDrawPointRef.current = null
      }

      if (mode === "effects" && !simulationIdlePoint) {
        const effect = getEffectForSnapshot(nextSnapshot)
        if (effect && shouldRun("effect-global", now, 1180)) pushEffect(effect, nextSnapshot.pointer)
      }

      if (mode === "three") {
        if ((nextSnapshot.swipe === "left" || nextSnapshot.swipe === "right") && shouldRun("three-scene-swipe", now, 820)) {
          setThreeScene((scene) => getNextThreeScene(scene))
        }
        if (dominant === "fist" && shouldRun("three-scale-reset", now, 1200)) setThreeScale(1)
        if (Math.abs(nextSnapshot.twoHandDelta) > 0.008) setThreeScale((scale) => clamp(scale + nextSnapshot.twoHandDelta * 2.1, 0.55, 2.3))
      }
    },
    [addLog, changeMode, clearDrawing, drawAtPointer, mode, nextImage, previousImage, pushEffect, resetImages, trackingMode, updateSelectedImage],
  )

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      recognitionRef.current?.abort?.()
      streamRef.current?.getTracks().forEach((track) => track.stop())
      oscillatorRef.current?.stop()
      audioContextRef.current?.close()
      landmarkerRef.current?.close?.()
    }
  }, [])

  useEffect(() => {
    let raf = 0

    const loop = () => {
      if (!mountedRef.current) return
      const now = performance.now()
      let nextSnapshot = createSimulationSnapshot(pointerRef.current, pointerDownRef.current ? "pinch" : "point", now)

      const video = videoRef.current
      const landmarker = landmarkerRef.current
      if (trackingMode === "camera" && video && landmarker && video.readyState >= 2) {
        nextSnapshot = lastCameraSnapshotRef.current ?? nextSnapshot
        if (now - lastHandDetectAtRef.current >= HAND_TRACKING_INTERVAL_MS) {
          lastHandDetectAtRef.current = now
          try {
            const result = landmarker.detectForVideo(video, now)
            const recognized = recognizeGestureSnapshot({
              landmarks: result.landmarks ?? [],
              handednesses: result.handednesses,
              previousHistory: gestureHistoryRef.current,
              previousTwoHandDistance: previousTwoHandDistanceRef.current,
              timestamp: now,
            })
            gestureHistoryRef.current = recognized.history
            previousTwoHandDistanceRef.current = recognized.snapshot.twoHandDistance
            if (recognized.snapshot.hands.length > 0) {
              const mappedSnapshot = mirrorSnapshotForStage(recognized.snapshot, video, stageRef.current?.getBoundingClientRect())
              nextSnapshot = smoothSnapshotPointer(mappedSnapshot, smoothedPointerRef)
            } else {
              smoothedPointerRef.current = null
              nextSnapshot = recognized.snapshot
            }
            lastCameraSnapshotRef.current = nextSnapshot
          } catch {
            setCameraState("손 추적 재시도 중")
          }
        }
      }

      latestSnapshotRef.current = nextSnapshot
      handleGestureActions(nextSnapshot)
      if (now - lastSnapshotUiAtRef.current >= UI_SNAPSHOT_INTERVAL_MS) {
        lastSnapshotUiAtRef.current = now
        setSnapshot({ ...nextSnapshot })
      }
      raf = requestAnimationFrame(loop)
    }

    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [handleGestureActions, trackingMode])

  useEffect(() => {
    if (mode !== "effects") {
      particlesRef.current = []
      const canvas = effectsCanvasRef.current
      const context = canvas?.getContext("2d")
      const rect = stageRef.current?.getBoundingClientRect()
      if (canvas && context) context.clearRect(0, 0, rect?.width ?? canvas.width, rect?.height ?? canvas.height)
    }
  }, [mode])

  useEffect(() => {
    const resize = () => {
      const rect = stageRef.current?.getBoundingClientRect()
      ;[drawingCanvasRef.current, effectsCanvasRef.current, gameCanvasRef.current].forEach((canvas) => {
        if (!canvas || !rect) return
        const scale = Math.min(window.devicePixelRatio || 1, INTERACTIVE_CANVAS_MAX_DPR)
        const width = Math.floor(rect.width * scale)
        const height = Math.floor(rect.height * scale)
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width
          canvas.height = height
          canvas.style.width = `${rect.width}px`
          canvas.style.height = `${rect.height}px`
          const context = canvas.getContext("2d")
          context?.setTransform(scale, 0, 0, scale, 0, 0)
        }
      })
    }
    resize()
    window.addEventListener("resize", resize)
    return () => window.removeEventListener("resize", resize)
  }, [])

  useEffect(() => {
    let raf = 0
    let lastPaintAt = 0
    let canvasHadContent = false
    const render = (timestamp: number) => {
      const canvas = effectsCanvasRef.current
      const context = canvas?.getContext("2d")
      if (!canvas || !context) return
      const hasContent = mode === "effects" || particlesRef.current.length > 0
      if (!hasContent) {
        if (canvasHadContent) {
          context.clearRect(0, 0, canvas.width, canvas.height)
          canvasHadContent = false
        }
        raf = requestAnimationFrame(render)
        return
      }
      if (timestamp - lastPaintAt < EFFECT_FRAME_INTERVAL_MS) {
        raf = requestAnimationFrame(render)
        return
      }
      const frameScale = lastPaintAt > 0 ? Math.min((timestamp - lastPaintAt) / 16.67, 2.4) : 1
      lastPaintAt = timestamp
      canvasHadContent = true
      const rect = stageRef.current?.getBoundingClientRect()
      context.clearRect(0, 0, rect?.width ?? canvas.width, rect?.height ?? canvas.height)
      if (mode === "effects" && rect) {
        drawEffectField(context, rect, latestSnapshotRef.current.pointer, activeEffect, isPinching(latestSnapshotRef.current))
      }
      drawEffectParticles(context, particlesRef.current)
      particlesRef.current = stepEffectParticles(particlesRef.current, latestSnapshotRef.current.pointer, rect ?? undefined, frameScale)
      raf = requestAnimationFrame(render)
    }
    raf = requestAnimationFrame(render)
    return () => cancelAnimationFrame(raf)
  }, [activeEffect, mode])

  useEffect(() => {
    let raf = 0
    const render = () => {
      const canvas = gameCanvasRef.current
      const context = canvas?.getContext("2d")
      const rect = stageRef.current?.getBoundingClientRect()
      if (!canvas || !context || !rect) return

      if (mode === "game") {
        if (!gameRuntimeRef.current || gameRuntimeRef.current.id !== miniGame) {
          gameRuntimeRef.current = createMiniGameRuntime(miniGame)
        }
        const runtime = gameRuntimeRef.current
        const hud = stepMiniGame(runtime, rect, latestSnapshotRef.current.pointer, isPinching(latestSnapshotRef.current))
        if (runtime.frame % 3 === 0 || hud.status !== "playing") {
          setGameHud(hud)
        }
        drawMiniGame(context, rect, runtime, latestSnapshotRef.current.pointer)
      } else {
        context.clearRect(0, 0, rect.width, rect.height)
      }
      raf = requestAnimationFrame(render)
    }
    raf = requestAnimationFrame(render)
    return () => cancelAnimationFrame(raf)
  }, [miniGame, mode])

  useEffect(() => {
    if (gainNodeRef.current) gainNodeRef.current.gain.value = muted ? 0 : volume
  }, [muted, volume])

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = stageRef.current?.getBoundingClientRect()
    if (!rect) return
    pointerRef.current = {
      x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
      y: clamp((event.clientY - rect.top) / rect.height, 0, 1),
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <CustomCursor />
      <GrainOverlay />

      <div className="fixed inset-0 z-0" style={{ contain: "strict" }}>
        <Shader className="absolute inset-0 h-full w-full opacity-100">
          <Swirl colorA="#1275d8" colorB="#e19136" speed={0.8} detail={1.18} mixBlendMode="soft-light" />
          <ChromaFlow baseColor="#0066ff" upColor="#0066ff" leftColor="#e19136" rightColor="#e19136" downColor="#d1d1d1" opacity={0.97} range={0.22} speed={0.1} scale={1.8} />
        </Shader>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_24%_16%,rgba(0,102,255,0.34),transparent_28%),radial-gradient(circle_at_82%_36%,rgba(225,145,54,0.30),transparent_30%),linear-gradient(180deg,rgba(0,0,0,0.22),rgba(0,0,0,0.78))]" />
        <div className="absolute inset-0 bg-black/22" />
      </div>

      <section className="relative z-10 flex min-h-screen flex-col px-4 py-4 md:px-6 lg:px-8">
        <header className="relative z-[80] mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 rounded-lg border border-foreground/10 bg-background/24 px-4 py-3 shadow-2xl shadow-black/18 backdrop-blur-2xl">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              prefetch={false}
              className="grid h-10 w-10 place-items-center rounded-lg border border-foreground/12 bg-foreground/8 text-foreground/80 backdrop-blur-md transition hover:bg-foreground/14 hover:text-foreground"
              aria-label="처음 화면으로 돌아가기"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="grid h-10 w-10 place-items-center rounded-lg border border-foreground/12 bg-foreground/10 backdrop-blur-md">
              <Image
                src="/brand/gesture-bridge-mark-512.png"
                alt=""
                width={40}
                height={40}
                priority
                className="h-9 w-9 object-contain drop-shadow-[0_0_10px_rgba(225,145,54,0.4)]"
              />
            </div>
            <div>
              <h1 className="font-sans text-xl font-light tracking-tight md:text-2xl">인터랙티브 스테이지</h1>
              <p className="text-xs text-foreground/62 md:text-sm">손동작과 한국어 음성 명령을 한 화면에서 다루는 실행 스테이지</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ControlButton icon={Camera} label={trackingMode === "camera" ? "카메라 끄기" : "체험 시작"} onClick={trackingMode === "camera" ? stopCamera : startCamera} active={trackingMode === "camera"} />
            <ControlButton
              icon={trackingMode === "simulation" ? MousePointer2 : Hand}
              label={trackingMode === "simulation" ? "마우스 시뮬레이션" : "손 추적 중"}
              onClick={() => {
                smoothedPointerRef.current = null
                setTrackingMode("simulation")
              }}
            />
            <ControlButton icon={voiceActive ? MicOff : Mic} label={voiceActive ? "음성 끄기" : "음성 켜기"} onClick={voiceActive ? stopVoice : startVoice} active={voiceActive} />
            <ControlButton icon={HelpCircle} label={helpOpen ? "도움말 닫기" : "도움말"} onClick={() => setHelpOpen((value) => !value)} active={helpOpen} />
          </div>
        </header>

        <div className="mx-auto grid w-full max-w-7xl min-h-0 flex-1 gap-4 py-4 lg:grid-cols-[238px_minmax(0,1fr)_320px]">
          <aside className="order-2 grid gap-2 rounded-lg border border-foreground/10 bg-foreground/7 p-3 backdrop-blur-xl lg:order-1 lg:block lg:space-y-2">
            {MODE_ITEMS.map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.mode}
                  data-gesture-mode={item.mode}
                  onClick={() => changeMode(item.mode)}
                  className={`flex w-full items-center gap-3 rounded-lg border px-3 py-3 text-left transition ${
                    mode === item.mode
                      ? "border-foreground/38 bg-foreground/15 text-foreground shadow-lg shadow-black/18"
                      : "border-foreground/8 bg-background/16 text-foreground/72 hover:border-foreground/20 hover:bg-foreground/9 hover:text-foreground"
                  }`}
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-foreground/8">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{MODE_LABELS[item.mode]} 모드</span>
                    <span className="block truncate text-xs text-foreground/50">{item.helper}</span>
                  </span>
                </button>
              )
            })}
          </aside>

          <section
            ref={stageRef}
            onPointerMove={onPointerMove}
            onPointerDown={() => {
              pointerDownRef.current = true
            }}
            onPointerUp={() => {
              pointerDownRef.current = false
            }}
            onPointerLeave={() => {
              pointerDownRef.current = false
            }}
            className="relative order-1 min-h-[620px] overflow-hidden rounded-lg border border-foreground/14 bg-black/72 shadow-2xl shadow-black/34 backdrop-blur-xl lg:order-2"
          >
            <StageIdleBackdrop visible={!cameraPreviewActive && mode === "home"} />
            <video
              ref={videoRef}
              className={`absolute inset-0 z-0 h-full w-full scale-x-[-1] object-cover transition-opacity duration-300 ${
                cameraPreviewActive ? "opacity-100" : "opacity-0"
              }`}
              autoPlay
              playsInline
              muted
            />
            <canvas ref={drawingCanvasRef} className={`pointer-events-none absolute inset-0 z-20 transition-opacity duration-200 ${mode === "drawing" ? "opacity-100" : "opacity-0"}`} />
            <canvas ref={effectsCanvasRef} className="pointer-events-none absolute inset-0 z-30" />
            <canvas ref={gameCanvasRef} className={`pointer-events-none absolute inset-0 z-40 ${mode === "game" ? "opacity-100" : "opacity-0"}`} />

            <StageStatus mode={mode} cameraState={cameraState} voiceState={voiceState} snapshot={snapshot} />
            {mode === "weather" ? <WeatherPanel weather={weather} loading={weatherLoading} onRequest={() => void requestWeather("서울")} /> : null}
            {mode === "image" ? (
              <ImageModePanel
                images={images}
                selectedImageId={selectedImageId}
                onSelect={selectImage}
                onNext={nextImage}
                onPrevious={previousImage}
                onReset={resetImages}
                onHide={() => updateSelectedImage((image) => ({ ...image, visible: false }))}
                onZoomIn={() => updateSelectedImage((image) => ({ ...image, scale: Math.min(1.85, image.scale + 0.14) }))}
                onZoomOut={() => updateSelectedImage((image) => ({ ...image, scale: Math.max(0.54, image.scale - 0.14) }))}
              />
            ) : null}
            {mode === "satoru" ? <SatoruTechniquePanel /> : null}
            {mode === "particles" ? <CosmicParticlePlayground pointer={snapshot.pointer} activeGesture={snapshot.activeGesture} pinching={isPinching(snapshot)} /> : null}
            {mode === "effects" ? <EffectPanel activeEffect={activeEffect} effectPower={effectPower} onPower={setEffectPower} onTrigger={triggerEffectFromPanel} /> : null}
            {mode === "game" ? (
              <GamePanel
                definition={activeGameDefinition}
                hud={gameHud}
                selectedGame={miniGame}
                onSelect={switchMiniGame}
                onRestart={restartMiniGame}
                onNext={() => switchMiniGame()}
              />
            ) : null}
            {mode === "three" ? (
              <ThreeObjectPanel
                visible={threeVisible}
                snapshot={snapshot}
                scale={threeScale}
                sceneId={threeScene}
                quality={threeQuality}
                onVisible={setThreeVisible}
                onScene={setThreeScene}
                onQuality={setThreeQuality}
                onResetScale={() => setThreeScale(1)}
                onNextScene={() => setThreeScene((scene) => getNextThreeScene(scene))}
              />
            ) : null}
            {mode === "music" ? (
              <MusicPanel
                playing={musicPlaying}
                muted={muted}
                volume={volume}
                track={MUSIC_TRACKS[trackIndex]}
                pointer={snapshot.pointer}
                onPlay={() => void startMusic()}
                onPause={pauseMusic}
                onMute={() => applyVolume(volume, !muted)}
                onVolume={(next) => applyVolume(next)}
              />
            ) : null}

            <DrawingToolbar
              active={mode === "drawing"}
              tool={drawingTool}
              color={drawingColor}
              size={drawingSize}
              onTool={setDrawingTool}
              onColor={setDrawingColor}
              onSize={setDrawingSize}
              onUndo={undoDrawing}
              onClear={clearDrawing}
              onSave={saveDrawing}
            />

            <HandDebugOverlay snapshot={snapshot} />
            <VirtualPointer pointer={snapshot.pointer} gesture={snapshot.activeGesture} />
          </section>

          <aside className="order-3 grid min-h-0 gap-4 lg:grid-rows-[auto_minmax(0,1fr)]">
            <StatusCards selectedImage={selectedImage} activeEffect={activeEffectDefinition.label} activeGame={activeGameDefinition.label} weather={weather} />
            <div className="min-h-0 rounded-lg border border-foreground/10 bg-foreground/7 p-4 backdrop-blur-xl">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold">명령 로그</h2>
                <span className="text-xs text-foreground/42">최근 7개</span>
              </div>
              <div className="space-y-2 overflow-y-auto pr-1">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className={`rounded-lg border px-3 py-2 text-xs leading-relaxed ${
                      log.tone === "success"
                        ? "border-emerald-300/18 bg-emerald-300/8 text-emerald-50"
                        : log.tone === "warning"
                          ? "border-amber-300/18 bg-amber-300/8 text-amber-50"
                          : "border-foreground/10 bg-background/18 text-foreground/72"
                    }`}
                  >
                    {log.text}
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>

        {helpOpen ? (
          <footer className="mx-auto w-full max-w-7xl rounded-lg border border-foreground/10 bg-background/34 p-3 backdrop-blur-xl">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <p className="text-sm font-semibold">한국어 음성 명령 예시</p>
                <p className="mt-1 text-xs text-foreground/58">브라우저가 음성 인식을 지원하면 `음성 켜기` 후 말하세요. 카메라 권한이 없으면 마우스로 포인터를 시뮬레이션합니다.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {COMMAND_SAMPLES.map((sample) => (
                  <button
                    key={sample}
                    onClick={() => dispatchCommand(parseKoreanCommand(sample))}
                    className="rounded-lg border border-foreground/10 bg-foreground/7 px-3 py-2 text-xs text-foreground/76 transition hover:border-foreground/24 hover:bg-foreground/12 hover:text-foreground"
                  >
                    {sample}
                  </button>
                ))}
              </div>
            </div>
          </footer>
        ) : null}
      </section>
    </main>
  )

  function shouldRun(key: string, now: number, cooldown: number) {
    const last = lastGestureActionRef.current[key] ?? 0
    if (now - last < cooldown) return false
    lastGestureActionRef.current[key] = now
    return true
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
      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition ${
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

function StageIdleBackdrop({ visible }: { visible: boolean }) {
  return (
    <div
      className={`pointer-events-none absolute inset-0 z-[2] transition-opacity duration-500 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_28%_28%,rgba(18,117,216,0.34),transparent_30%),radial-gradient(circle_at_72%_62%,rgba(225,145,54,0.24),transparent_34%),linear-gradient(135deg,rgba(6,8,18,0.82),rgba(5,10,26,0.9))]" />
      <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.36),transparent)]" />
      <div className="absolute left-1/2 top-1/2 h-[min(58vw,520px)] w-[min(58vw,520px)] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10 bg-white/[0.025] shadow-[0_0_80px_rgba(18,117,216,0.20)]" />
      <div className="absolute left-1/2 top-1/2 h-[min(34vw,310px)] w-[min(34vw,310px)] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#e19136]/18" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.055)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.045)_1px,transparent_1px)] bg-[size:64px_64px] opacity-20" />
      <div className="absolute left-1/2 top-1/2 w-[min(520px,80%)] -translate-x-1/2 -translate-y-1/2 text-center">
        <p className="text-[10px] uppercase tracking-[0.36em] text-white/42">gesture bridge</p>
        <h2 className="mt-3 text-3xl font-light tracking-tight text-white md:text-5xl">Interactive Stage</h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-white/58">카메라를 켜면 손 포인터가 실제 영상 비율에 맞춰 보정됩니다.</p>
      </div>
    </div>
  )
}

function StageStatus({
  mode,
  cameraState,
  voiceState,
  snapshot,
}: {
  mode: InteractiveMode
  cameraState: string
  voiceState: string
  snapshot: GestureSnapshot
}) {
  return (
    <div className="absolute left-4 right-4 top-4 z-50 flex flex-wrap items-center justify-between gap-3">
      <div className="rounded-lg border border-foreground/10 bg-background/42 px-4 py-3 backdrop-blur-xl">
        <p className="text-xs text-foreground/48">현재 모드</p>
        <p className="text-lg font-semibold">{MODE_LABELS[mode]} 모드</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Chip icon={Camera} text={cameraState} />
        <Chip icon={Mic} text={voiceState} />
        <Chip icon={Layers} text={`제스처: ${GESTURE_LABELS[snapshot.activeGesture]}`} />
        <Chip icon={Hand} text={handStatusText(snapshot)} />
        <Chip icon={WandSparkles} text={`콤보: ${snapshot.comboProgress.length ? snapshot.comboProgress.join(" → ") : "대기"}`} />
      </div>
    </div>
  )
}

function Chip({ icon: Icon, text }: { icon: typeof Camera; text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-foreground/10 bg-background/42 px-3 py-2 text-xs text-foreground/72 backdrop-blur-xl">
      <Icon className="h-3.5 w-3.5 text-foreground/80" />
      <span>{text}</span>
    </div>
  )
}

function HandDebugOverlay({ snapshot }: { snapshot: GestureSnapshot }) {
  if (!snapshot.hands.length) return null

  return (
    <svg className="pointer-events-none absolute inset-0 z-[60] h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      {snapshot.hands.map((hand, handIndex) => {
        const color = handIndex === 0 ? "rgba(103,232,249,0.82)" : "rgba(250,204,21,0.72)"
        return (
          <g key={hand.id}>
            {HAND_CONNECTIONS.map(([start, end]) => {
              const left = hand.landmarks[start]
              const right = hand.landmarks[end]
              if (!left || !right) return null
              return (
                <line
                  key={`${start}-${end}`}
                  x1={left.x * 100}
                  y1={left.y * 100}
                  x2={right.x * 100}
                  y2={right.y * 100}
                  stroke={color}
                  strokeWidth="0.22"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              )
            })}
            {hand.landmarks.map((landmark, index) => (
              <circle
                key={index}
                cx={landmark.x * 100}
                cy={landmark.y * 100}
                r={index === 8 ? 0.64 : index === 4 ? 0.52 : 0.36}
                fill={index === 8 ? "rgba(255,255,255,0.95)" : color}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </g>
        )
      })}
    </svg>
  )
}

function WeatherPanel({ weather, loading, onRequest }: { weather: WeatherInfo | null; loading: boolean; onRequest: () => void }) {
  return (
    <div className="absolute bottom-5 left-5 z-50 w-[min(390px,calc(100%-40px))] rounded-lg border border-foreground/12 bg-background/46 p-5 shadow-2xl shadow-black/30 backdrop-blur-xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs text-foreground/58">날씨 어시스턴트</p>
          <h2 className="mt-1 text-2xl font-semibold">{loading ? "확인 중" : weather ? `${weather.city} 날씨` : "날씨 준비"}</h2>
        </div>
        <CloudSun className="h-8 w-8 text-foreground/84" />
      </div>
      {weather ? (
        <div className="mt-5 grid grid-cols-2 gap-3">
          <WeatherMetric label="현재" value={`${weather.temperature}°C`} />
          <WeatherMetric label="상태" value={weather.condition} />
          <WeatherMetric label="체감" value={`${weather.feelsLike ?? weather.temperature}°C`} />
          <WeatherMetric label="풍속" value={`${weather.windSpeed ?? 0} m/s`} />
        </div>
      ) : (
        <p className="mt-4 text-sm leading-relaxed text-foreground/62">“날씨 알려줘” 또는 “부산 날씨 알려줘”라고 말하면 패널이 열립니다.</p>
      )}
      {weather?.isMock ? <p className="mt-4 text-xs text-amber-100/72">실시간 API 연결에 실패해 대체 데이터를 표시 중입니다. `weather-service`에서 API 구조를 교체할 수 있습니다.</p> : null}
      <button onClick={onRequest} className="mt-4 rounded-lg border border-foreground/12 bg-foreground/8 px-3 py-2 text-xs text-foreground/76 transition hover:bg-foreground/14">
        서울 날씨 새로고침
      </button>
    </div>
  )
}

function WeatherMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-foreground/10 bg-foreground/7 p-3">
      <p className="text-[10px] text-foreground/48">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  )
}

function ImageModePanel({
  images,
  selectedImageId,
  onSelect,
  onNext,
  onPrevious,
  onReset,
  onHide,
  onZoomIn,
  onZoomOut,
}: {
  images: FloatingImagePanel[]
  selectedImageId: number
  onSelect: (imageId: number) => void
  onNext: () => void
  onPrevious: () => void
  onReset: () => void
  onHide: () => void
  onZoomIn: () => void
  onZoomOut: () => void
}) {
  const selectedImage = images.find((image) => image.id === selectedImageId) ?? images[0]
  const sortedImages = [...images].sort((left, right) => {
    if (left.id === selectedImageId) return 1
    if (right.id === selectedImageId) return -1
    return left.id - right.id
  })

  return (
    <div className="pointer-events-none absolute inset-0 z-[26]">
      {sortedImages.map((image) => {
        if (!image.visible) return null
        const active = image.id === selectedImageId
        const width = active ? 360 * image.scale : 260 * image.scale
        return (
          <button
            key={image.id}
            onClick={() => onSelect(image.id)}
            className={`pointer-events-auto absolute overflow-hidden rounded-lg border bg-background/70 text-left shadow-2xl shadow-black/28 transition-all duration-300 ${
              active ? "z-20 border-white/48 ring-2 ring-white/12" : "z-10 border-white/16 opacity-82 hover:opacity-100"
            }`}
            style={{
              left: `${image.x * 100}%`,
              top: `${image.y * 100}%`,
              width: `${Math.round(width)}px`,
              maxWidth: "min(72vw, 430px)",
              transform: `translate(-50%, -50%) rotate(${image.rotation}deg)`,
            }}
            aria-label={`${image.title} 선택`}
          >
            <div className="relative aspect-[16/10] w-full">
              <Image src={image.src} alt={image.title} fill sizes="430px" className="object-cover" priority={active} />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_54%,rgba(0,0,0,0.62))]" />
              <div className="absolute bottom-0 left-0 right-0 p-3">
                <p className="truncate text-sm font-semibold text-white">{image.title}</p>
                <p className="mt-0.5 text-[10px] text-white/62">{active ? "선택됨 · 집기로 이동" : "클릭해서 선택"}</p>
              </div>
            </div>
          </button>
        )
      })}

      <div className="pointer-events-auto absolute bottom-4 left-4 w-[min(520px,calc(100%-32px))] rounded-lg border border-foreground/10 bg-background/72 p-3 shadow-lg shadow-black/20">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-foreground/48">사진 패널 · 손 제어</p>
            <h2 className="mt-1 truncate text-lg font-semibold">{selectedImage?.title ?? "사진 없음"}</h2>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <IconButton label="이전 사진" onClick={onPrevious}>
              <ChevronRight className="h-4 w-4 rotate-180" />
            </IconButton>
            <IconButton label="다음 사진" onClick={onNext}>
              <ChevronRight className="h-4 w-4" />
            </IconButton>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <IconButton label="확대" onClick={onZoomIn}>
            <Plus className="h-4 w-4" />
          </IconButton>
          <IconButton label="축소" onClick={onZoomOut}>
            <Minus className="h-4 w-4" />
          </IconButton>
          <IconButton label="숨기기" onClick={onHide}>
            <Trash2 className="h-4 w-4" />
          </IconButton>
          <button
            onClick={onReset}
            className="inline-flex items-center gap-1.5 rounded-lg border border-foreground/8 bg-foreground/6 px-2.5 py-2 text-xs text-foreground/66 transition hover:bg-foreground/11 hover:text-foreground"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            재배치
          </button>
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {images.map((image) => (
            <button
              key={image.id}
              onClick={() => onSelect(image.id)}
              className={`min-w-[120px] rounded-lg border p-2 text-left transition ${
                image.id === selectedImageId
                  ? "border-foreground/36 bg-foreground/14 text-foreground"
                  : "border-foreground/8 bg-foreground/6 text-foreground/68 hover:border-foreground/20 hover:bg-foreground/11 hover:text-foreground"
              }`}
            >
              <span className="mb-1.5 flex items-center gap-1.5 text-[10px] text-foreground/46">
                <ImageIcon className="h-3 w-3" />
                {image.visible ? "표시 중" : "숨김"}
              </span>
              <span className="block truncate text-xs font-semibold">{image.title}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="grid h-9 w-9 place-items-center rounded-lg border border-foreground/12 bg-foreground/8 text-foreground/78 transition hover:bg-foreground/14 hover:text-foreground"
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  )
}

const EffectPanel = memo(function EffectPanel({
  activeEffect,
  effectPower,
  onPower,
  onTrigger,
}: {
  activeEffect: EffectId
  effectPower: number
  onPower: (power: number) => void
  onTrigger: (effect: EffectId) => void
}) {
  const definition = getEffectDefinition(activeEffect)
  const powerOptions = [
    { label: "절제", value: 0.7 },
    { label: "표준", value: 1 },
    { label: "강화", value: 1.35 },
  ]

  return (
    <div className="absolute bottom-5 left-5 z-50 w-[min(560px,calc(100%-40px))] rounded-lg border border-foreground/10 bg-background/78 p-4 shadow-lg shadow-black/20">
      <div className="grid gap-4">
        <div>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-foreground/48">시각 효과 시스템 · {definition.category}</p>
              <h2 className="mt-1 truncate text-xl font-semibold">{definition.label}</h2>
            </div>
            <button
              onClick={() => onTrigger(activeEffect)}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-foreground/12 bg-foreground/10 text-foreground/82 transition hover:bg-foreground/16 hover:text-foreground"
              aria-label={`${definition.label} 효과 실행`}
            >
              <Sparkles className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-foreground/72">{definition.description}</p>
          <div className="mt-3 grid gap-2 text-xs text-foreground/58">
            <div className="flex items-center justify-between gap-3 rounded-lg border border-foreground/8 bg-foreground/6 px-3 py-2">
              <span>움직임</span>
              <span className="truncate text-foreground/78">{definition.motion}</span>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-foreground/8 bg-foreground/6 px-3 py-2">
              <span>제스처</span>
              <span className="truncate text-foreground/78">{definition.gestureHint}</span>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {powerOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => onPower(option.value)}
                className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${
                  Math.abs(effectPower - option.value) < 0.01
                    ? "border-foreground/36 bg-foreground/16 text-foreground"
                    : "border-foreground/8 bg-foreground/6 text-foreground/66 hover:bg-foreground/11 hover:text-foreground"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {EFFECT_DEFINITIONS.map((effect) => (
            <button
              key={effect.id}
              onClick={() => onTrigger(effect.id)}
              className={`min-w-[150px] rounded-lg border p-3 text-left transition ${
                activeEffect === effect.id
                  ? "border-foreground/36 bg-foreground/14 text-foreground shadow-lg shadow-black/18"
                  : "border-foreground/8 bg-foreground/6 text-foreground/70 hover:border-foreground/20 hover:bg-foreground/11 hover:text-foreground"
              }`}
            >
              <div className="mb-2 flex items-center gap-1.5">
                {effect.colors.map((color) => (
                  <span key={color} className="h-2.5 w-2.5 rounded-full border border-white/20" style={{ backgroundColor: color }} />
                ))}
              </div>
              <p className="truncate text-sm font-semibold">{effect.label}</p>
              <p className="mt-1 truncate text-[11px] text-foreground/48">{effect.category} · {effect.motion}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
})

function GamePanel({
  definition,
  hud,
  selectedGame,
  onSelect,
  onRestart,
  onNext,
}: {
  definition: ReturnType<typeof getMiniGameDefinition>
  hud: MiniGameHudState
  selectedGame: MiniGameId
  onSelect: (game: MiniGameId) => void
  onRestart: () => void
  onNext: () => void
}) {
  const statusText = hud.status === "cleared" ? "클리어" : hud.status === "danger" ? "위험" : `라운드 ${hud.round}`
  const [detailsOpen, setDetailsOpen] = useState(false)

  return (
    <div className="absolute bottom-5 left-5 z-50 w-[min(460px,calc(100%-40px))] rounded-lg border border-foreground/12 bg-background/40 p-3 shadow-2xl shadow-black/28 backdrop-blur-xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-foreground/58">제스처 미니게임 · {definition.skill}</p>
          <h2 className="mt-1 truncate text-xl font-semibold">{definition.label}</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDetailsOpen((value) => !value)}
            className={`grid h-9 w-9 place-items-center rounded-lg border transition ${
              detailsOpen ? "border-foreground/36 bg-foreground/16 text-foreground" : "border-foreground/10 bg-foreground/8 text-foreground/76 hover:bg-foreground/14 hover:text-foreground"
            }`}
            aria-label={detailsOpen ? "게임 설명 닫기" : "게임 설명 열기"}
          >
            <HelpCircle className="h-4 w-4" />
          </button>
          <button
            onClick={onRestart}
            className="grid h-9 w-9 place-items-center rounded-lg border border-foreground/10 bg-foreground/8 text-foreground/76 transition hover:bg-foreground/14 hover:text-foreground"
            aria-label="현재 게임 다시 시작"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            onClick={onNext}
            className="grid h-9 w-9 place-items-center rounded-lg border border-foreground/10 bg-foreground/8 text-foreground/76 transition hover:bg-foreground/14 hover:text-foreground"
            aria-label="다음 게임"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2">
        <GameMetric icon={Trophy} label="점수" value={`${hud.score}`} />
        <GameMetric icon={HeartPulse} label="기회" value={`${hud.lives}/3`} tone={hud.lives <= 1 ? "danger" : "default"} />
        <GameMetric icon={Crosshair} label="콤보" value={`${hud.combo}x`} />
        <GameMetric icon={Timer} label="남은 시간" value={`${hud.timeRemaining}s`} />
      </div>
      <div className="mt-3">
        <div className="flex items-center justify-between gap-3 text-[11px] text-foreground/58">
          <span>{statusText}</span>
          <span>목표 {hud.targetScore} · 정확도 {hud.accuracy}% · 최고 {hud.bestCombo}x</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-foreground/10">
          <div className="h-full rounded-full transition-[width] duration-200" style={{ width: `${hud.progress * 100}%`, backgroundColor: definition.accent }} />
        </div>
      </div>
      <p className="mt-2 truncate text-xs text-foreground/62">{hud.message}</p>
      {detailsOpen ? (
        <>
          <div className="mt-3 rounded-lg border border-foreground/10 bg-foreground/7 p-3">
            <p className="text-sm font-medium text-foreground/88">{definition.objective}</p>
            <p className="mt-2 text-[11px] text-foreground/46">입력: {definition.inputHint} · 음성: {definition.command}</p>
          </div>
          <div className="mt-3 grid max-h-28 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
            {MINI_GAME_DEFINITIONS.map((game) => (
              <button
                key={game.id}
                onClick={() => {
                  setDetailsOpen(false)
                  onSelect(game.id)
                }}
                className={`rounded-lg border px-3 py-2 text-left transition ${
                  selectedGame === game.id
                    ? "border-foreground/36 bg-foreground/16 text-foreground"
                    : "border-foreground/8 bg-foreground/6 text-foreground/68 hover:border-foreground/20 hover:bg-foreground/11 hover:text-foreground"
                }`}
              >
                <span className="block truncate text-xs font-semibold">{game.label}</span>
                <span className="mt-0.5 block truncate text-[10px] text-foreground/48">{game.skill}</span>
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}

function GameMetric({
  icon: Icon,
  label,
  value,
  tone = "default",
}: {
  icon: typeof Trophy
  label: string
  value: string
  tone?: "default" | "danger"
}) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${tone === "danger" ? "border-rose-300/24 bg-rose-300/10" : "border-foreground/10 bg-foreground/7"}`}>
      <div className="flex items-center gap-1.5 whitespace-nowrap text-[10px] text-foreground/48">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <p className="mt-1 text-lg font-semibold leading-none">{value}</p>
    </div>
  )
}

function ThreeObjectPanel({
  visible,
  scale,
  snapshot,
  sceneId,
  quality,
  onVisible,
  onScene,
  onQuality,
  onResetScale,
  onNextScene,
}: {
  visible: boolean
  snapshot: GestureSnapshot
  scale: number
  sceneId: ThreeSceneId
  quality: ThreeQuality
  onVisible: (visible: boolean) => void
  onScene: (scene: ThreeSceneId) => void
  onQuality: (quality: ThreeQuality) => void
  onResetScale: () => void
  onNextScene: () => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const runtimeRef = useRef<InteractiveThreeRuntime | null>(null)
  const latestRef = useRef({ snapshot, scale, sceneId, quality, visible })
  const [telemetry, setTelemetry] = useState<ThreeRuntimeTelemetry>({ calls: 0, triangles: 0, objects: 0 })
  const definition = getThreeSceneDefinition(sceneId)

  useEffect(() => {
    latestRef.current = { snapshot, scale, sceneId, quality, visible }
  }, [quality, scale, sceneId, snapshot, visible])

  useEffect(() => {
    if (!containerRef.current) return
    let disposed = false
    let raf = 0
    let resizeObserver: ResizeObserver | null = null
    let lastTelemetryAt = 0

    const init = async () => {
      const THREE = await import("three")
      if (disposed || !containerRef.current) return
      const runtime = new InteractiveThreeRuntime(THREE, containerRef.current, latestRef.current.sceneId, latestRef.current.quality)
      runtimeRef.current = runtime
      resizeObserver = new ResizeObserver(() => runtime.resize())
      resizeObserver.observe(containerRef.current)

      const animate = (timestamp: number) => {
        const latest = latestRef.current
        runtime.update({ ...latest, timestamp })
        if (timestamp - lastTelemetryAt > 650) {
          lastTelemetryAt = timestamp
          setTelemetry(runtime.telemetry())
        }
        raf = requestAnimationFrame(animate)
      }
      raf = requestAnimationFrame(animate)
    }

    void init()
    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      resizeObserver?.disconnect()
      runtimeRef.current?.dispose()
      runtimeRef.current = null
    }
  }, [])

  return (
    <div className="pointer-events-none absolute inset-0 z-[25]">
      <div ref={containerRef} className={`absolute inset-0 transition-opacity duration-300 ${visible ? "opacity-100" : "opacity-0"}`} />
      <div className="pointer-events-auto absolute bottom-4 left-4 w-[min(440px,calc(100%-32px))] rounded-lg border border-foreground/10 bg-background/72 p-3 shadow-lg shadow-black/20">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-foreground/48">3D 씬 · {definition.gestureFocus}</p>
            <h2 className="mt-1 truncate text-lg font-semibold">{definition.label}</h2>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={onNextScene}
              className="grid h-9 w-9 place-items-center rounded-lg border border-foreground/12 bg-foreground/8 text-foreground/78 transition hover:bg-foreground/14 hover:text-foreground"
              aria-label="다음 3D 씬"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              onClick={() => onVisible(!visible)}
              className="grid h-9 w-9 place-items-center rounded-lg border border-foreground/12 bg-foreground/8 text-foreground/78 transition hover:bg-foreground/14 hover:text-foreground"
              aria-label={visible ? "3D 숨기기" : "3D 표시"}
            >
              <Box className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
          <ThreeMetric label="배율" value={`${scale.toFixed(2)}x`} />
          <ThreeMetric label="드로우콜" value={`${telemetry.calls}`} />
          <ThreeMetric label="삼각형" value={compactNumber(telemetry.triangles)} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {THREE_QUALITY_OPTIONS.map((option) => (
            <button
              key={option.id}
              onClick={() => onQuality(option.id)}
              className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                quality === option.id
                  ? "border-foreground/36 bg-foreground/16 text-foreground"
                  : "border-foreground/8 bg-foreground/6 text-foreground/66 hover:bg-foreground/11 hover:text-foreground"
              }`}
            >
              {option.label}
            </button>
          ))}
          <button
            onClick={onResetScale}
            className="inline-flex items-center gap-1.5 rounded-lg border border-foreground/8 bg-foreground/6 px-2.5 py-1.5 text-xs text-foreground/66 transition hover:bg-foreground/11 hover:text-foreground"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            초기화
          </button>
        </div>
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {THREE_SCENE_DEFINITIONS.map((scene) => (
            <button
              key={scene.id}
              onClick={() => onScene(scene.id)}
              className={`min-w-[116px] rounded-lg border p-2.5 text-left transition ${
                sceneId === scene.id
                  ? "border-foreground/36 bg-foreground/14 text-foreground shadow-lg shadow-black/18"
                  : "border-foreground/8 bg-foreground/6 text-foreground/70 hover:border-foreground/20 hover:bg-foreground/11 hover:text-foreground"
              }`}
            >
              <span className="mb-1.5 block h-2 w-7 rounded-full border border-white/20" style={{ backgroundColor: scene.accent }} />
              <span className="block truncate text-xs font-semibold">{scene.label}</span>
              <span className="mt-1 block truncate text-[11px] text-foreground/48">{scene.gestureFocus}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="pointer-events-none absolute right-5 top-28 rounded-lg border border-foreground/10 bg-background/48 px-3 py-2 text-xs text-foreground/64">
        {visible ? `${snapshot.hands.length} hand · ${GESTURE_LABELS[snapshot.activeGesture]}` : "3D hidden"}
      </div>
    </div>
  )
}

function ThreeMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-foreground/8 bg-foreground/6 px-2.5 py-1.5">
      <p className="text-[10px] text-foreground/46">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-foreground/88">{value}</p>
    </div>
  )
}

function MusicPanel({
  playing,
  muted,
  volume,
  track,
  pointer,
  onPlay,
  onPause,
  onMute,
  onVolume,
}: {
  playing: boolean
  muted: boolean
  volume: number
  track: string
  pointer: Point
  onPlay: () => void
  onPause: () => void
  onMute: () => void
  onVolume: (value: number) => void
}) {
  const bars = Array.from({ length: 24 }, (_, index) => 0.26 + Math.abs(Math.sin(index * 0.7 + pointer.x * 5)) * (playing ? volume : 0.15))
  return (
    <div className="absolute bottom-5 left-5 right-5 z-50 rounded-lg border border-foreground/12 bg-background/44 p-4 backdrop-blur-xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs text-foreground/58">음악 제어</p>
          <h2 className="text-xl font-semibold">{track}</h2>
        </div>
        <div className="flex items-center gap-2">
          <ControlButton icon={playing ? Pause : Play} label={playing ? "멈춤" : "재생"} onClick={playing ? onPause : onPlay} active={playing} />
          <ControlButton icon={muted ? VolumeX : Volume2} label={muted ? "음소거" : "볼륨"} onClick={onMute} active={!muted} />
        </div>
      </div>
      <div className="mt-4 flex h-24 items-end gap-1 rounded-lg border border-foreground/10 bg-background/20 p-3">
        {bars.map((height, index) => (
          <span key={index} className="flex-1 rounded-t bg-foreground/65" style={{ height: `${height * 100}%` }} />
        ))}
      </div>
      <input
        aria-label="볼륨"
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={volume}
        onChange={(event) => onVolume(Number(event.target.value))}
        className="mt-4 w-full"
      />
    </div>
  )
}

function DrawingToolbar({
  active,
  tool,
  color,
  size,
  onTool,
  onColor,
  onSize,
  onUndo,
  onClear,
  onSave,
}: {
  active: boolean
  tool: DrawingTool
  color: string
  size: number
  onTool: (tool: DrawingTool) => void
  onColor: (color: string) => void
  onSize: (size: number) => void
  onUndo: () => void
  onClear: () => void
  onSave: () => void
}) {
  if (!active) return null

  return (
    <div className="absolute bottom-5 left-5 right-5 z-50 flex flex-wrap items-center gap-2 rounded-lg border border-foreground/10 bg-background/44 p-3 backdrop-blur-xl">
      <ControlButton icon={Paintbrush} label="펜" onClick={() => onTool("pen")} active={tool === "pen"} />
      <ControlButton icon={Eraser} label="지우개" onClick={() => onTool("eraser")} active={tool === "eraser"} />
      <div className="flex items-center gap-1 rounded-lg border border-foreground/10 bg-foreground/6 p-1">
        {DRAW_COLORS.map((drawColor) => (
          <button
            key={drawColor}
            onClick={() => onColor(drawColor)}
            className={`h-7 w-7 rounded-md border transition ${drawColor === color ? "border-foreground" : "border-foreground/16"}`}
            style={{ background: drawColor }}
            aria-label={`${drawColor} 색상`}
          />
        ))}
      </div>
      <label className="flex min-w-[160px] items-center gap-2 rounded-lg border border-foreground/10 bg-foreground/6 px-3 py-2 text-xs text-foreground/72">
        굵기
        <input type="range" min={2} max={20} value={size} onChange={(event) => onSize(Number(event.target.value))} className="min-w-0 flex-1" />
      </label>
      <ControlButton icon={Undo2} label="되돌리기" onClick={onUndo} />
      <ControlButton icon={Trash2} label="전체 지우기" onClick={onClear} />
      <ControlButton icon={Save} label="저장" onClick={onSave} />
    </div>
  )
}

function StatusCards({
  selectedImage,
  activeEffect,
  activeGame,
  weather,
}: {
  selectedImage?: FloatingImagePanel
  activeEffect: string
  activeGame: string
  weather: WeatherInfo | null
}) {
  const items = [
    { label: "선택 사진", value: selectedImage?.title ?? "없음" },
    { label: "활성 효과", value: activeEffect },
    { label: "미니게임", value: activeGame },
    { label: "날씨", value: weather ? `${weather.city} ${weather.temperature}°C` : "요청 전" },
  ]
  return (
    <div className="grid grid-cols-2 gap-3">
      {items.map((item) => (
        <div key={item.label} className="rounded-lg border border-foreground/10 bg-foreground/7 p-4 backdrop-blur-xl">
          <p className="text-[10px] text-foreground/42">{item.label}</p>
          <p className="mt-1 truncate text-sm font-semibold text-foreground/86">{item.value}</p>
        </div>
      ))}
    </div>
  )
}

function VirtualPointer({ pointer, gesture }: { pointer: Point; gesture: GestureName }) {
  return (
    <div
      className="pointer-events-none absolute z-[70] -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${pointer.x * 100}%`, top: `${pointer.y * 100}%` }}
    >
      <div className={`grid h-12 w-12 place-items-center rounded-full border backdrop-blur-md ${gesture === "pinch" ? "border-[#f2554a]/60 bg-[#f2554a]/16" : "border-foreground/70 bg-foreground/12"}`}>
        <MousePointer2 className="h-5 w-5 text-foreground" />
      </div>
      <div className="absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-background/60 px-2 py-1 text-[10px] text-foreground/72">
        {GESTURE_LABELS[gesture]}
      </div>
    </div>
  )
}

function handStatusText(snapshot: GestureSnapshot) {
  const hand = snapshot.primaryHand
  if (!hand) return "손 0 · 대기"
  const fingers = [
    hand.fingers.thumb ? "엄" : "",
    hand.fingers.index ? "검" : "",
    hand.fingers.middle ? "중" : "",
    hand.fingers.ring ? "약" : "",
    hand.fingers.pinky ? "소" : "",
  ].join("") || "접힘"
  return `손 ${snapshot.hands.length} · ${fingers} · 집기 ${Math.round(hand.pinchStrength * 100)}%`
}

function isPinching(snapshot: GestureSnapshot) {
  return snapshot.activeGestures.includes("pinch") || (snapshot.primaryHand?.pinchStrength ?? 0) > 0.62
}

function getEffectForSnapshot(snapshot: GestureSnapshot) {
  const gesture = EFFECT_GESTURE_PRIORITY.find((item) => snapshot.activeGestures.includes(item) && EFFECT_BY_GESTURE[item])
  return gesture ? EFFECT_BY_GESTURE[gesture] : null
}

function createSimulationSnapshot(pointer: Point, gesture: GestureName, timestamp: number): GestureSnapshot {
  return {
    hands: [],
    primaryHand: null,
    pointer,
    activeGesture: gesture,
    activeGestures: [gesture],
    swipe: null,
    twoHandDistance: null,
    twoHandDelta: 0,
    comboProgress: [],
    timestamp,
  }
}

function mirrorSnapshotForStage(snapshot: GestureSnapshot, video?: HTMLVideoElement | null, rect?: DOMRect | null): GestureSnapshot {
  const mirrorGesture = (gesture: GestureName): GestureName => {
    if (gesture === "swipe_left") return "swipe_right"
    if (gesture === "swipe_right") return "swipe_left"
    return gesture
  }
  const mirroredSwipe = snapshot.swipe === "left" ? "right" : snapshot.swipe === "right" ? "left" : null
  const mapPoint = (point: Point) => mapCameraPointToStage(point, video, rect)
  const mapHand = (hand: GestureSnapshot["hands"][number]) => ({
    ...hand,
    landmarks: hand.landmarks.map((landmark) => ({
      ...landmark,
      ...mapPoint(landmark),
    })),
    center: mapPoint(hand.center),
    pointer: mapPoint(hand.pointer),
  })
  const hands = snapshot.hands.map(mapHand)
  const primaryHand = snapshot.primaryHand ? hands.find((hand) => hand.id === snapshot.primaryHand?.id) ?? mapHand(snapshot.primaryHand) : null

  return {
    ...snapshot,
    hands,
    primaryHand,
    pointer: mapPoint(snapshot.pointer),
    activeGesture: mirrorGesture(snapshot.activeGesture),
    activeGestures: snapshot.activeGestures.map(mirrorGesture),
    swipe: mirroredSwipe,
  }
}

function mapCameraPointToStage(point: Point, video?: HTMLVideoElement | null, rect?: DOMRect | null): Point {
  const mirroredX = 1 - point.x
  if (!video || !rect || !video.videoWidth || !video.videoHeight) {
    return { x: clamp(mirroredX, 0, 1), y: clamp(point.y, 0, 1) }
  }

  const scale = Math.max(rect.width / video.videoWidth, rect.height / video.videoHeight)
  const displayWidth = video.videoWidth * scale
  const displayHeight = video.videoHeight * scale
  const cropX = (displayWidth - rect.width) / 2
  const cropY = (displayHeight - rect.height) / 2

  return {
    x: clamp((mirroredX * displayWidth - cropX) / rect.width, 0, 1),
    y: clamp((point.y * displayHeight - cropY) / rect.height, 0, 1),
  }
}

function smoothSnapshotPointer(snapshot: GestureSnapshot, pointerRef: { current: Point | null }): GestureSnapshot {
  if (!snapshot.primaryHand) {
    pointerRef.current = null
    return snapshot
  }
  const previous = pointerRef.current
  const nextPointer = previous
    ? {
        x: previous.x + (snapshot.pointer.x - previous.x) * 0.58,
        y: previous.y + (snapshot.pointer.y - previous.y) * 0.58,
      }
    : snapshot.pointer
  pointerRef.current = nextPointer
  const primaryHand = { ...snapshot.primaryHand, pointer: nextPointer }

  return {
    ...snapshot,
    pointer: nextPointer,
    primaryHand,
    hands: snapshot.hands.map((hand) => (hand.id === primaryHand.id ? primaryHand : hand)),
  }
}

function compactNumber(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`
  return `${value}`
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
