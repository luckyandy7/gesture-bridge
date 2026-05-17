"use client"

import Image from "next/image"
import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import {
  ArrowLeft,
  Box,
  Camera,
  CloudSun,
  Eraser,
  Gamepad2,
  Hand,
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
  Save,
  Settings,
  Sparkles,
  Trash2,
  Undo2,
  WandSparkles,
  Volume2,
  VolumeX,
} from "lucide-react"
import { CustomCursor } from "@/components/custom-cursor"
import { GrainOverlay } from "@/components/grain-overlay"
import { createEffectParticles, EFFECT_DEFINITIONS, getEffectDefinition, type EffectParticle } from "@/lib/interactive/features/effects"
import { getMiniGameDefinition, getNextMiniGame } from "@/lib/interactive/features/mini-games"
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

type GameObject = {
  id: number
  x: number
  y: number
  vx: number
  vy: number
  r: number
  kind: string
  life: number
  color: string
}

type MiniGameRuntime = {
  id: MiniGameId
  score: number
  lives: number
  objects: GameObject[]
  ball?: GameObject
  target?: GameObject
  timer: number
  lastSpawn: number
  lastPinch: boolean
  message: string
  pointerTrail: Point[]
}

const MODE_LABELS: Record<InteractiveMode, string> = {
  home: "홈",
  image: "사진",
  drawing: "그림",
  weather: "날씨",
  effects: "효과",
  game: "게임",
  three: "3D",
  music: "음악",
  settings: "설정",
}

const MODE_ITEMS: Array<{ mode: InteractiveMode; icon: typeof Home; helper: string }> = [
  { mode: "home", icon: Home, helper: "전체 상태" },
  { mode: "image", icon: ImageIcon, helper: "집고 이동" },
  { mode: "drawing", icon: Paintbrush, helper: "공중 드로잉" },
  { mode: "weather", icon: CloudSun, helper: "한국어 날씨" },
  { mode: "effects", icon: Sparkles, helper: "제스처 효과" },
  { mode: "game", icon: Gamepad2, helper: "미니게임" },
  { mode: "three", icon: Box, helper: "입체 조작" },
  { mode: "music", icon: Music, helper: "미디어 제어" },
  { mode: "settings", icon: Settings, helper: "명령 도움말" },
]

