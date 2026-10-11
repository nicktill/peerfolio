"use client"

import { useRef } from "react"
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from "motion/react"

/**
 * Lets the hero preview start slightly tipped back and settle flat as it scrolls
 * up the page, like a screen being raised toward you. Reduced motion leaves it flat.
 */
export function ScrollTilt({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const reduceMotion = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "start 0.35"] })
  const progress = useSpring(scrollYProgress, { stiffness: 140, damping: 26, mass: 0.4 })
  const rotateX = useTransform(progress, [0, 1], [10, 0])
  const scale = useTransform(progress, [0, 1], [0.94, 1])
  const y = useTransform(progress, [0, 1], [24, 0])

  if (reduceMotion) return <div className={className}>{children}</div>

  return (
    <div className="[perspective:1400px]">
      <motion.div ref={ref} className={className} style={{ rotateX, scale, y, transformOrigin: "50% 0%" }}>
        {children}
      </motion.div>
    </div>
  )
}
