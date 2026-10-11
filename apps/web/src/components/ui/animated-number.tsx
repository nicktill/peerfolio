"use client"

import { useEffect, useLayoutEffect, useRef } from "react"
import { animate, useReducedMotion } from "motion/react"

// Hero figures that have already counted up this session, so navigating back or refreshing data never replays it.
const counted = new Set<string>()

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
  durationMs = 600,
  className,
  countUp,
}: {
  value: number
  format: (value: number) => string
  durationMs?: number
  className?: string
  /** Count up from ~0 the first time this key appears (once per session; skipped for reduced motion). */
  countUp?: string
}) {
  const reduceMotion = useReducedMotion()
  const ref = useRef<HTMLSpanElement>(null)
  const initial = useRef(value)
  const from = useRef(value)

  // Before first paint, so the final figure never flashes ahead of the count.
  useLayoutEffect(() => {
    if (!countUp || counted.has(countUp) || value === 0) return
    counted.add(countUp)
    if (reduceMotion || !ref.current) return
    from.current = 0
    ref.current.textContent = format(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
      ease: [0.16, 1, 0.3, 1],
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
