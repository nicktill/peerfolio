"use client"

import { useEffect, useRef } from "react"
import { motion, useMotionTemplate, useMotionValue, useReducedMotion, useSpring } from "motion/react"

/**
 * Lights the hero's grid paper around the cursor, with a soft glow, so the backdrop answers the mouse.
 * Put it inside the `relative` backdrop; it measures itself, so it works in any section. Mouse only.
 */
export function CursorTorch() {
  const reduceMotion = useReducedMotion()
  const ref = useRef<HTMLDivElement>(null)
  const x = useSpring(useMotionValue(-600), { stiffness: 240, damping: 30, mass: 0.6 })
  const y = useSpring(useMotionValue(-600), { stiffness: 240, damping: 30, mass: 0.6 })

  useEffect(() => {
    if (reduceMotion) return
    const move = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || !ref.current) return
      const rect = ref.current.getBoundingClientRect()
      const inside = event.clientY >= rect.top - 120 && event.clientY <= rect.bottom + 120
      x.set(inside ? event.clientX - rect.left : -600)
      y.set(inside ? event.clientY - rect.top : -600)
    }
    window.addEventListener("pointermove", move, { passive: true })
    return () => window.removeEventListener("pointermove", move)
  }, [reduceMotion, x, y])

  const glow = useMotionTemplate`radial-gradient(380px circle at ${x}px ${y}px, hsl(var(--primary) / 0.14), transparent 70%)`
  const mask = useMotionTemplate`radial-gradient(260px circle at ${x}px ${y}px, #000, transparent 75%)`

  if (reduceMotion) return null

  return (
    <div ref={ref} aria-hidden className="pointer-events-none absolute inset-0">
      <motion.div className="absolute inset-0" style={{ background: glow }} />
      <motion.div className="hero-grid absolute inset-0" style={{ WebkitMaskImage: mask, maskImage: mask, filter: "brightness(0.55) saturate(1.6)" }} />
    </div>
  )
}
