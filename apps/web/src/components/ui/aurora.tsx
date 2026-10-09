"use client"

import { useEffect } from "react"
import {
  motion,
  useAnimationFrame,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react"

/**
 * The living backdrop of the signed-in app, in layers behind everything, all leaning toward the market's
 * `--mood` (green on an up day, red on a down day, a clean mint otherwise; see `AppShell`):
 *  - three soft colour washes that wander on their own, each on slow, unrelated cycles so the motion never
 *    visibly repeats, and lean a little toward the cursor,
 *  - a faint light that follows the cursor,
 *  - the page's dot grid, which brightens in a circle around the cursor like a torch on a pegboard.
 * The washes are subtler on the light theme (`--aurora-a`). Only the mouse drives the cursor layers; only
 * transforms and gradients move (no blur filter); with reduced motion it's absent.
 */
export function Aurora() {
  const reduceMotion = useReducedMotion()
  // Where the cursor is, 0 to 1 across the window, for the washes to lean toward.
  const lean = { x: useMotionValue(0.5), y: useMotionValue(0.3) }
  const leanX = useSpring(lean.x, { stiffness: 40, damping: 22, mass: 1 })
  const leanY = useSpring(lean.y, { stiffness: 40, damping: 22, mass: 1 })
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

  const light = useMotionTemplate`radial-gradient(460px circle at ${pointX}px ${pointY}px, color-mix(in srgb, var(--mood) 7%, transparent), transparent 72%)`
  const dotMask = useMotionTemplate`radial-gradient(230px circle at ${pointX}px ${pointY}px, #000, transparent 78%)`

  if (reduceMotion) return null

  return (
    <>
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden" style={{ zIndex: -1 }}>
        <Wash
          className="-left-56 -top-64 size-[50rem]"
          color="color-mix(in srgb, var(--mood) calc(11% * var(--aurora-a)), transparent)"
          leanX={leanX}
          leanY={leanY}
          pull={[-120, -55]}
          drift={{ x: 150, y: 70, speed: 0.105, phase: 0.4 }}
        />
        <Wash
          className="-right-48 -top-56 size-[46rem]"
          color="color-mix(in srgb, color-mix(in srgb, var(--mood) 35%, var(--series-1)) calc(13% * var(--aurora-a)), transparent)"
          leanX={leanX}
          leanY={leanY}
          pull={[95, 45]}
          drift={{ x: 130, y: 85, speed: 0.082, phase: 2.1 }}
        />
        <Wash
          className="left-[22%] top-[44%] size-[40rem]"
          color="color-mix(in srgb, var(--mood) calc(6% * var(--aurora-a)), transparent)"
          leanX={leanX}
          leanY={leanY}
          pull={[60, 40]}
          drift={{ x: 170, y: 110, speed: 0.061, phase: 4.3 }}
        />
      </div>

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

/**
 * One wash. Its own wandering is a sum of slow sine waves at unrelated rates (so the path doesn't visibly
 * loop), plus a slow swell in size; an outer layer leans it toward the cursor.
 */
function Wash({
  className,
  color,
  leanX,
  leanY,
  pull,
  drift,
}: {
  className: string
  color: string
  leanX: MotionValue<number>
  leanY: MotionValue<number>
  pull: [number, number]
  drift: { x: number; y: number; speed: number; phase: number }
}) {
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const scale = useMotionValue(1)
  useAnimationFrame((time) => {
    const t = time / 1000
    const { x: ax, y: ay, speed, phase } = drift
    x.set(Math.sin(t * speed + phase) * ax + Math.sin(t * speed * 0.41 + phase * 2.2) * ax * 0.45)
    y.set(Math.cos(t * speed * 0.87 + phase * 1.4) * ay + Math.sin(t * speed * 0.53 + phase) * ay * 0.4)
    scale.set(1 + Math.sin(t * speed * 0.6 + phase) * 0.08)
  })
  const pullX = useTransform(leanX, [0, 1], [pull[0], -pull[0]])
  const pullY = useTransform(leanY, [0, 1], [pull[1], -pull[1]])

  return (
    <motion.div className={`absolute will-change-transform ${className}`} style={{ x: pullX, y: pullY }}>
      <motion.div className="size-full rounded-full" style={{ x, y, scale, background: `radial-gradient(closest-side, ${color}, transparent)` }} />
    </motion.div>
  )
}
