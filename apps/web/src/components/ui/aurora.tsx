"use client"

import { useEffect } from "react"
import { motion, useMotionTemplate, useMotionValue, useReducedMotion, useSpring } from "motion/react"

/**
 * The cursor's light on the signed-in app's background, in two layers behind everything:
 *  - a faint light that follows the cursor,
 *  - the page's dot grid, which brightens in a circle around the cursor like a torch on a pegboard.
 * Both take the market's `--mood` (green on an up day, red on a down day, a clean mint otherwise; see
 * `AppShell`). The page itself carries no colour of its own: this is the only tint. Only the mouse drives
 * it, only gradients and a mask move (no blur filter), and with reduced motion it's absent.
 */
export function Aurora() {
  const reduceMotion = useReducedMotion()
  // Where the cursor is, in pixels. Starts off screen.
  const pointX = useSpring(useMotionValue(-600), { stiffness: 240, damping: 30, mass: 0.6 })
  const pointY = useSpring(useMotionValue(-600), { stiffness: 240, damping: 30, mass: 0.6 })

  useEffect(() => {
    if (reduceMotion) return
    const move = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return
      pointX.set(event.clientX)
      pointY.set(event.clientY)
    }
    const leave = () => {
      pointX.set(-600)
      pointY.set(-600)
    }
    window.addEventListener("pointermove", move, { passive: true })
    document.documentElement.addEventListener("pointerleave", leave)
    return () => {
      window.removeEventListener("pointermove", move)
      document.documentElement.removeEventListener("pointerleave", leave)
    }
  }, [reduceMotion, pointX, pointY])

  const light = useMotionTemplate`radial-gradient(460px circle at ${pointX}px ${pointY}px, color-mix(in srgb, var(--mood) 7%, transparent), transparent 72%)`
  const dotMask = useMotionTemplate`radial-gradient(230px circle at ${pointX}px ${pointY}px, #000, transparent 78%)`

  if (reduceMotion) return null

  return (
    <>
      <motion.div aria-hidden className="pointer-events-none fixed inset-0" style={{ zIndex: -1, background: light }} />
      {/* The same 22px dot grid as the page background, brighter, shown only near the cursor. */}
      <motion.div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          zIndex: -1,
          background: "radial-gradient(color-mix(in srgb, var(--mood) 40%, transparent) 1.1px, transparent 1.6px) 0 0 / 22px 22px",
          WebkitMaskImage: dotMask,
          maskImage: dotMask,
        }}
      />
    </>
  )
}
