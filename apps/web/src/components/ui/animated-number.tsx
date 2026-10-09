"use client"

import { useEffect, useRef, useState } from "react"
import { animate, useInView, useReducedMotion } from "motion/react"

/**
 * A number that eases to its new value instead of jumping, so a refresh or a
 * trade *feels* like something happened. By default the first value shows
 * immediately; `countUp` instead counts up from zero the first time it scrolls
 * into view, for a headline figure. Reduced motion skips the easing, and screen
 * readers get the final text, not every frame.
 */
export function AnimatedNumber({
  value,
  format,
  durationMs = 700,
  countUp = false,
  className,
}: {
  value: number
  format: (value: number) => string
  durationMs?: number
  countUp?: boolean
  className?: string
}) {
  const reduceMotion = useReducedMotion()
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: "0px 0px -8% 0px" })
  const [shown, setShown] = useState(countUp ? 0 : value)
  const from = useRef(countUp ? 0 : value)
  const waiting = useRef(countUp)

  useEffect(() => {
    if (waiting.current) {
      if (!inView) return
      waiting.current = false
    }
    if (reduceMotion || from.current === value) {
      from.current = value
      setShown(value)
      return
    }
    const controls = animate(from.current, value, {
      duration: (countUp && from.current === 0 ? Math.max(durationMs, 1400) : durationMs) / 1000,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => {
        from.current = latest
        setShown(latest)
      },
    })
    return () => controls.stop()
  }, [value, durationMs, reduceMotion, countUp, inView])

  return (
    <span ref={ref} className={className}>
      <span aria-hidden>{format(shown)}</span>
      <span className="sr-only">{format(value)}</span>
    </span>
  )
}
