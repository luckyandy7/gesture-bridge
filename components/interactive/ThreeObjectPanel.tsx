"use client"

import { useEffect, useRef, useState } from "react"
import { Box, ChevronRight, RefreshCw } from "lucide-react"
import {
  getThreeSceneDefinition,
  THREE_QUALITY_OPTIONS,
  THREE_SCENE_DEFINITIONS,
  type ThreeQuality,
  type ThreeSceneId,
} from "@/lib/interactive/features/three-scene-config"
import { InteractiveThreeRuntime, type ThreeRuntimeTelemetry } from "@/lib/interactive/features/three-scene-runtime"
import { GESTURE_LABELS } from "@/lib/interactive/gesture/gesture-recognizer"
import type { GestureSnapshot } from "@/lib/interactive/types"

type ThreeObjectPanelProps = {
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
}

export function ThreeObjectPanel({
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
}: ThreeObjectPanelProps) {
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

function compactNumber(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`
  return `${value}`
}
