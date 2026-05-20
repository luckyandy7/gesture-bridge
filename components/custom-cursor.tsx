"use client"

import { useEffect, useRef, useState } from "react"

export function CustomCursor() {
  const outerRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const positionRef = useRef({ x: 0, y: 0 })
  const targetPositionRef = useRef({ x: 0, y: 0 })
  const isPointerRef = useRef(false)
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)")
    const coarsePointerQuery = window.matchMedia("(pointer: coarse)")
    const syncEnabled = () => setEnabled(!reducedMotionQuery.matches && !coarsePointerQuery.matches)

    syncEnabled()
    reducedMotionQuery.addEventListener("change", syncEnabled)
    coarsePointerQuery.addEventListener("change", syncEnabled)

    return () => {
      reducedMotionQuery.removeEventListener("change", syncEnabled)
      coarsePointerQuery.removeEventListener("change", syncEnabled)
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    let animationFrameId: number | null = null

    const lerp = (start: number, end: number, factor: number) => {
      return start + (end - start) * factor
    }

    const updateCursor = () => {
      const deltaX = targetPositionRef.current.x - positionRef.current.x
      const deltaY = targetPositionRef.current.y - positionRef.current.y
      positionRef.current.x = lerp(positionRef.current.x, targetPositionRef.current.x, 0.15)
      positionRef.current.y = lerp(positionRef.current.y, targetPositionRef.current.y, 0.15)

      if (outerRef.current && innerRef.current) {
        const scale = isPointerRef.current ? 1.5 : 1
        const innerScale = isPointerRef.current ? 0.5 : 1

        outerRef.current.style.transform = `translate3d(${positionRef.current.x}px, ${positionRef.current.y}px, 0) translate(-50%, -50%) scale(${scale})`
        innerRef.current.style.transform = `translate3d(${positionRef.current.x}px, ${positionRef.current.y}px, 0) translate(-50%, -50%) scale(${innerScale})`
      }

      if (Math.abs(deltaX) > 0.15 || Math.abs(deltaY) > 0.15) {
        animationFrameId = requestAnimationFrame(updateCursor)
      } else {
        animationFrameId = null
      }
    }

    const scheduleUpdate = () => {
      if (animationFrameId === null) {
        animationFrameId = requestAnimationFrame(updateCursor)
      }
    }

    const handleMouseMove = (e: MouseEvent) => {
      targetPositionRef.current = { x: e.clientX, y: e.clientY }

      const target = e.target as HTMLElement
      isPointerRef.current =
        window.getComputedStyle(target).cursor === "pointer" || target.tagName === "BUTTON" || target.tagName === "A"
      scheduleUpdate()
    }

    window.addEventListener("mousemove", handleMouseMove, { passive: true })

    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
      if (animationFrameId !== null) cancelAnimationFrame(animationFrameId)
    }
  }, [enabled])

  if (!enabled) return null

  return (
    <>
      <div
        ref={outerRef}
        className="pointer-events-none fixed left-0 top-0 z-50 mix-blend-difference will-change-transform"
        style={{ contain: "layout style paint" }}
      >
        <div className="h-4 w-4 rounded-full border-2 border-white" />
      </div>
      <div
        ref={innerRef}
        className="pointer-events-none fixed left-0 top-0 z-50 mix-blend-difference will-change-transform"
        style={{ contain: "layout style paint" }}
      >
        <div className="h-2 w-2 rounded-full bg-white" />
      </div>
    </>
  )
}
