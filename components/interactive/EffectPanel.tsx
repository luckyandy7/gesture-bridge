"use client"

import { memo } from "react"
import { Sparkles } from "lucide-react"
import { EFFECT_DEFINITIONS, getEffectDefinition } from "@/lib/interactive/features/effects"
import type { EffectId } from "@/lib/interactive/types"

type EffectPanelProps = {
  activeEffect: EffectId
  effectPower: number
  onPower: (power: number) => void
  onTrigger: (effect: EffectId) => void
}

export const EffectPanel = memo(function EffectPanel({ activeEffect, effectPower, onPower, onTrigger }: EffectPanelProps) {
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
