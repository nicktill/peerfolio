"use client"

import { useEffect } from "react"
import { motion, useMotionTemplate, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react"

/**
 * The living backdrop of the signed-in app, in three layers behind everything, all leaning toward the
 * market's `--mood` (green on an up day, red on a down day, the brand colour otherwise; see `AppShell`).
 * The cursor's light and the dots it lights take it fully; the colour washes only partly:
 *  - two soft colour washes that drift on their own and lean toward the cursor,
 *  - a faint light that follows the cursor across the page,
 *  - the page's dot grid, which brightens in a circle around the cursor like a torch on a pegboard.
 * Only the mouse drives it (touch screens just get the slow drift), only transforms and gradients
 * move (no blur filter), and with reduced motion it's absent.
 */
export function Aurora() {
  const reduceMotion = useReducedMotion()
  // Where the cursor is, 0 to 1 across the window, for the washes to lean toward.
  const lean = { x: useMotionValue(0.5), y: useMotionValue(0.3) }
  const leanX = useSpring(lean.x, { stiffness: 50, damping: 22, mass: 0.9 })
  const leanY = useSpring(lean.y, { stiffness: 50, damping: 22, mass: 0.9 })
  // Where the cursor is in pixels, for the light and the dot grid. Starts off screen.
  const pointX = useSpring(useMotionValue(-600), { stiffness: 240, damping: 30, mass: 0.6 })
  const pointY = useSpring(useMotionValue(-600), { stiffness: 240, damping: 30, mass: 0.6 })

  useEffect(() => {
    if (reduceMotion) return
    const move = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return
      lean.x.set(event.clientX / window.innerWidth)
      lean.y.set(event.clientY / window.innerHeight)
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
  }, [reduceMotion, lean.x, lean.y, pointX, pointY])

  const washAX = useTransform(leanX, [0, 1], [-110, 110])
  const washAY = useTransform(leanY, [0, 1], [-50, 50])
  const washBX = useTransform(leanX, [0, 1], [90, -90])
  const washBY = useTransform(leanY, [0, 1], [40, -40])
  const light = useMotionTemplate`radial-gradient(460px circle at ${pointX}px ${pointY}px, color-mix(in srgb, var(--mood) 11%, transparent), transparent 72%)`
  const dotMask = useMotionTemplate`radial-gradient(230px circle at ${pointX}px ${pointY}px, #000, transparent 78%)`

  if (reduceMotion) return null

  return (
    <>
      <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 h-[640px] overflow-hidden" style={{ zIndex: -1 }}>
        <motion.div className="absolute -left-52 -top-60 size-[46rem] will-change-transform" style={{ x: washAX, y: washAY }}>
          <motion.div
            className="size-full rounded-full"
            style={{ background: "radial-gradient(closest-side, color-mix(in srgb, var(--mood) 11%, transparent), transparent)" }}
            animate={{ x: [0, 120, -30, 0], y: [0, 50, 20, 0] }}
            transition={{ duration: 28, repeat: Infinity, ease: "easeInOut" }}
          />
        </motion.div>
        <motion.div className="absolute -right-44 -top-52 size-[42rem] will-change-transform" style={{ x: washBX, y: washBY }}>
          <motion.div
            className="size-full rounded-full"
            style={{ background: "radial-gradient(closest-side, color-mix(in srgb, color-mix(in srgb, var(--mood) 35%, var(--series-1)) 13%, transparent), transparent)" }}
            animate={{ x: [0, -110, 40, 0], y: [0, 60, 0, 0] }}
            transition={{ duration: 34, repeat: Infinity, ease: "easeInOut" }}
          />
        </motion.div>
      </div>

      <motion.div aria-hidden className="pointer-events-none fixed inset-0" style={{ zIndex: -1, background: light }} />
      {/* The same 22px dot grid as the page background, brighter, shown only near the cursor. */}
      <motion.div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          zIndex: -1,
          background: "radial-gradient(color-mix(in srgb, var(--mood) 60%, transparent) 1.1px, transparent 1.6px) 0 0 / 22px 22px",
          WebkitMaskImage: dotMask,
          maskImage: dotMask,
        }}
      />
    </>
  )
}
