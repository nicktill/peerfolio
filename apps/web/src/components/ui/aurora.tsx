"use client"

import { motion, useReducedMotion } from "motion/react"

/**
 * Two soft colour washes that drift slowly behind the top of the signed-in app, so
 * the page has a quiet sense of life without anything to read or click. Only
 * transforms animate, and it's absent with reduced motion.
 */
export function Aurora() {
  const reduceMotion = useReducedMotion()
  if (reduceMotion) return null

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 h-[680px] overflow-hidden [mask-image:linear-gradient(#000_30%,transparent)]"
      style={{ zIndex: -1 }}
    >
      <motion.div
        className="absolute -left-44 -top-44 size-[36rem] rounded-full bg-primary/[0.16] blur-3xl"
        animate={{ x: [0, 120, -30, 0], y: [0, 50, 20, 0] }}
        transition={{ duration: 28, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -right-32 -top-32 size-[32rem] rounded-full blur-3xl"
        style={{ background: "color-mix(in srgb, var(--series-1) 20%, transparent)" }}
        animate={{ x: [0, -110, 40, 0], y: [0, 60, 0, 0] }}
        transition={{ duration: 34, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  )
}
