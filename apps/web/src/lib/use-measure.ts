"use client"

import { useEffect, useRef, useState } from "react"

/** Tracks an element's rendered width so SVG charts can lay out in real pixels. */
export function useMeasure<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  const [height, setHeight] = useState(0)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    // Keep the last useful size while a preview is switching or hidden. A
    // transient zero measurement must not delete the SVG and its geometry.
    const measure = (w = element.clientWidth, h = element.clientHeight) => {
      if (w > 0) setWidth(w)
      if (h > 0) setHeight(h)
    }
    measure()
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measureFromWindow)
      function measureFromWindow() { measure() }
      return () => window.removeEventListener("resize", measureFromWindow)
    }
    const observer = new ResizeObserver(([entry]) => {
      if (entry) measure(entry.contentRect.width, entry.contentRect.height)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return { ref, width, height }
}
