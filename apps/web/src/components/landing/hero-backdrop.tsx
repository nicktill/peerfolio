"use client"

import { useEffect, useRef } from "react"

/**
 * A fine dot matrix that fades out from the top, film grain, and a pool of green
 * light that trails the cursor and brightens the dots it passes over.
 *
 * `hero` (landing page) sits in its section and adds two soft glows. `app` (the
 * signed-in shell) is fixed to the viewport, much quieter, and never goes still:
 * when the cursor rests, the light wanders on its own slow path. With reduced
 * motion, or on touch (no hover), the light just stays where it started.
 */
export function HeroBackdrop({ variant = "hero" }: { variant?: "hero" | "app" }) {
  const root = useRef<HTMLDivElement>(null)
  const ambient = variant === "app"

  useEffect(() => {
    const element = root.current
    if (!element) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const hover = window.matchMedia("(hover: hover)").matches
    if (!hover && !ambient) return

    let frame = 0
    let x = 50
    let y = 30
    let targetX = x
    let targetY = y
    let lastMove = 0
    let lastDraw = 0

    const tick = (now: number) => {
      // The app's light drifts whenever the cursor has been still for a moment.
      if (ambient && now - lastMove > 2500) {
        targetX = 50 + 34 * Math.sin(now / 9000)
        targetY = 34 + 22 * Math.sin(now / 6400 + 1.2)
      }
      // Ease toward the target instead of snapping to it, so the light has weight.
      x += (targetX - x) * 0.06
      y += (targetY - y) * 0.06
      // The ambient loop never ends, so hold it to ~30fps; the mask repaints each frame.
      if (!ambient || now - lastDraw > 32) {
        lastDraw = now
        element.style.setProperty("--lx", `${x.toFixed(2)}%`)
        element.style.setProperty("--ly", `${y.toFixed(2)}%`)
      }
      frame = ambient || Math.abs(targetX - x) + Math.abs(targetY - y) > 0.05 ? requestAnimationFrame(tick) : 0
    }
    const onMove = (event: PointerEvent) => {
      const rect = element.getBoundingClientRect()
      targetX = ((event.clientX - rect.left) / rect.width) * 100
      targetY = ((event.clientY - rect.top) / rect.height) * 100
      lastMove = performance.now()
      if (!frame) frame = requestAnimationFrame(tick)
    }

    if (hover) window.addEventListener("pointermove", onMove, { passive: true })
    if (ambient) frame = requestAnimationFrame(tick)
    return () => {
      window.removeEventListener("pointermove", onMove)
      cancelAnimationFrame(frame)
    }
  }, [ambient])

  return (
    <div
      ref={root}
      aria-hidden
      className={
        ambient
          ? "hero-field hero-field-app pointer-events-none fixed inset-0 -z-10 overflow-hidden"
          : "hero-field pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      }
    >
      <div className="hero-dots absolute inset-0" />
      <div className="hero-dots-lit absolute inset-0" />
      {ambient ? null : (
        <>
          <div className="absolute -top-24 left-[10%] size-[28rem] rounded-full bg-primary/20 blur-3xl dark:bg-primary/15" />
          <div className="absolute right-[5%] top-40 size-[22rem] rounded-full bg-[var(--series-1)]/15 blur-3xl" />
          <div className="hero-grain absolute inset-0" />
        </>
      )}
    </div>
  )
}
