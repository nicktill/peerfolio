"use client"

import { motion, useMotionTemplate, useMotionValue, useReducedMotion } from "motion/react"
import { cn } from "@web/lib/utils"

/**
 * A card with a soft glow that follows the cursor, in the spirit of Magic UI's
 * "magic card". The glow only exists on hover and on devices with a pointer, so
 * touch screens just see the plain card.
 */
export function SpotlightCard({ className, children }: { className?: string; children: React.ReactNode }) {
  const x = useMotionValue(-200)
  const y = useMotionValue(-200)
  const reduceMotion = useReducedMotion()
  const glow = useMotionTemplate`radial-gradient(260px circle at ${x}px ${y}px, hsl(var(--primary) / 0.14), transparent 70%)`

  return (
    <div
      className={cn("group/spot relative overflow-hidden", className)}
      onPointerMove={(event) => {
        if (reduceMotion || event.pointerType === "touch") return
        const rect = event.currentTarget.getBoundingClientRect()
        x.set(event.clientX - rect.left)
        y.set(event.clientY - rect.top)
      }}
    >
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-300 group-hover/spot:opacity-100"
        style={{ background: glow }}
      />
      <div className="relative">{children}</div>
    </div>
  )
}
