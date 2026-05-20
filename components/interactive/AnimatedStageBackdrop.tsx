"use client"

import { Shader, ChromaFlow, Swirl } from "shaders/react"

export function AnimatedStageBackdrop() {
  return (
    <>
      <Shader className="absolute inset-0 h-full w-full opacity-100">
        <Swirl colorA="#1275d8" colorB="#e19136" speed={0.8} detail={1.18} mixBlendMode="soft-light" />
        <ChromaFlow baseColor="#0066ff" upColor="#0066ff" leftColor="#e19136" rightColor="#e19136" downColor="#d1d1d1" opacity={0.97} range={0.22} speed={0.1} scale={1.8} />
      </Shader>
      <StageBackdropOverlay />
    </>
  )
}

function StageBackdropOverlay() {
  return (
    <>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_24%_16%,rgba(0,102,255,0.34),transparent_28%),radial-gradient(circle_at_82%_36%,rgba(225,145,54,0.30),transparent_30%),linear-gradient(180deg,rgba(0,0,0,0.22),rgba(0,0,0,0.78))]" />
      <div className="absolute inset-0 bg-black/22" />
    </>
  )
}
