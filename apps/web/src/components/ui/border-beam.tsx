"use client"

import { motion, useReducedMotion } from "motion/react"
import { cn } from "@web/lib/utils"

/**
 * A short bright streak that travels around a card's border, in the spirit of Magic UI's
 * "border beam". Put it inside a `relative overflow-hidden` card with rounded corners; it
 * inherits the card's radius and sits above the border without catching clicks.
 * Hidden with reduced motion, where a moving light would only be a distraction.
 */
export function BorderBeam({
  className,
  size = 140,
  duration = 9,
  delay = 0,
  from = "hsl(var(--primary))",
  to = "hsl(var(--primary) / 0)",
}: {
  className?: string
  size?: number
  duration?: number
  delay?: number
  from?: string
  to?: string
}) {
  const reduceMotion = useReducedMotion()
  if (reduceMotion) return null

  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 rounded-[inherit] border border-transparent", className)}
      style={{
        // Shows only the 1px border area, so the streak reads as a line of light, not a glow over the card.
        WebkitMask: "linear-gradient(transparent, transparent), linear-gradient(#000, #000)",
        WebkitMaskClip: "padding-box, border-box",
        WebkitMaskComposite: "xor",
        mask: "linear-gradient(transparent, transparent), linear-gradient(#000, #000)",
        maskClip: "padding-box, border-box",
        maskComposite: "intersect",
      }}
    >
      <motion.div
        className="absolute aspect-square"
        style={{
          width: size,
          background: `linear-gradient(to left, ${from}, ${to}, transparent)`,
          offsetPath: `rect(0 auto auto 0 round ${size}px)`,
        }}
        initial={{ offsetDistance: "0%" }}
        animate={{ offsetDistance: "100%" }}
        transition={{ repeat: Infinity, ease: "linear", duration, delay: -delay }}
      />
    </div>
  )
}
