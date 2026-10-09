// Source: Magic UI (https://magicui.design, MIT) from github.com/magicuidesign/magicui. Adapted for this project: Tailwind 3 class syntax, our `cn` helper and theme tokens. Changes are marked "Peerfolio:".
"use client"

import { useEffect, useRef, useState } from "react"
import { motion, useInView, useReducedMotion, type MotionStyle, type Transition } from "motion/react"

import { cn } from "@web/lib/utils"

interface BorderBeamProps {
  /**
   * The size of the border beam.
   */
  size?: number
  /**
   * The duration of the border beam.
   */
  duration?: number
  /**
   * The delay of the border beam.
   */
  delay?: number
  /**
   * The color of the border beam from.
   */
  colorFrom?: string
  /**
   * The color of the border beam to.
   */
  colorTo?: string
  /**
   * The motion transition of the border beam.
   */
  transition?: Transition
  /**
   * The class name of the border beam.
   */
  className?: string
  /**
   * The style of the border beam.
   */
  style?: React.CSSProperties
  /**
   * Whether to reverse the animation direction.
   */
  reverse?: boolean
  /**
   * The initial offset position (0-100).
   */
  initialOffset?: number
  /**
   * The border width of the beam.
   */
  borderWidth?: number
}

export const BorderBeam = ({
  className,
  size = 50,
  delay = 0,
  duration = 6,
  colorFrom = "#ffaa40",
  colorTo = "#9c40ff",
  transition,
  style,
  reverse = false,
  initialOffset = 0,
  borderWidth = 1,
}: BorderBeamProps) => {
  // Peerfolio: draw nothing where CSS offset-path rect() is unsupported (it would sit in the corner),
  // while off screen, and with reduced motion.
  const ref = useRef<HTMLDivElement>(null)
  const onScreen = useInView(ref)
  const reduceMotion = useReducedMotion()
  const [supported, setSupported] = useState(false)
  useEffect(() => {
    setSupported(typeof CSS !== "undefined" && CSS.supports("offset-path", "rect(0 auto auto 0)"))
  }, [])

  return (
    <div
      ref={ref}
      // Peerfolio: Tailwind 3 has no mask utilities, so the border-only mask is inline.
      className="pointer-events-none absolute inset-0 rounded-[inherit] border-transparent"
      style={{
        borderStyle: "solid",
        borderWidth: borderWidth,
        WebkitMask: "linear-gradient(transparent, transparent), linear-gradient(#000, #000)",
        WebkitMaskClip: "padding-box, border-box",
        WebkitMaskComposite: "xor",
        mask: "linear-gradient(transparent, transparent), linear-gradient(#000, #000)",
        maskClip: "padding-box, border-box",
        maskComposite: "intersect",
      }}
    >
      {supported && onScreen && !reduceMotion ? (
      <motion.div
        className={cn("absolute aspect-square", className)}
        style={
          {
            width: size,
            // Peerfolio: the v4 `bg-linear-to-l from-(--x) via-(--y)` utilities, written out.
            background: "linear-gradient(to left, var(--color-from), var(--color-to), transparent)",
            offsetPath: `rect(0 auto auto 0 round ${size}px)`,
            "--color-from": colorFrom,
            "--color-to": colorTo,
            ...style,
          } as MotionStyle
        }
        initial={{ offsetDistance: `${initialOffset}%` }}
        animate={{
          offsetDistance: reverse
            ? [`${100 - initialOffset}%`, `${-initialOffset}%`]
            : [`${initialOffset}%`, `${100 + initialOffset}%`],
        }}
        transition={{
          repeat: Infinity,
          ease: "linear",
          duration,
          delay: -delay,
          ...transition,
        }}
      />
      ) : null}
    </div>
  )
}
