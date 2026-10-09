"use client"

import { motion, useReducedMotion } from "motion/react"

/**
 * Two soft colour washes that drift slowly behind the top of the signed-in app, so
 * the page has a quiet sense of life without anything to read or click. They fade
 * out through their own gradient (no blur filter, no mask over moving layers), only
 * transforms animate, and they're absent with reduced motion.
 */
export function Aurora() {
  const reduceMotion = useReducedMotion()
  if (reduceMotion) return null

  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 h-[640px] overflow-hidden" style={{ zIndex: -1 }}>
      <motion.div
        className="absolute -left-52 -top-60 size-[46rem] rounded-full will-change-transform"
        style={{ background: "radial-gradient(closest-side, hsl(var(--primary) / 0.11), transparent)" }}
        animate={{ x: [0, 120, -30, 0], y: [0, 50, 20, 0] }}
        transition={{ duration: 28, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -right-44 -top-52 size-[42rem] rounded-full will-change-transform"
        style={{ background: "radial-gradient(closest-side, color-mix(in srgb, var(--series-1) 12%, transparent), transparent)" }}
        animate={{ x: [0, -110, 40, 0], y: [0, 60, 0, 0] }}
        transition={{ duration: 34, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  )
}
