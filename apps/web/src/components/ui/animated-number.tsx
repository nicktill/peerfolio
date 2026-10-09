"use client"

import { useEffect, useLayoutEffect, useRef } from "react"
import { animate, useInView, useReducedMotion } from "motion/react"

const useBeforePaint = typeof window !== "undefined" ? useLayoutEffect : useEffect

const seenKey = (key: string) => `peerfolio:counted:${key}`
const hasCounted = (key: string) => {
  try {
    return sessionStorage.getItem(seenKey(key)) === "1"
  } catch {
    return false
  }
}
const markCounted = (key: string) => {
  try {
    sessionStorage.setItem(seenKey(key), "1")
  } catch {
    // Private mode: it just counts again next time.
  }
}

/**
 * A number that eases to its new value instead of jumping, so a refresh or a trade *feels*
 * like something happened. The text is written straight to the DOM each frame, so React
 * doesn't re-render a page full of numbers 60 times a second.
 *
 * `countUp` is a name for a headline figure: the first time in a session it scrolls into
 * view, it counts up to its value from a little below (never from $0, so it doesn't read as a
 * loading state), then stays quiet on later visits. The server and first paint always show
 * the real value. Reduced motion skips all of it, and screen readers get the final text.
 */
export function AnimatedNumber({
  value,
  format,
  durationMs = 700,
  countUp,
  className,
}: {
  value: number
  format: (value: number) => string
  durationMs?: number
  countUp?: string
  className?: string
}) {
  const reduceMotion = useReducedMotion()
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: "0px 0px -8% 0px" })
  const initial = useRef(value)
  const from = useRef(value)
  const pending = useRef(Boolean(countUp) && !hasCounted(countUp ?? ""))

  // Before the first paint, start a counting figure a little low, so there's no flash of the final value.
  useBeforePaint(() => {
    if (!pending.current || reduceMotion || !ref.current || value === 0) return
    from.current = value * 0.85
    ref.current.textContent = format(from.current)
    // Only on mount.
  }, [])

  useEffect(() => {
    const node = ref.current
    if (!node) return
    let duration = durationMs
    if (pending.current) {
      if (!inView && !reduceMotion) return
      pending.current = false
      if (countUp) markCounted(countUp)
      duration = Math.max(durationMs, 1100)
    }
    if (reduceMotion || from.current === value) {
      from.current = value
      node.textContent = format(value)
      return
    }
    const controls = animate(from.current, value, {
      duration: duration / 1000,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => {
        from.current = latest
        node.textContent = format(latest)
      },
    })
    return () => controls.stop()
  }, [value, durationMs, reduceMotion, countUp, inView, format])

  return (
    <span className={className}>
      <span ref={ref} aria-hidden>
        {format(initial.current)}
      </span>
      <span className="sr-only">{format(value)}</span>
    </span>
  )
}
