"use client"

import { useEffect, useRef } from "react"

/**
 * A fine dot matrix that fades out from the top, two soft glows, film grain,
 * and a pool of green light that trails the cursor and brightens the dots it
 * passes over. Everything but the trailing light is plain CSS; with reduced
 * motion or no hover (touch) the light simply rests where it started.
 */
export function HeroBackdrop() {
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = root.current
    if (!element) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    if (!window.matchMedia("(hover: hover)").matches) return

    // Ease toward the pointer instead of snapping to it, so the light has weight.
    let frame = 0
    let x = 50
    let y = 30
    let targetX = x
    let targetY = y
    const tick = () => {
      x += (targetX - x) * 0.09
      y += (targetY - y) * 0.09
      element.style.setProperty("--lx", `${x.toFixed(2)}%`)
      element.style.setProperty("--ly", `${y.toFixed(2)}%`)
      frame = Math.abs(targetX - x) + Math.abs(targetY - y) > 0.05 ? requestAnimationFrame(tick) : 0
    }
    const onMove = (event: PointerEvent) => {
      const rect = element.getBoundingClientRect()
      targetX = ((event.clientX - rect.left) / rect.width) * 100
      targetY = ((event.clientY - rect.top) / rect.height) * 100
      if (!frame) frame = requestAnimationFrame(tick)
    }
    window.addEventListener("pointermove", onMove, { passive: true })
    return () => {
      window.removeEventListener("pointermove", onMove)
      cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <div ref={root} aria-hidden className="hero-field pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="hero-dots absolute inset-0" />
      <div className="hero-dots-lit absolute inset-0" />
      <div className="absolute -top-24 left-[10%] size-[28rem] rounded-full bg-primary/20 blur-3xl dark:bg-primary/15" />
      <div className="absolute right-[5%] top-40 size-[22rem] rounded-full bg-[var(--series-1)]/15 blur-3xl" />
      <div className="hero-grain absolute inset-0" />
    </div>
  )
}
