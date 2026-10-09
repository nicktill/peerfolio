"use client"

import { motion, useMotionValue, useReducedMotion, useSpring } from "motion/react"

/** Draws a button a little toward the cursor as it nears, and lets go when it leaves. Mouse only. */
export function Magnetic({ children, strength = 0.28, className }: { children: React.ReactNode; strength?: number; className?: string }) {
  const reduceMotion = useReducedMotion()
  const x = useSpring(useMotionValue(0), { stiffness: 220, damping: 18, mass: 0.5 })
  const y = useSpring(useMotionValue(0), { stiffness: 220, damping: 18, mass: 0.5 })

  if (reduceMotion) return <div className={className}>{children}</div>

  return (
    <motion.div
      className={className}
      style={{ x, y }}
      onPointerMove={(event) => {
        if (event.pointerType !== "mouse") return
        const rect = event.currentTarget.getBoundingClientRect()
        x.set((event.clientX - (rect.left + rect.width / 2)) * strength)
        y.set((event.clientY - (rect.top + rect.height / 2)) * strength)
      }}
      onPointerLeave={() => {
        x.set(0)
        y.set(0)
      }}
    >
      {children}
    </motion.div>
  )
}
