"use client"

import { useState } from "react"
import { ChevronRight, Crosshair, HeartPulse, HelpCircle, RefreshCw, Timer, Trophy, type LucideIcon } from "lucide-react"
import { MINI_GAME_DEFINITIONS, type MiniGameDefinition } from "@/lib/interactive/features/mini-games"
import type { MiniGameHudState } from "@/lib/interactive/features/mini-game-runtime"
import type { MiniGameId } from "@/lib/interactive/types"

type GamePanelProps = {
  definition: MiniGameDefinition
  hud: MiniGameHudState
  selectedGame: MiniGameId
  onSelect: (game: MiniGameId) => void
  onRestart: () => void
  onNext: () => void
}

export function GamePanel({ definition, hud, selectedGame, onSelect, onRestart, onNext }: GamePanelProps) {
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
  icon: LucideIcon
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
