"use client"

import Image from "next/image"
import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import {
  ArrowLeft,
  Camera,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  FileText,
  Hand,
  Keyboard,
  Monitor,
  MousePointer2,
  MousePointerClick,
  Presentation,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Terminal,
} from "lucide-react"
import { CustomCursor } from "@/components/custom-cursor"
import { GrainOverlay } from "@/components/grain-overlay"
import {
  createEmptyGestureSnapshot,
  GESTURE_LABELS,
  recognizeGestureSnapshot,
} from "@/lib/interactive/gesture/gesture-recognizer"
import type {
  GestureHistoryFrame,
  GestureName,
  GestureSnapshot,
  NormalizedLandmark,
  Point,
} from "@/lib/interactive/types"

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

type ControlAction = "idle" | "move_cursor" | "left_click" | "next_slide" | "previous_slide" | "scroll_up" | "scroll_down"

type ActionLog = {
  id: number
  action: string
  detail: string
  tone: "info" | "success" | "warning"
}

const ACTION_BY_GESTURE: Partial<Record<GestureName, ControlAction>> = {
  open_palm: "idle",
  point: "move_cursor",
  pinch: "left_click",
  peace: "next_slide",
  swipe_left: "previous_slide",
  swipe_right: "next_slide",
  thumbs_up: "scroll_up",
  thumbs_down: "scroll_down",
}

const ACTION_LABELS: Record<ControlAction, string> = {
  idle: "대기",
  move_cursor: "커서 이동",
  left_click: "왼쪽 클릭",
  next_slide: "다음 슬라이드",
  previous_slide: "이전 슬라이드",
  scroll_up: "위로 스크롤",
  scroll_down: "아래로 스크롤",
}

const ACTION_COOLDOWN_MS: Record<ControlAction, number> = {
  idle: 0,
  move_cursor: 0,
  left_click: 800,
  next_slide: 1100,
  previous_slide: 1100,
  scroll_up: 450,
  scroll_down: 450,
}

const HAND_TRACKING_INTERVAL_MS = 1000 / 30
const PC_CONTROL_UI_INTERVAL_MS = 1000 / 20

const SLIDES = [
  {
    title: "Gesture Bridge",
    kicker: "PC control web runtime",
    body: "손 포인터가 브라우저 안의 데스크톱을 직접 움직입니다.",
  },
  {
    title: "Pointer",
    kicker: "point",
    body: "검지만 펴면 커서가 움직이고 현재 좌표가 상태 패널에 반영됩니다.",
  },
  {
    title: "Click",
    kicker: "pinch",
    body: "엄지와 검지를 붙이면 앱 아이콘과 슬라이드 버튼을 클릭합니다.",
  },
  {
    title: "Scroll",
    kicker: "thumbs up/down",
    body: "엄지 방향으로 문서 패널을 위아래로 스크롤합니다.",
  },
]

const DESKTOP_APPS = [
  { id: "deck", label: "Deck", icon: Presentation, accent: "#38bdf8" },
  { id: "notes", label: "Notes", icon: FileText, accent: "#f59e0b" },
  { id: "terminal", label: "Terminal", icon: Terminal, accent: "#22c55e" },
  { id: "effects", label: "Effects", icon: Sparkles, accent: "#f472b6" },
]

