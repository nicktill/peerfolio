"use client"

import { useEffect, useRef, useState } from "react"

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches

/**
 * A number that eases to its new value instead of jumping, so a refresh or a
 * trade *feels* like something happened. The first value shows immediately
 * (no count-up from zero on page load), and reduced motion skips the easing.
 * Screen readers get the final text, not every frame.
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
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  const raf = useRef<number | null>(null)

  useEffect(() => {
    const start = from.current
    if (start === value || prefersReducedMotion()) {
      from.current = value
      setShown(value)
      return
    }

    const t0 = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / durationMs)
      const eased = 1 - Math.pow(1 - t, 3)
      const current = start + (value - start) * eased
      from.current = current
      setShown(current)
      if (t < 1) raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
    return () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current)
    }
  }, [value, durationMs])

  return (
    <span className={className}>
      <span aria-hidden>{format(shown)}</span>
      <span className="sr-only">{format(value)}</span>
    </span>
  )
}
