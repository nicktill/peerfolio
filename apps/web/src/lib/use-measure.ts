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

    const observer = new ResizeObserver(([entry]) => {
      if (entry) {
        setWidth(entry.contentRect.width)
        setHeight(entry.contentRect.height)
      }
    })

    observer.observe(element)
    const box = element.getBoundingClientRect()
    setWidth(box.width)
    setHeight(box.height)

    return () => observer.disconnect()
  }, [])

  return { ref, width, height }
}
