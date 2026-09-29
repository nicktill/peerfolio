"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"

/**
 * Position for a highlight that slides between the items of a row (the active
 * nav link, the selected range). Items opt in with `data-slide-key`; the
 * container must be `position: relative` so their offsets line up.
 *
 * `ready` turns true one frame after the first measurement, so the highlight
 * appears in place instead of sliding in from the corner on first paint.
 */
export function useSlidingIndicator<T extends HTMLElement>(activeKey: string | null) {
  const containerRef = useRef<T>(null)
  const [rect, setRect] = useState<{ left: number; width: number } | null>(null)
  const [ready, setReady] = useState(false)

  const measure = useCallback(() => {
    const container = containerRef.current
    if (!container || activeKey === null) return setRect(null)
    const item = container.querySelector<HTMLElement>(`[data-slide-key="${CSS.escape(activeKey)}"]`)
    if (!item) return setRect(null)
    setRect((prev) => (prev && prev.left === item.offsetLeft && prev.width === item.offsetWidth ? prev : { left: item.offsetLeft, width: item.offsetWidth }))
  }, [activeKey])

  useLayoutEffect(() => {
    measure()
  }, [measure])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    return () => observer.disconnect()
  }, [measure])

  useEffect(() => {
    if (!rect || ready) return
    const frame = requestAnimationFrame(() => setReady(true))
    return () => cancelAnimationFrame(frame)
  }, [rect, ready])

  return { containerRef, rect, ready }
}

/** Inline style for the sliding highlight. */
export function slideStyle(rect: { left: number; width: number } | null, ready: boolean): React.CSSProperties {
  if (!rect) return { opacity: 0 }
  return {
    width: rect.width,
    transform: `translateX(${rect.left}px)`,
    transition: ready ? "transform 320ms cubic-bezier(0.22, 1, 0.36, 1), width 320ms cubic-bezier(0.22, 1, 0.36, 1)" : "none",
  }
}
