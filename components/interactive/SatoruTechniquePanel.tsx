"use client"

export function SatoruTechniquePanel() {
  return (
    <div className="absolute inset-0 z-[26] overflow-hidden bg-black">
      <iframe
        title="SAT0RU original cursed technique visualizer"
        src="/vendor/sat0ru/index.html"
        allow="camera; microphone; fullscreen"
        className="h-full w-full border-0"
      />
      <div className="pointer-events-none absolute bottom-4 right-4 rounded-lg border border-white/14 bg-black/48 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-white/54 backdrop-blur-xl">
        Original SAT0RU embedded
      </div>
    </div>
  )
}
