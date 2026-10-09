"use client"

import { useEffect, useRef } from "react"
import { animate, useReducedMotion } from "motion/react"

/**
 * A number that eases to its new value instead of jumping, so a refresh or a trade *feels* like something
 * happened. The text is written straight to the DOM each frame, so React doesn't re-render a page full of
 * numbers 60 times a second. The server and first paint show the real value, reduced motion skips the
 * easing, and screen readers get the final text. (A headline figure that counts up on first view is
 * `HeadlineNumber`.)
 */
export function AnimatedNumber({
  value,
  format,
  durationMs = 700,
  className,
}: {
  value: number
  format: (value: number) => string
  durationMs?: number
  className?: string
}) {
  const reduceMotion = useReducedMotion()
  const ref = useRef<HTMLSpanElement>(null)
  const initial = useRef(value)
  const from = useRef(value)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    if (reduceMotion || from.current === value) {
      from.current = value
      node.textContent = format(value)
      return
    }
    const controls = animate(from.current, value, {
      duration: durationMs / 1000,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => {
        from.current = latest
        node.textContent = format(latest)
      },
    })
    return () => controls.stop()
  }, [value, durationMs, reduceMotion, format])

  return (
    <span className={className}>
      <span ref={ref} aria-hidden>
        {format(initial.current)}
      </span>
      <span className="sr-only">{format(value)}</span>
    </span>
  )
}
