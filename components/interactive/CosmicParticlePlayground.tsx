"use client"

import { useEffect, useRef } from "react"
import type { GestureName, Point } from "@/lib/interactive/types"

type CosmicParticlePlaygroundProps = {
  pointer: Point
  activeGesture: GestureName
  pinching: boolean
}

type CosmicParticle = {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  twinkle: number
  hue: number
}

export function CosmicParticlePlayground({ pointer, activeGesture, pinching }: CosmicParticlePlaygroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pointerRef = useRef(pointer)
  const gestureRef = useRef(activeGesture)
  const pinchingRef = useRef(pinching)

  useEffect(() => {
    pointerRef.current = pointer
    gestureRef.current = activeGesture
    pinchingRef.current = pinching
  }, [activeGesture, pinching, pointer])

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext("2d")
    if (!canvas || !context) return

    let raf = 0
    let width = 0
    let height = 0
    let particles: CosmicParticle[] = []

    const seedParticles = () => {
      particles = Array.from({ length: 190 }, (_, index) => {
        const angle = Math.random() * Math.PI * 2
        const speed = 0.12 + Math.random() * 0.34
        return {
          x: Math.random() * width,
          y: Math.random() * height,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          size: 0.8 + Math.random() * 2.8,
          twinkle: Math.random() * Math.PI * 2,
          hue: [198, 224, 262, 315, 36][index % 5],
        }
      })
    }

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const scale = Math.min(window.devicePixelRatio || 1, 2)
      const nextWidth = Math.max(1, Math.floor(rect.width))
      const nextHeight = Math.max(1, Math.floor(rect.height))
      if (nextWidth === width && nextHeight === height) return
      width = nextWidth
      height = nextHeight
      canvas.width = Math.floor(width * scale)
      canvas.height = Math.floor(height * scale)
      context.setTransform(scale, 0, 0, scale, 0, 0)
      seedParticles()
    }

    const draw = (time: number) => {
      resize()
      const point = pointerRef.current
      const gesture = pinchingRef.current ? "pinch" : gestureRef.current
      const px = point.x * width
      const py = point.y * height
      const pull =
        gesture === "pinch"
          ? 1.45
          : gesture === "two_hands_spread"
            ? -1.65
            : gesture === "open_palm"
              ? -0.92
              : gesture === "point"
                ? 0.62
                : 0.28

      const bg = context.createRadialGradient(px, py, 10, width * 0.5, height * 0.48, Math.max(width, height) * 0.82)
      bg.addColorStop(0, "rgba(49, 93, 154, 0.20)")
      bg.addColorStop(0.44, "rgba(8, 13, 31, 0.22)")
      bg.addColorStop(1, "rgba(2, 5, 14, 0.32)")
      context.fillStyle = bg
      context.fillRect(0, 0, width, height)

      for (let index = 0; index < particles.length; index += 1) {
        const particle = particles[index]
        const dx = px - particle.x
        const dy = py - particle.y
        const distance = Math.max(1, Math.hypot(dx, dy))
        const range = gesture === "pinch" ? 360 : 290
        if (distance < range) {
          const strength = (1 - distance / range) * pull
          particle.vx += (dx / distance) * strength * 0.036
          particle.vy += (dy / distance) * strength * 0.036
          if (gesture === "pinch") {
            particle.vx += (-dy / distance) * 0.055
            particle.vy += (dx / distance) * 0.055
          }
        }

        particle.x += particle.vx
        particle.y += particle.vy
        particle.vx *= 0.985
        particle.vy *= 0.985
        particle.twinkle += 0.035

        if (particle.x < -20) particle.x = width + 20
        if (particle.x > width + 20) particle.x = -20
        if (particle.y < -20) particle.y = height + 20
        if (particle.y > height + 20) particle.y = -20

        const glow = 0.48 + Math.sin(particle.twinkle + time * 0.001) * 0.22
        context.beginPath()
        context.fillStyle = `hsla(${particle.hue}, 86%, ${68 + glow * 12}%, ${0.28 + glow * 0.38})`
        context.shadowColor = `hsla(${particle.hue}, 92%, 72%, 0.75)`
        context.shadowBlur = 14
        context.arc(particle.x, particle.y, particle.size * (0.74 + glow), 0, Math.PI * 2)
        context.fill()
      }

      context.shadowBlur = 0
      context.lineWidth = 1
      for (let index = 0; index < particles.length; index += 4) {
        const particle = particles[index]
        const distanceToPointer = Math.hypot(px - particle.x, py - particle.y)
        if (distanceToPointer > 230) continue
        context.strokeStyle = `rgba(189, 221, 255, ${Math.max(0, 0.22 - distanceToPointer / 1200)})`
        context.beginPath()
        context.moveTo(px, py)
        context.lineTo(particle.x, particle.y)
        context.stroke()
      }

      const aura = context.createRadialGradient(px, py, 0, px, py, gesture === "pinch" ? 118 : 78)
      aura.addColorStop(0, "rgba(244, 246, 255, 0.18)")
      aura.addColorStop(0.4, "rgba(101, 169, 255, 0.10)")
      aura.addColorStop(1, "rgba(255, 255, 255, 0)")
      context.fillStyle = aura
      context.beginPath()
      context.arc(px, py, gesture === "pinch" ? 118 : 78, 0, Math.PI * 2)
      context.fill()

      raf = requestAnimationFrame(draw)
    }

    resize()
    raf = requestAnimationFrame(draw)
    window.addEventListener("resize", resize)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("resize", resize)
    }
  }, [])

  return (
    <div className="pointer-events-none absolute inset-0 z-[24] overflow-hidden">
      <canvas ref={canvasRef} data-testid="cosmic-particle-canvas" className="h-full w-full" />
      <div className="absolute bottom-5 right-5 w-[min(330px,calc(100%-40px))] rounded-lg border border-white/14 bg-black/32 p-4 text-white shadow-2xl shadow-sky-950/30 backdrop-blur-xl">
        <p className="text-[10px] uppercase tracking-[0.28em] text-white/46">nostalgic particle field</p>
        <h2 className="mt-1 text-xl font-semibold">Deep Space Particles</h2>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            data-testid="cosmic-particle-intensity"
            className="h-full rounded-full bg-[linear-gradient(90deg,#8bd3ff,#f5b2ff,#f4c76e)] transition-[width] duration-300"
            style={{ width: pinching ? "92%" : activeGesture === "two_hands_spread" ? "78%" : "56%" }}
          />
        </div>
      </div>
    </div>
  )
}
