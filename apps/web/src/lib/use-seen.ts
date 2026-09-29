"use client"

import { useEffect, useRef, useState } from "react"

/**
 * True once the element has scrolled into view (and stays true), so an entrance
 * animation plays when someone can actually see it, not at page load while it's
 * still off-screen. Without IntersectionObserver, or with reduced motion, it's
 * true straight away and nothing waits.
 */
export function useSeen<T extends Element>(threshold = 0.3) {
  const ref = useRef<T>(null)
  const [seen, setSeen] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (!element || seen) return
    if (typeof IntersectionObserver === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setSeen(true)
      return
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setSeen(true)
          observer.disconnect()
        }
      },
      { threshold },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [seen, threshold])

  return { ref, seen }
}