export function PcControlExperience() {
  const stageRef = useRef<HTMLDivElement>(null)
  const desktopRef = useRef<HTMLDivElement>(null)
  const scrollPanelRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const landmarkerRef = useRef<HandLandmarkerLike | null>(null)
  const gestureHistoryRef = useRef<GestureHistoryFrame[]>([])
  const previousTwoHandDistanceRef = useRef<number | null>(null)
  const smoothedPointerRef = useRef<Point | null>(null)
  const pointerRef = useRef<Point>({ x: 0.5, y: 0.5 })
  const pointerDownRef = useRef(false)
  const mountedRef = useRef(false)
  const latestSnapshotRef = useRef<GestureSnapshot>(createEmptyGestureSnapshot())
  const lastHandDetectAtRef = useRef(0)
  const lastSnapshotUiAtRef = useRef(0)
  const lastActionAtRef = useRef<Record<string, number>>({})
  const logIdRef = useRef(1)

  const [trackingMode, setTrackingMode] = useState<"camera" | "simulation">("simulation")
  const [cameraPreviewActive, setCameraPreviewActive] = useState(false)
  const [cameraState, setCameraState] = useState("마우스 시뮬레이션")
  const [snapshot, setSnapshot] = useState<GestureSnapshot>(createEmptyGestureSnapshot())
  const [cursor, setCursor] = useState<Point>({ x: 0.5, y: 0.5 })
  const [lastAction, setLastAction] = useState(ACTION_LABELS.idle)
  const [activeSlide, setActiveSlide] = useState(0)
  const [activeApp, setActiveApp] = useState("deck")
  const [scrollProgress, setScrollProgress] = useState(0)
  const [logs, setLogs] = useState<ActionLog[]>([
    { id: 0, action: "웹 런타임", detail: "브라우저 내부 데스크톱이 준비되었습니다.", tone: "info" },
  ])

  const activeSlideData = SLIDES[activeSlide]
  const activeAppData = DESKTOP_APPS.find((app) => app.id === activeApp) ?? DESKTOP_APPS[0]
  const ActiveAppIcon = activeAppData.icon
  const activeAction = ACTION_BY_GESTURE[snapshot.activeGesture] ?? "idle"

  const addLog = useCallback((action: string, detail: string, tone: ActionLog["tone"] = "info") => {
    setLogs((previous) => [{ id: logIdRef.current++, action, detail, tone }, ...previous].slice(0, 8))
  }, [])

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setTrackingMode("simulation")
      setCameraState("카메라 미지원")
      addLog("카메라", "브라우저 카메라 API가 없어 시뮬레이션을 유지합니다.", "warning")
      return
    }

    try {
      setCameraState("카메라 권한 요청")
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
      landmarkerRef.current = await vision.HandLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: "/models/hand_landmarker.task",
          delegate: "CPU",
        },
        runningMode: "VIDEO",
        numHands: 2,
      })
      setCameraState("손 추적 중")
      addLog("카메라", "MediaPipe Hands 웹 추적을 시작했습니다.", "success")
    } catch (error) {
      console.error(error)
      const hasCameraStream = Boolean(streamRef.current)
      setCameraPreviewActive(hasCameraStream)
      setTrackingMode(hasCameraStream ? "camera" : "simulation")
      setCameraState(hasCameraStream ? "카메라 표시, 추적 실패" : "카메라 실패")
      addLog("카메라", hasCameraStream ? "카메라는 켰지만 손 추적 모델을 시작하지 못했습니다." : "카메라를 시작하지 못했습니다.", "warning")
    }
  }, [addLog])

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    landmarkerRef.current?.close?.()
    landmarkerRef.current = null
    smoothedPointerRef.current = null
    latestSnapshotRef.current = createEmptyGestureSnapshot()
    lastHandDetectAtRef.current = 0
    lastSnapshotUiAtRef.current = 0
    setCameraPreviewActive(false)
    setTrackingMode("simulation")
    setCameraState("마우스 시뮬레이션")
    addLog("카메라", "카메라를 끄고 시뮬레이션으로 전환했습니다.", "info")
  }, [addLog])

  const openApp = useCallback(
    (appId: string) => {
      const app = DESKTOP_APPS.find((item) => item.id === appId)
      if (!app) return
      setActiveApp(app.id)
      addLog("앱 선택", `${app.label} 창을 활성화했습니다.`, "success")
    },
    [addLog],
  )

  const goToSlide = useCallback(
    (direction: 1 | -1) => {
      setActiveSlide((current) => {
        const next = (current + direction + SLIDES.length) % SLIDES.length
        addLog(direction > 0 ? "다음 슬라이드" : "이전 슬라이드", SLIDES[next].title, "success")
        return next
      })
    },
    [addLog],
  )

  const scrollDocument = useCallback(
    (direction: 1 | -1) => {
      const panel = scrollPanelRef.current
      if (!panel) return
      panel.scrollBy({ top: direction * 220, behavior: "smooth" })
      window.setTimeout(() => updateScrollProgress(panel, setScrollProgress), 180)
      addLog(direction < 0 ? "위로 스크롤" : "아래로 스크롤", "문서 패널 위치를 변경했습니다.", "success")
    },
    [addLog],
  )

  const performClick = useCallback(
    (point: Point) => {
      const desktop = desktopRef.current
      const rect = desktop?.getBoundingClientRect()
      if (!desktop || !rect) return
      const element = document.elementFromPoint(rect.left + point.x * rect.width, rect.top + point.y * rect.height)
      const target = element?.closest<HTMLElement>("[data-pc-click]")

      if (!target || !desktop.contains(target)) {
        addLog("왼쪽 클릭", "빈 데스크톱 영역을 클릭했습니다.", "info")
        return
      }

      target.click()
    },
    [addLog],
  )

  const dispatchControlAction = useCallback(
    (nextSnapshot: GestureSnapshot) => {
      const action = ACTION_BY_GESTURE[nextSnapshot.activeGesture] ?? "idle"
      const now = nextSnapshot.timestamp
      setCursor(nextSnapshot.pointer)

      if (action === "idle") {
        setLastAction(ACTION_LABELS.idle)
        return
      }

      if (action === "move_cursor") {
        setLastAction(`${ACTION_LABELS.move_cursor} ${Math.round(nextSnapshot.pointer.x * 100)}%, ${Math.round(nextSnapshot.pointer.y * 100)}%`)
        return
      }

      if (!shouldRunAction(action, now)) return

      setLastAction(ACTION_LABELS[action])
      if (action === "left_click") performClick(nextSnapshot.pointer)
      if (action === "next_slide") goToSlide(1)
      if (action === "previous_slide") goToSlide(-1)
      if (action === "scroll_up") scrollDocument(-1)
      if (action === "scroll_down") scrollDocument(1)
    },
    [goToSlide, performClick, scrollDocument],
  )

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      streamRef.current?.getTracks().forEach((track) => track.stop())
      landmarkerRef.current?.close?.()
    }
  }, [])

  useEffect(() => {
    let raf = 0

    const loop = () => {
      if (!mountedRef.current) return
      const now = performance.now()
      let shouldProcessSnapshot = trackingMode === "simulation"
      let nextSnapshot =
        trackingMode === "camera"
          ? latestSnapshotRef.current
          : createSimulationSnapshot(pointerRef.current, pointerDownRef.current ? "pinch" : "point", now)

      const video = videoRef.current
      const landmarker = landmarkerRef.current
      if (trackingMode === "camera" && video && landmarker && video.readyState >= 2) {
        if (now - lastHandDetectAtRef.current >= HAND_TRACKING_INTERVAL_MS) {
          lastHandDetectAtRef.current = now
          shouldProcessSnapshot = true
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
              nextSnapshot = smoothSnapshotPointer(mirrorSnapshotForStage(recognized.snapshot, video, desktopRef.current?.getBoundingClientRect()), smoothedPointerRef)
            } else {
              smoothedPointerRef.current = null
              nextSnapshot = recognized.snapshot
            }
            latestSnapshotRef.current = nextSnapshot
          } catch {
            setCameraState("손 추적 재시도")
          }
        }
      }

      if (shouldProcessSnapshot) {
        if (trackingMode === "simulation") latestSnapshotRef.current = nextSnapshot
        dispatchControlAction(nextSnapshot)
        if (now - lastSnapshotUiAtRef.current >= PC_CONTROL_UI_INTERVAL_MS) {
          lastSnapshotUiAtRef.current = now
          setSnapshot({ ...nextSnapshot })
        }
      }
      raf = requestAnimationFrame(loop)
    }

    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [dispatchControlAction, trackingMode])

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = desktopRef.current?.getBoundingClientRect()
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

      <div className="fixed inset-0 z-0 bg-[radial-gradient(circle_at_18%_18%,rgba(18,117,216,0.34),transparent_30%),radial-gradient(circle_at_82%_28%,rgba(225,145,54,0.28),transparent_32%),linear-gradient(140deg,#040711,#0c1220_54%,#15100a)]" />
      <div className="fixed inset-0 z-0 bg-[linear-gradient(rgba(255,255,255,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.036)_1px,transparent_1px)] bg-[size:58px_58px] opacity-18" />

      <section className="relative z-10 flex min-h-screen flex-col px-4 py-4 md:px-6 lg:px-8">
        <header className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 rounded-lg border border-foreground/10 bg-background/36 px-4 py-3 shadow-2xl shadow-black/18 backdrop-blur-2xl">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              prefetch={false}
              className="grid h-10 w-10 place-items-center rounded-lg border border-foreground/12 bg-foreground/8 text-foreground/80 transition hover:bg-foreground/14 hover:text-foreground"
              aria-label="처음 화면으로 돌아가기"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="grid h-10 w-10 place-items-center rounded-lg border border-foreground/12 bg-foreground/10">
              <Image src="/brand/mode-pc-control-512.png" alt="" width={40} height={40} priority className="h-9 w-9 object-contain" />
            </div>
            <div>
              <h1 className="font-sans text-xl font-light tracking-tight md:text-2xl">PC 제어 웹 모드</h1>
              <p className="text-xs text-foreground/62 md:text-sm">카메라 손 추적으로 브라우저 데스크톱을 조작합니다.</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ControlButton icon={Camera} label={trackingMode === "camera" ? "카메라 끄기" : "웹 실행 시작"} onClick={trackingMode === "camera" ? stopCamera : startCamera} active={trackingMode === "camera"} />
            <ControlButton
              icon={trackingMode === "simulation" ? MousePointer2 : Hand}
              label={trackingMode === "simulation" ? "마우스 시뮬레이션" : "손 추적 중"}
              onClick={() => {
                smoothedPointerRef.current = null
                setTrackingMode("simulation")
                setCameraState("마우스 시뮬레이션")
              }}
              active={trackingMode === "simulation"}
            />
            <Link
              href="/interactive"
              className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-foreground/10 bg-foreground/7 px-3 py-2 text-xs font-medium text-foreground/72 transition hover:bg-foreground/12 hover:text-foreground"
            >
              <Sparkles className="h-4 w-4" />
              인터랙티브
            </Link>
          </div>
        </header>

        <div className="mx-auto grid w-full max-w-7xl min-h-0 flex-1 gap-4 py-4 lg:grid-cols-[248px_minmax(0,1fr)_320px]">
          <aside className="order-2 grid content-start gap-3 rounded-lg border border-foreground/10 bg-foreground/7 p-4 backdrop-blur-xl lg:order-1">
            <StatusTile icon={Camera} label="입력" value={cameraState} />
            <StatusTile icon={Hand} label="제스처" value={GESTURE_LABELS[snapshot.activeGesture]} />
            <StatusTile icon={MousePointerClick} label="동작" value={lastAction} />
            <StatusTile icon={ShieldCheck} label="범위" value="브라우저 내부" />
            <div className="rounded-lg border border-foreground/10 bg-background/22 p-3">
              <p className="text-xs text-foreground/48">제스처 매핑</p>
              <div className="mt-3 grid gap-2">
                {(["point", "pinch", "peace", "thumbs_up", "thumbs_down"] as GestureName[]).map((gesture) => (
                  <div key={gesture} className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-foreground/68">{GESTURE_LABELS[gesture]}</span>
                    <span className="rounded-md bg-foreground/8 px-2 py-1 text-foreground/82">{ACTION_LABELS[ACTION_BY_GESTURE[gesture] ?? "idle"]}</span>
                  </div>
                ))}
              </div>
            </div>
          </aside>

          <section
            ref={stageRef}
            onPointerMove={onPointerMove}
            onPointerDown={(event) => {
              if (
                trackingMode === "simulation" &&
                event.target instanceof Element &&
                event.target.closest("[data-pc-click]")
              ) {
                return
              }
              pointerDownRef.current = true
            }}
            onPointerUp={() => {
              pointerDownRef.current = false
            }}
            onPointerLeave={() => {
              pointerDownRef.current = false
            }}
            className="relative order-1 min-h-[660px] overflow-hidden rounded-lg border border-foreground/14 bg-black/74 shadow-2xl shadow-black/34 backdrop-blur-xl lg:order-2"
          >
            <video
              ref={videoRef}
              className={`absolute inset-0 z-0 h-full w-full scale-x-[-1] object-cover transition-opacity duration-300 ${
                cameraPreviewActive ? "opacity-38" : "opacity-0"
              }`}
              autoPlay
              playsInline
              muted
            />
            <div className="absolute inset-0 z-[1] bg-[radial-gradient(circle_at_50%_10%,rgba(255,255,255,0.08),transparent_26%),linear-gradient(180deg,rgba(0,0,0,0.18),rgba(0,0,0,0.66))]" />

            <div ref={desktopRef} className="absolute inset-4 z-10 overflow-hidden rounded-lg border border-white/12 bg-[#07101a]/86 shadow-2xl shadow-black/40">
              <DesktopTopBar activeAction={ACTION_LABELS[activeAction]} cursor={cursor} />

              <div className="grid h-full grid-rows-[44px_minmax(0,1fr)]">
                <div />
                <div className="grid min-h-0 gap-4 p-4 lg:grid-cols-[112px_minmax(0,1fr)]">
                  <div className="grid content-start gap-3">
                    {DESKTOP_APPS.map((app) => {
                      const Icon = app.icon
                      return (
                        <button
                          key={app.id}
                          data-pc-click
                          onClick={() => openApp(app.id)}
                          className={`group grid aspect-square place-items-center rounded-lg border p-2 text-center transition ${
                            activeApp === app.id
                              ? "border-white/36 bg-white/18 shadow-lg shadow-black/20"
                              : "border-white/10 bg-white/8 hover:border-white/24 hover:bg-white/14"
                          }`}
                        >
                          <span className="grid h-10 w-10 place-items-center rounded-lg" style={{ backgroundColor: `${app.accent}24`, color: app.accent }}>
                            <Icon className="h-5 w-5" />
                          </span>
                          <span className="mt-2 text-[11px] font-medium text-white/78">{app.label}</span>
                        </button>
                      )
                    })}
                  </div>

                  <div className="grid min-h-0 gap-4 xl:grid-cols-[minmax(0,1.08fr)_minmax(290px,0.92fr)]">
                    <div className="relative min-h-[310px] overflow-hidden rounded-lg border border-white/12 bg-white/[0.055]">
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_24%,rgba(56,189,248,0.18),transparent_28%),radial-gradient(circle_at_80%_24%,rgba(245,158,11,0.15),transparent_30%)]" />
                      <div className="relative z-10 flex h-full flex-col justify-between p-5">
                        <div>
                          <p className="font-mono text-xs uppercase tracking-[0.18em] text-white/42">{activeSlideData.kicker}</p>
                          <h2 className="mt-3 text-4xl font-light tracking-tight text-white md:text-5xl">{activeSlideData.title}</h2>
                          <p className="mt-4 max-w-lg text-sm leading-relaxed text-white/68 md:text-base">{activeSlideData.body}</p>
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex gap-1.5">
                            {SLIDES.map((slide, index) => (
                              <span key={slide.title} className={`h-1.5 w-8 rounded-full ${index === activeSlide ? "bg-white" : "bg-white/20"}`} />
                            ))}
                          </div>
                          <div className="flex gap-2">
                            <IconButton icon={ChevronLeft} label="이전 슬라이드" onClick={() => goToSlide(-1)} />
                            <IconButton icon={ChevronRight} label="다음 슬라이드" onClick={() => goToSlide(1)} />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid min-h-0 gap-4">
                      <div className="rounded-lg border border-white/12 bg-white/[0.055] p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs text-white/44">활성 창</p>
                            <h3 className="mt-1 text-xl font-semibold text-white">{activeAppData.label}</h3>
                          </div>
                          <div className="grid h-10 w-10 place-items-center rounded-lg" style={{ backgroundColor: `${activeAppData.accent}22`, color: activeAppData.accent }}>
                            <ActiveAppIcon className="h-5 w-5" />
                          </div>
                        </div>
                        <p className="mt-3 text-sm leading-relaxed text-white/62">{getAppSummary(activeApp)}</p>
                      </div>

                      <div className="min-h-0 rounded-lg border border-white/12 bg-white/[0.055]">
                        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                          <div>
                            <p className="text-xs text-white/44">스크롤 문서</p>
                            <p className="text-sm font-semibold text-white">control-notes.md</p>
                          </div>
                          <div className="flex gap-2">
                            <IconButton icon={ChevronUp} label="위로 스크롤" onClick={() => scrollDocument(-1)} />
                            <IconButton icon={ChevronDown} label="아래로 스크롤" onClick={() => scrollDocument(1)} />
                          </div>
                        </div>
                        <div
                          ref={scrollPanelRef}
                          onScroll={(event) => updateScrollProgress(event.currentTarget, setScrollProgress)}
                          className="h-[230px] overflow-y-auto px-4 py-3 text-sm leading-relaxed text-white/66"
                        >
                          {Array.from({ length: 8 }, (_, index) => (
                            <p key={index} className="mb-4">
                              {index + 1}. {getDocumentLine(index)}
                            </p>
                          ))}
                        </div>
                        <div className="h-1 bg-white/8">
                          <div className="h-full bg-white/70 transition-all" style={{ width: `${scrollProgress}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <VirtualPcCursor pointer={cursor} gesture={snapshot.activeGesture} />
            </div>
          </section>

          <aside className="order-3 grid min-h-0 gap-4 lg:grid-rows-[auto_minmax(0,1fr)]">
            <div className="grid grid-cols-2 gap-3">
              <Metric label="슬라이드" value={`${activeSlide + 1}/${SLIDES.length}`} />
              <Metric label="앱" value={activeAppData.label} />
              <Metric label="X" value={`${Math.round(cursor.x * 100)}%`} />
              <Metric label="Y" value={`${Math.round(cursor.y * 100)}%`} />
            </div>
            <div className="min-h-0 rounded-lg border border-foreground/10 bg-foreground/7 p-4 backdrop-blur-xl">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold">제어 로그</h2>
                <button
                  onClick={() => {
                    setActiveSlide(0)
                    setActiveApp("deck")
                    setLogs([])
                    addLog("초기화", "웹 PC 제어 상태를 초기화했습니다.", "success")
                  }}
                  className="grid h-8 w-8 place-items-center rounded-lg border border-foreground/10 bg-foreground/7 text-foreground/70 transition hover:bg-foreground/12 hover:text-foreground"
                  aria-label="상태 초기화"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
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
                    <p className="font-semibold">{log.action}</p>
                    <p className="mt-0.5 text-foreground/62">{log.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>

        <footer className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 rounded-lg border border-foreground/10 bg-background/34 px-4 py-3 text-xs text-foreground/62 backdrop-blur-xl">
          <span>웹 모드는 브라우저 내부 대상만 제어합니다.</span>
          <code className="rounded-md border border-foreground/10 bg-black/24 px-2 py-1 text-foreground/72">
            PYTHONPATH=src python -m gesture_bridge pc-control --live
          </code>
        </footer>
      </section>
    </main>
  )

  function shouldRunAction(action: ControlAction, now: number) {
    const cooldown = ACTION_COOLDOWN_MS[action]
    const last = lastActionAtRef.current[action] ?? 0
    if (now - last < cooldown) return false
    lastActionAtRef.current[action] = now
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
      className={`inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition ${
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

function IconButton({ icon: Icon, label, onClick }: { icon: typeof ChevronRight; label: string; onClick: () => void }) {
  return (
    <button
      data-pc-click
      onClick={onClick}
      className="grid h-9 w-9 place-items-center rounded-lg border border-white/12 bg-white/8 text-white/76 transition hover:bg-white/14 hover:text-white"
      aria-label={label}
    >
      <Icon className="h-4 w-4" />
    </button>
  )
}

function StatusTile({ icon: Icon, label, value }: { icon: typeof Camera; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-foreground/10 bg-background/22 p-3">
      <div className="mb-2 flex items-center gap-2 text-xs text-foreground/48">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className="truncate text-sm font-semibold text-foreground/88">{value}</p>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-foreground/10 bg-foreground/7 p-4 backdrop-blur-xl">
      <p className="text-[10px] text-foreground/42">{label}</p>
      <p className="mt-1 truncate text-lg font-semibold text-foreground/88">{value}</p>
    </div>
  )
}

function DesktopTopBar({ activeAction, cursor }: { activeAction: string; cursor: Point }) {
  return (
    <div className="absolute inset-x-0 top-0 z-20 flex h-11 items-center justify-between border-b border-white/10 bg-black/24 px-4 backdrop-blur-xl">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full bg-[#f87171]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#fbbf24]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#34d399]" />
      </div>
      <div className="hidden items-center gap-2 text-xs text-white/58 md:flex">
        <Monitor className="h-3.5 w-3.5" />
        <span>{activeAction}</span>
        <span className="text-white/28">/</span>
        <span>
          {Math.round(cursor.x * 100)}, {Math.round(cursor.y * 100)}
        </span>
      </div>
      <Keyboard className="h-4 w-4 text-white/48" />
    </div>
  )
}

function VirtualPcCursor({ pointer, gesture }: { pointer: Point; gesture: GestureName }) {
  const isClick = gesture === "pinch"
  return (
    <div
      className="pointer-events-none absolute z-[80] -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${pointer.x * 100}%`, top: `${pointer.y * 100}%` }}
    >
      <div className={`grid h-12 w-12 place-items-center rounded-full border backdrop-blur-md ${isClick ? "border-[#f2554a]/64 bg-[#f2554a]/18" : "border-white/70 bg-white/12"}`}>
        {isClick ? <MousePointerClick className="h-5 w-5 text-white" /> : <MousePointer2 className="h-5 w-5 text-white" />}
      </div>
      <div className="absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-black/62 px-2 py-1 text-[10px] text-white/74">
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

function updateScrollProgress(element: HTMLElement, setScrollProgress: (value: number) => void) {
  const max = element.scrollHeight - element.clientHeight
  setScrollProgress(max <= 0 ? 0 : Math.round((element.scrollTop / max) * 100))
}

function getAppSummary(appId: string) {
  if (appId === "notes") return "제스처 입력 결과와 문서 스크롤 상태를 함께 확인하는 작업 노트입니다."
  if (appId === "terminal") return "Python live 모드는 OS 입력 권한이 필요하므로 터미널에서 명시적으로 실행합니다."
  if (appId === "effects") return "웹 제어는 전역 OS 제어 대신 안전한 브라우저 조작으로 제한됩니다."
  return "슬라이드 넘김, 클릭, 스크롤 매핑을 같은 화면에서 검증합니다."
}

function getDocumentLine(index: number) {
  const lines = [
    "point 제스처는 커서 이동으로 들어오며 쿨다운 없이 매 프레임 좌표를 갱신합니다.",
    "pinch 제스처는 왼쪽 클릭으로 매핑되고 800ms 쿨다운을 적용합니다.",
    "peace 제스처와 좌우 swipe는 슬라이드 이동으로 매핑됩니다.",
    "thumbs_up은 위로 스크롤, thumbs_down은 아래로 스크롤입니다.",
    "웹 런타임은 브라우저 보안 경계 안의 대상만 클릭합니다.",
    "실제 OS 커서와 키보드 제어는 Python pyautogui 어댑터가 담당합니다.",
    "카메라 권한이 없으면 마우스 이동과 누름으로 point/pinch를 시뮬레이션합니다.",
    "같은 MediaPipe hand_landmarker.task 모델을 public/models에서 불러옵니다.",
  ]
  return lines[index % lines.length]
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