const INITIAL_IMAGES: FloatingImagePanel[] = [
  {
    id: 1,
    title: "손동작 제어",
    src: "/gesture-control-mode.png",
    x: 0.32,
    y: 0.36,
    scale: 1,
    rotation: -4,
    visible: true,
  },
  {
    id: 2,
    title: "수화 텍스트",
    src: "/sign-text-mode.png",
    x: 0.66,
    y: 0.54,
    scale: 0.92,
    rotation: 5,
    visible: true,
  },
  {
    id: 3,
    title: "인터랙티브 체험",
    src: "/interactive-experience-mode.png",
    x: 0.48,
    y: 0.72,
    scale: 0.84,
    rotation: 0,
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
  const lastPinchUiRef = useRef(0)
  const mountedRef = useRef(false)

  const [mode, setMode] = useState<InteractiveMode>("home")
  const [cameraState, setCameraState] = useState("카메라 대기")
  const [voiceState, setVoiceState] = useState("음성 대기")
  const [voiceActive, setVoiceActive] = useState(false)
  const [trackingMode, setTrackingMode] = useState<"camera" | "simulation">("simulation")
  const [snapshot, setSnapshot] = useState<GestureSnapshot>(createEmptyGestureSnapshot())
  const [logs, setLogs] = useState<InteractionLog[]>([{ id: 0, text: "체험 시작 버튼으로 카메라를 켜거나 마우스 시뮬레이션을 사용하세요.", tone: "info" }])
  const [images, setImages] = useState<FloatingImagePanel[]>(INITIAL_IMAGES)
  const [selectedImageId, setSelectedImageId] = useState(1)
  const [weather, setWeather] = useState<WeatherInfo | null>(null)
  const [weatherLoading, setWeatherLoading] = useState(false)
  const [drawingTool, setDrawingTool] = useState<DrawingTool>("pen")
  const [drawingColor, setDrawingColor] = useState(DRAW_COLORS[0])
  const [drawingSize, setDrawingSize] = useState(5)
  const [activeEffect, setActiveEffect] = useState<EffectId>("particle_burst")
  const [miniGame, setMiniGame] = useState<MiniGameId>("catch")
  const [gameScore, setGameScore] = useState(0)
  const [gameMessage, setGameMessage] = useState("손 포인터를 움직여 게임을 시작하세요.")
  const [threeVisible, setThreeVisible] = useState(true)
  const [threeScale, setThreeScale] = useState(1)
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
      setActiveEffect(effectId)
      particlesRef.current.push(...createEffectParticles(effectId, x, y, Math.floor(performance.now()), amount))
      addLog(`${getEffectDefinition(effectId).label} 효과를 실행했습니다.`, "success")
    },
    [addLog],
  )

  const resetImages = useCallback(() => {
    setImages(INITIAL_IMAGES)
    setSelectedImageId(1)
  }, [])

  const updateSelectedImage = useCallback((updater: (image: FloatingImagePanel) => FloatingImagePanel) => {
    setImages((previous) => previous.map((image) => (image.id === selectedImageId ? updater(image) : image)))
  }, [selectedImageId])

  const nextImage = useCallback(() => {
    setImages((previous) => {
      const visible = previous.filter((image) => image.visible)
      if (visible.length === 0) return previous.map((image) => ({ ...image, visible: true }))
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
      if (visible.length === 0) return previous.map((image) => ({ ...image, visible: true }))
      const index = visible.findIndex((image) => image.id === selectedImageId)
      const next = visible[(index - 1 + visible.length) % visible.length]
      setSelectedImageId(next.id)
      return previous
    })
    addLog("이전 사진을 선택했습니다.", "success")
  }, [addLog, selectedImageId])

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
      setMiniGame(target)
      gameRuntimeRef.current = null
      changeMode("game", `${getMiniGameDefinition(target).label} 게임을 시작합니다.`)
    },
    [changeMode, miniGame],
  )

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

      setCameraState("손 추적 모델 로딩")
      const vision = await import("@mediapipe/tasks-vision")
      const fileset = await vision.FilesetResolver.forVisionTasks("/mediapipe/wasm")
      landmarkerRef.current = await vision.HandLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: "/models/hand_landmarker.task",
          delegate: "CPU",
        },
        runningMode: "VIDEO",
        numHands: 2,
      })

      setTrackingMode("camera")
      setCameraState("카메라 손 추적 중")
      addLog("카메라 손 추적을 시작했습니다.", "success")
    } catch (error) {
      console.error(error)
      setTrackingMode("simulation")
      setCameraState("카메라 실패, 마우스 시뮬레이션")
      addLog("카메라 또는 손 추적 모델을 시작하지 못해 마우스 시뮬레이션으로 전환했습니다.", "warning")
    }
  }, [addLog])

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    landmarkerRef.current?.close?.()
    landmarkerRef.current = null
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
      const combo = comboManagerRef.current.feed(dominant, now)
      nextSnapshot.comboProgress = combo.progress

      if (combo.triggered) {
        const action = combo.triggered.action
        addLog(action.message, "success")
        if (action.type === "effect") pushEffect(action.effectId, nextSnapshot.pointer, 78)
        if (action.type === "image_next") nextImage()
        if (action.type === "mode") changeMode(action.mode, action.message)
        if (action.type === "reset") {
          resetImages()
          clearDrawing()
          particlesRef.current = []
        }
      }

      if (dominant === "pinch" && now - lastPinchUiRef.current > 650) {
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
        if (dominant === "pinch") {
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
        const shouldDraw = dominant === "point" || dominant === "pinch"
        drawAtPointer(nextSnapshot.pointer, shouldDraw)
      } else {
        lastDrawPointRef.current = null
      }

      if (mode === "effects") {
        const effect = EFFECT_BY_GESTURE[dominant]
        if (effect && shouldRun(`effect-${effect}`, now, 900)) pushEffect(effect, nextSnapshot.pointer)
      }

      if (mode === "three") {
        if (Math.abs(nextSnapshot.twoHandDelta) > 0.008) setThreeScale((scale) => clamp(scale + nextSnapshot.twoHandDelta * 2.1, 0.55, 2.3))
      }
    },
    [addLog, changeMode, clearDrawing, drawAtPointer, mode, nextImage, previousImage, pushEffect, resetImages, updateSelectedImage],
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
          if (recognized.snapshot.hands.length > 0) nextSnapshot = mirrorSnapshotForStage(recognized.snapshot)
        } catch {
          setCameraState("손 추적 재시도 중")
        }
      }

      latestSnapshotRef.current = nextSnapshot
      handleGestureActions(nextSnapshot)
      setSnapshot({ ...nextSnapshot })
      raf = requestAnimationFrame(loop)
    }

    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [handleGestureActions, trackingMode])

  useEffect(() => {
    const resize = () => {
      const rect = stageRef.current?.getBoundingClientRect()
      ;[drawingCanvasRef.current, effectsCanvasRef.current, gameCanvasRef.current].forEach((canvas) => {
        if (!canvas || !rect) return
        const scale = window.devicePixelRatio || 1
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
    const render = () => {
      const canvas = effectsCanvasRef.current
      const context = canvas?.getContext("2d")
      if (!canvas || !context) return
      const rect = stageRef.current?.getBoundingClientRect()
      context.clearRect(0, 0, rect?.width ?? canvas.width, rect?.height ?? canvas.height)
      drawParticles(context, particlesRef.current)
      particlesRef.current = particlesRef.current
        .map((particle) => ({
          ...particle,
          x: particle.x + particle.vx,
          y: particle.y + particle.vy,
          vx: particle.vx * 0.985,
          vy: particle.vy * 0.985,
          life: particle.life - 1 / particle.maxLife,
          spin: particle.spin + 0.006,
        }))
        .filter((particle) => particle.life > 0)
      raf = requestAnimationFrame(render)
    }
    raf = requestAnimationFrame(render)
    return () => cancelAnimationFrame(raf)
  }, [])

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
        stepMiniGame(gameRuntimeRef.current, rect, latestSnapshotRef.current.pointer, latestSnapshotRef.current.activeGesture === "pinch")
        setGameScore(gameRuntimeRef.current.score)
        setGameMessage(gameRuntimeRef.current.message)
        drawMiniGame(context, rect, gameRuntimeRef.current, latestSnapshotRef.current.pointer)
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
        <Image
          src="/interactive-experience-mode.png"
          alt=""
          aria-hidden="true"
          fill
          priority
          sizes="100vw"
          className="scale-105 object-cover opacity-28 blur-sm saturate-[0.78]"
        />
        <div className="absolute inset-0 bg-black/68" />
        <div className="absolute inset-0 bg-[linear-gradient(115deg,rgba(6,48,71,0.28),transparent_42%,rgba(31,63,57,0.24))]" />
      </div>

      <section className="relative z-10 flex min-h-screen flex-col px-4 py-4 md:px-6 lg:px-8">
        <header className="relative z-[80] mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 border-b border-foreground/10 pb-4">
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
              <Hand className="h-5 w-5 text-foreground" />
            </div>
            <div>
              <h1 className="font-sans text-xl font-light tracking-tight md:text-2xl">인터랙티브 스테이지</h1>
              <p className="text-xs text-foreground/62 md:text-sm">손동작과 한국어 음성 명령을 한 화면에서 다루는 실행 스테이지</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ControlButton icon={Camera} label={trackingMode === "camera" ? "카메라 끄기" : "체험 시작"} onClick={trackingMode === "camera" ? stopCamera : startCamera} active={trackingMode === "camera"} />
            <ControlButton icon={trackingMode === "simulation" ? MousePointer2 : Hand} label={trackingMode === "simulation" ? "마우스 시뮬레이션" : "손 추적 중"} onClick={() => setTrackingMode("simulation")} />
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
            className="relative order-1 min-h-[620px] overflow-hidden rounded-lg border border-foreground/12 bg-background/36 shadow-2xl shadow-black/30 backdrop-blur-md lg:order-2"
          >
            <video ref={videoRef} className="absolute inset-0 h-full w-full scale-x-[-1] object-cover opacity-26" playsInline muted />
            <canvas ref={drawingCanvasRef} className="pointer-events-none absolute inset-0 z-20" />
            <canvas ref={effectsCanvasRef} className="pointer-events-none absolute inset-0 z-30" />
            <canvas ref={gameCanvasRef} className={`pointer-events-none absolute inset-0 z-40 ${mode === "game" ? "opacity-100" : "opacity-0"}`} />

            <div className="absolute inset-0 z-10 bg-[radial-gradient(circle_at_center,transparent,rgba(0,0,0,0.38))]" />
            <StageStatus mode={mode} cameraState={cameraState} voiceState={voiceState} snapshot={snapshot} />
            <FloatingImages images={images} selectedId={selectedImageId} onSelect={setSelectedImageId} />
            {mode === "weather" ? <WeatherPanel weather={weather} loading={weatherLoading} onRequest={() => void requestWeather("서울")} /> : null}
            {mode === "effects" ? <EffectPanel activeEffect={activeEffect} onTrigger={pushEffect} /> : null}
            {mode === "game" ? <GamePanel definition={activeGameDefinition} score={gameScore} message={gameMessage} onNext={() => switchMiniGame()} /> : null}
            {mode === "three" ? <ThreeObjectPanel visible={threeVisible} pointer={snapshot.pointer} scale={threeScale} activeGesture={snapshot.activeGesture} /> : null}
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

function FloatingImages({
  images,
  selectedId,
  onSelect,
}: {
  images: FloatingImagePanel[]
  selectedId: number
  onSelect: (id: number) => void
}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-[15]">
      {images.map((image) =>
        image.visible ? (
          <button
            key={image.id}
            onClick={() => onSelect(image.id)}
            className={`pointer-events-auto absolute w-[clamp(170px,38vw,330px)] overflow-hidden rounded-lg border bg-background/44 text-left shadow-2xl transition ${
              selectedId === image.id ? "border-foreground/48 shadow-black/32" : "border-foreground/14 shadow-black/32"
            }`}
            style={{
              left: `${image.x * 100}%`,
              top: `${image.y * 100}%`,
              transform: `translate(-50%, -50%) scale(${image.scale}) rotate(${image.rotation}deg)`,
            }}
          >
            <Image
              src={image.src}
              alt={`${image.title} 이미지`}
              width={640}
              height={400}
              sizes="(max-width: 768px) 70vw, 330px"
              className="aspect-[16/10] w-full object-cover"
            />
            <div className="flex items-center justify-between px-3 py-2">
              <span className="truncate text-xs font-semibold text-foreground/84">{image.title}</span>
              <span className="hidden shrink-0 text-[10px] text-foreground/42 sm:inline">집기 이동 · 양손 확대</span>
            </div>
          </button>
        ) : null,
      )}
    </div>
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

function EffectPanel({ activeEffect, onTrigger }: { activeEffect: EffectId; onTrigger: (effect: EffectId) => void }) {
  return (
    <div className="absolute bottom-5 left-5 right-5 z-50 rounded-lg border border-foreground/10 bg-background/44 p-4 backdrop-blur-xl">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-xs text-foreground/48">시각 효과 시스템</p>
          <h2 className="text-lg font-semibold">{getEffectDefinition(activeEffect).label}</h2>
        </div>
        <Sparkles className="h-6 w-6 text-foreground/82" />
      </div>
      <div className="grid max-h-48 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-4">
        {EFFECT_DEFINITIONS.map((effect) => (
          <button
            key={effect.id}
            onClick={() => onTrigger(effect.id)}
            className={`rounded-lg border p-3 text-left transition ${
              activeEffect === effect.id ? "border-foreground/36 bg-foreground/14" : "border-foreground/8 bg-foreground/6 hover:bg-foreground/11"
            }`}
          >
            <p className="text-sm font-semibold">{effect.label}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-foreground/54">{effect.gestureHint}</p>
          </button>
        ))}
      </div>
    </div>
  )
}

function GamePanel({
  definition,
  score,
  message,
  onNext,
}: {
  definition: ReturnType<typeof getMiniGameDefinition>
  score: number
  message: string
  onNext: () => void
}) {
  return (
    <div className="absolute bottom-5 left-5 z-50 w-[min(420px,calc(100%-40px))] rounded-lg border border-foreground/12 bg-background/44 p-4 backdrop-blur-xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs text-foreground/58">제스처 미니게임</p>
          <h2 className="mt-1 text-2xl font-semibold">{definition.label}</h2>
        </div>
        <div className="rounded-lg border border-foreground/10 bg-foreground/8 px-3 py-2 text-right">
          <p className="text-[10px] text-foreground/46">점수</p>
          <p className="text-xl font-semibold">{score}</p>
        </div>
      </div>
      <p className="mt-3 text-sm text-foreground/70">{definition.instruction}</p>
      <p className="mt-2 text-xs text-foreground/66">{message}</p>
      <button onClick={onNext} className="mt-4 rounded-lg border border-foreground/12 bg-foreground/8 px-3 py-2 text-xs text-foreground/76 transition hover:bg-foreground/14">
        다음 게임
      </button>
    </div>
  )
}

function ThreeObjectPanel({
  visible,
  pointer,
  scale,
  activeGesture,
}: {
  visible: boolean
  pointer: Point
  scale: number
  activeGesture: GestureName
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const pointerRef = useRef(pointer)
  const scaleRef = useRef(scale)
  const gestureRef = useRef(activeGesture)

  useEffect(() => {
    pointerRef.current = pointer
    scaleRef.current = scale
    gestureRef.current = activeGesture
  }, [activeGesture, pointer, scale])

  useEffect(() => {
    if (!visible || !containerRef.current) return
    let disposed = false
    let cleanup: (() => void) | undefined

    const init = async () => {
      const THREE = await import("three")
      if (disposed || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(52, rect.width / rect.height, 0.1, 100)
      camera.position.z = 4
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
      renderer.setSize(rect.width, rect.height)
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      containerRef.current.appendChild(renderer.domElement)

      const geometry = new THREE.IcosahedronGeometry(1.05, 2)
      const material = new THREE.MeshStandardMaterial({
        color: 0x9ed7d2,
        emissive: 0x1f3f39,
        roughness: 0.25,
        metalness: 0.55,
        wireframe: false,
      })
      const mesh = new THREE.Mesh(geometry, material)
      scene.add(mesh)
      const wire = new THREE.LineSegments(new THREE.WireframeGeometry(geometry), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18 }))
      mesh.add(wire)
      scene.add(new THREE.AmbientLight(0xffffff, 1.4))
      const light = new THREE.PointLight(0x9ed7d2, 10, 12)
      light.position.set(2, 2, 3)
      scene.add(light)

      let raf = 0
      const animate = () => {
        const p = pointerRef.current
        mesh.rotation.y += 0.01 + (p.x - 0.5) * 0.025
        mesh.rotation.x += 0.008 + (p.y - 0.5) * 0.018
        const targetScale = scaleRef.current * (gestureRef.current === "pinch" ? 1.08 : 1)
        mesh.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.08)
        light.position.x = (p.x - 0.5) * 5
        light.position.y = (0.5 - p.y) * 4
        renderer.render(scene, camera)
        raf = requestAnimationFrame(animate)
      }
      animate()

      const resize = () => {
        if (!containerRef.current) return
        const next = containerRef.current.getBoundingClientRect()
        camera.aspect = next.width / next.height
        camera.updateProjectionMatrix()
        renderer.setSize(next.width, next.height)
      }
      window.addEventListener("resize", resize)

      cleanup = () => {
        cancelAnimationFrame(raf)
        window.removeEventListener("resize", resize)
        renderer.dispose()
        geometry.dispose()
        material.dispose()
        containerRef.current?.replaceChildren()
      }
    }

    void init()
    return () => {
      disposed = true
      cleanup?.()
    }
  }, [visible])

  if (!visible) return null

  return (
    <div className="absolute inset-x-8 top-28 z-[25] h-[44%] rounded-lg border border-foreground/12 bg-foreground/6 backdrop-blur-sm">
      <div ref={containerRef} className="h-full w-full" />
      <div className="absolute left-4 top-4 rounded-lg border border-foreground/10 bg-background/42 px-3 py-2 text-xs text-foreground/72 backdrop-blur-xl">
        3D 오브젝트 · 손 이동으로 회전 · 양손 거리로 확대
      </div>
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

function mirrorSnapshotForStage(snapshot: GestureSnapshot): GestureSnapshot {
  const mirrorGesture = (gesture: GestureName): GestureName => {
    if (gesture === "swipe_left") return "swipe_right"
    if (gesture === "swipe_right") return "swipe_left"
    return gesture
  }
  const mirroredSwipe = snapshot.swipe === "left" ? "right" : snapshot.swipe === "right" ? "left" : null

  return {
    ...snapshot,
    hands: snapshot.hands.map((hand) => ({
      ...hand,
      center: { ...hand.center, x: 1 - hand.center.x },
      pointer: { ...hand.pointer, x: 1 - hand.pointer.x },
    })),
    primaryHand: snapshot.primaryHand
      ? {
          ...snapshot.primaryHand,
          center: { ...snapshot.primaryHand.center, x: 1 - snapshot.primaryHand.center.x },
          pointer: { ...snapshot.primaryHand.pointer, x: 1 - snapshot.primaryHand.pointer.x },
        }
      : null,
    pointer: { ...snapshot.pointer, x: 1 - snapshot.pointer.x },
    activeGesture: mirrorGesture(snapshot.activeGesture),
    activeGestures: snapshot.activeGestures.map(mirrorGesture),
    swipe: mirroredSwipe,
  }
}

function drawParticles(context: CanvasRenderingContext2D, particles: EffectParticle[]) {
  for (const particle of particles) {
    context.save()
    context.globalAlpha = Math.max(0, particle.life)
    context.translate(particle.x, particle.y)
    context.rotate(particle.spin * particle.maxLife)
    context.fillStyle = particle.color
    context.strokeStyle = particle.color
    context.shadowBlur = 18
    context.shadowColor = particle.color

    if (particle.kind === "ring" || particle.kind === "wave") {
      context.lineWidth = Math.max(1, particle.radius * 0.45)
      context.beginPath()
      context.arc(0, 0, (1 - particle.life) * particle.maxLife * 2.4 + particle.radius, 0, Math.PI * 2)
      context.stroke()
    } else if (particle.kind === "beam") {
      context.fillRect(0, -particle.radius * 0.4, particle.radius * 10, particle.radius * 0.8)
    } else if (particle.kind === "slash") {
      context.lineWidth = particle.radius
      context.beginPath()
      context.moveTo(-particle.radius * 8, -particle.radius)
      context.lineTo(particle.radius * 8, particle.radius)
      context.stroke()
    } else {
      context.beginPath()
      context.arc(0, 0, particle.radius, 0, Math.PI * 2)
      context.fill()
    }
    context.restore()
  }
}

function createMiniGameRuntime(id: MiniGameId): MiniGameRuntime {
  return {
    id,
    score: 0,
    lives: 3,
    objects: [],
    timer: 0,
    lastSpawn: 0,
    lastPinch: false,
    message: getMiniGameDefinition(id).instruction,
    pointerTrail: [],
  }
}

function stepMiniGame(game: MiniGameRuntime, rect: DOMRect, pointer: Point, pinching: boolean) {
  const px = pointer.x * rect.width
  const py = pointer.y * rect.height
  game.timer += 1
  game.pointerTrail = [...game.pointerTrail.slice(-6), { x: px, y: py }]

  if (game.id === "catch") {
    spawnEvery(game, 42, rect, "core")
    game.objects.forEach((object) => {
      object.y += object.vy
      if (distancePoint(object, { x: px, y: py }) < object.r + 34) {
        object.life = 0
        game.score += 10
        game.message = "코어를 받았습니다."
      } else if (object.y > rect.height + 30) {
        object.life = 0
        game.lives -= 1
        game.message = "놓쳤습니다. 손을 더 빠르게 움직이세요."
      }
    })
  }

  if (game.id === "bubble") {
    spawnEvery(game, 28, rect, "bubble")
    game.objects.forEach((object) => {
      object.x += object.vx
      object.y += object.vy
      if (distancePoint(object, { x: px, y: py }) < object.r + 24) {
        object.life = 0
        game.score += 5
        game.message = "버블 터짐"
      }
    })
  }

  if (game.id === "pong") {
    if (!game.ball) game.ball = { id: 1, x: rect.width * 0.5, y: rect.height * 0.5, vx: 5, vy: 4, r: 14, kind: "ball", life: 1, color: "#38bdf8" }
    const ball = game.ball
    ball.x += ball.vx
    ball.y += ball.vy
    if (ball.y < 30 || ball.y > rect.height - 30) ball.vy *= -1
    if (ball.x > rect.width - 35 && Math.abs(ball.y - py) < 88) {
      ball.vx = -Math.abs(ball.vx) - 0.15
      game.score += 3
      game.message = "패들 반사 성공"
    }
    if (ball.x < 25) ball.vx = Math.abs(ball.vx)
    if (ball.x > rect.width + 40) {
      game.ball = undefined
      game.lives -= 1
      game.message = "공을 놓쳤습니다."
    }
  }

  if (game.id === "avoid") {
    spawnEvery(game, 36, rect, "hazard")
    game.objects.forEach((object) => {
      object.x += object.vx
      object.y += object.vy
      if (distancePoint(object, { x: px, y: py }) < object.r + 22) {
        object.life = 0
        game.lives -= 1
        game.message = "장애물 충돌"
      } else if (object.x < -40 || object.x > rect.width + 40 || object.y > rect.height + 40) {
        object.life = 0
        game.score += 1
      }
    })
  }

  if (game.id === "slice") {
    spawnEvery(game, 38, rect, "slice")
    const speed = getTrailSpeed(game.pointerTrail)
    game.objects.forEach((object) => {
      object.x += object.vx
      object.y += object.vy
      if (speed > 22 && distancePoint(object, { x: px, y: py }) < object.r + 28) {
        object.life = 0
        game.score += 8
        game.message = "절단 성공"
      }
    })
  }

  if (game.id === "throw") {
    if (!game.ball) game.ball = { id: 1, x: px, y: py, vx: 0, vy: 0, r: 18, kind: "throw", life: 1, color: "#f97316" }
    const ball = game.ball
    if (pinching) {
      ball.x = px
      ball.y = py
      const velocity = getTrailVelocity(game.pointerTrail)
      ball.vx = velocity.x * 0.8
      ball.vy = velocity.y * 0.8
      game.message = "집기 상태에서 손을 움직인 뒤 놓으세요."
    } else {
      ball.x += ball.vx
      ball.y += ball.vy
      ball.vy += 0.16
      ball.vx *= 0.99
      if (ball.x > rect.width * 0.72 && ball.y < rect.height * 0.34) {
        game.score += 12
        game.ball = undefined
        game.message = "목표점 명중"
      }
      if (ball.y > rect.height + 80 || ball.x < -80 || ball.x > rect.width + 80) game.ball = undefined
    }
  }

  if (game.id === "reaction") {
    if (!game.target || game.timer % 120 === 0) {
      game.target = {
        id: game.timer,
        x: rect.width * (0.22 + Math.random() * 0.56),
        y: rect.height * (0.22 + Math.random() * 0.5),
        vx: 0,
        vy: 0,
        r: 34,
        kind: game.timer % 240 < 120 ? "wait" : "go",
        life: 1,
        color: game.timer % 240 < 120 ? "#f59e0b" : "#22c55e",
      }
      game.message = game.target.kind === "go" ? "지금 터치하세요." : "초록 신호를 기다리세요."
    }
    if (game.target.kind === "go" && distancePoint(game.target, { x: px, y: py }) < game.target.r + 20) {
      game.score += 15
      game.target = undefined
      game.message = "빠른 반응 성공"
    }
  }

  if (game.id === "rhythm") {
    if (game.timer % 88 === 0) {
      game.objects.push({ id: game.timer, x: rect.width * 0.5, y: rect.height * 0.5, vx: 0, vy: 0, r: 160, kind: "ring", life: 1, color: "#a855f7" })
    }
    game.objects.forEach((object) => {
      object.r -= 2.2
      if (object.r < 45 && object.r > 18 && distancePoint(object, { x: px, y: py }) < 88) {
        object.life = 0
        game.score += 10
        game.message = "박자 성공"
      }
      if (object.r < 6) object.life = 0
    })
  }

  if (game.id === "target") {
    spawnEvery(game, 55, rect, "target")
    game.objects.forEach((object) => {
      object.x += object.vx
      object.y += object.vy
      if (pinching && !game.lastPinch && distancePoint(object, { x: px, y: py }) < object.r + 32) {
        object.life = 0
        game.score += 10
        game.message = "표적 명중"
      }
    })
  }

  game.lastPinch = pinching
  game.objects = game.objects.filter((object) => object.life > 0 && object.y < rect.height + 90 && object.x > -90 && object.x < rect.width + 90)
  if (game.lives <= 0) {
    game.score = Math.max(0, game.score - 5)
    game.lives = 3
    game.objects = []
    game.ball = undefined
    game.message = "다시 시작합니다."
  }
}

function drawMiniGame(context: CanvasRenderingContext2D, rect: DOMRect, game: MiniGameRuntime, pointer: Point) {
  context.clearRect(0, 0, rect.width, rect.height)
  context.save()
  context.fillStyle = "rgba(0,0,0,0.28)"
  context.fillRect(0, 0, rect.width, rect.height)

  const px = pointer.x * rect.width
  const py = pointer.y * rect.height
  context.strokeStyle = "rgba(103,232,249,0.55)"
  context.lineWidth = 2
  context.beginPath()
  context.arc(px, py, 34, 0, Math.PI * 2)
  context.stroke()

  if (game.id === "pong") {
    context.fillStyle = "rgba(255,255,255,0.7)"
    context.fillRect(rect.width - 26, py - 82, 12, 164)
  }
  if (game.id === "throw") {
    context.strokeStyle = "rgba(249,115,22,0.75)"
    context.beginPath()
    context.arc(rect.width * 0.8, rect.height * 0.22, 42, 0, Math.PI * 2)
    context.stroke()
  }

  const drawObject = (object: GameObject) => {
    context.save()
    context.fillStyle = object.color
    context.strokeStyle = object.color
    context.shadowColor = object.color
    context.shadowBlur = 18
    if (object.kind === "ring") {
      context.lineWidth = 4
      context.beginPath()
      context.arc(object.x, object.y, object.r, 0, Math.PI * 2)
      context.stroke()
    } else if (object.kind === "hazard") {
      context.beginPath()
      context.rect(object.x - object.r, object.y - object.r, object.r * 2, object.r * 2)
      context.fill()
    } else {
      context.beginPath()
      context.arc(object.x, object.y, object.r, 0, Math.PI * 2)
      context.fill()
    }
    context.restore()
  }

  game.objects.forEach(drawObject)
  if (game.ball) drawObject(game.ball)
  if (game.target) drawObject(game.target)

  context.fillStyle = "rgba(255,255,255,0.76)"
  context.font = "12px sans-serif"
  context.fillText(`점수 ${game.score} · 기회 ${game.lives}`, 20, 30)
  context.restore()
}

function spawnEvery(game: MiniGameRuntime, interval: number, rect: DOMRect, kind: string) {
  if (game.timer - game.lastSpawn < interval) return
  game.lastSpawn = game.timer
  const colorByKind: Record<string, string> = {
    core: "#38bdf8",
    bubble: "#67e8f9",
    hazard: "#ef4444",
    slice: "#facc15",
    target: "#f43f5e",
  }
  const object: GameObject = {
    id: game.timer + Math.random(),
    x: Math.random() * rect.width,
    y: kind === "bubble" ? rect.height + 40 : -30,
    vx: kind === "hazard" || kind === "target" ? -2 + Math.random() * 4 : -0.8 + Math.random() * 1.6,
    vy: kind === "bubble" ? -1.5 - Math.random() * 2 : 2 + Math.random() * 3.5,
    r: 16 + Math.random() * 20,
    kind,
    life: 1,
    color: colorByKind[kind] ?? "#38bdf8",
  }
  if (kind === "hazard") {
    object.x = Math.random() > 0.5 ? -25 : rect.width + 25
    object.y = Math.random() * rect.height
    object.vx = object.x < 0 ? 3 + Math.random() * 3 : -3 - Math.random() * 3
    object.vy = -1 + Math.random() * 2
  }
  if (kind === "target") {
    object.y = 120 + Math.random() * (rect.height - 220)
  }
  game.objects.push(object)
}

function getTrailSpeed(trail: Point[]) {
  if (trail.length < 2) return 0
  const first = trail[0]
  const last = trail[trail.length - 1]
  return Math.hypot(last.x - first.x, last.y - first.y)
}

function getTrailVelocity(trail: Point[]) {
  if (trail.length < 2) return { x: 0, y: 0 }
  const first = trail[0]
  const last = trail[trail.length - 1]
  return { x: (last.x - first.x) / trail.length, y: (last.y - first.y) / trail.length }
}

function distancePoint(a: { x: number; y: number }, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
