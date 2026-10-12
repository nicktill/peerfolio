"use client"

import { motion, useMotionTemplate, useMotionValue, useReducedMotion, useSpring } from "motion/react"
import { cn } from "@web/lib/utils"

/**
 * Tips toward the cursor with a soft light that follows it, so a card feels like a
 * physical object. Pass the card's own classes as `className`; the tilt, spring
 * and glow are added around it. Mouse only, and flat with reduced motion.
 */
export function TiltCard({
  className,
  style,
  max = 3,
  glow: tinted = false,
  glare = true,
  children,
}: {
  className?: string
  style?: React.CSSProperties
  /** Greatest tilt, in degrees. */
  max?: number
  /** Tint the cursor light with the accent colour instead of the neutral primary. */
  glow?: boolean
  /** Draw the soft light that follows the cursor. Off keeps the tilt only. */
  glare?: boolean
  children: React.ReactNode
}) {
  const reduceMotion = useReducedMotion()
  const rotateX = useSpring(0, { stiffness: 170, damping: 19, mass: 0.7 })
  const rotateY = useSpring(0, { stiffness: 170, damping: 19, mass: 0.7 })
  const x = useMotionValue(-300)
  const y = useMotionValue(-300)
  const glow = useMotionTemplate`radial-gradient(320px circle at ${x}px ${y}px, ${tinted ? "rgba(var(--accent-a), 0.14)" : "hsl(var(--primary) / 0.13)"}, rgba(var(--accent-a), 0) 72%)`

  if (reduceMotion) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    )
  }

  return (
    <motion.div
      className={cn("group/tilt relative", className)}
      style={{ ...style, rotateX, rotateY, transformPerspective: 1200, willChange: "transform" }}
      onPointerMove={(event) => {
        if (event.pointerType !== "mouse") return
        const rect = event.currentTarget.getBoundingClientRect()
        const px = (event.clientX - rect.left) / rect.width - 0.5
        const py = (event.clientY - rect.top) / rect.height - 0.5
        rotateY.set(px * max * 1.7)
        rotateX.set(-py * max * 2.1)
        x.set(event.clientX - rect.left)
        y.set(event.clientY - rect.top)
      }}
      onPointerLeave={() => {
        rotateX.set(0)
        rotateY.set(0)
      }}
    >
      {children}
      {glare ? <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-300 group-hover/tilt:opacity-100"
        style={{ background: glow }}
      /> : null}
    </motion.div>
  )
}
