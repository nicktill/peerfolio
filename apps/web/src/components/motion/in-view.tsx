"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "@web/lib/utils"

/**
 * Eases its children in when they scroll into view, `index` steps into a stagger.
 *
 * Progressive enhancement: on the server and until it mounts it renders fully
 * visible, so the page is complete on first paint and works without JavaScript.
 * Only pieces that are actually below the fold at load are hidden and revealed;
 * anything already on screen stays put. Reduced motion skips it entirely.
 */
export function InView({
  index = 0,
  as: Tag = "div",
  className,
  style,
  children,
}: {
  index?: number
  as?: "div" | "li" | "section"
  className?: string
  style?: React.CSSProperties
  children: React.ReactNode
}) {
  const ref = useRef<HTMLElement>(null)
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (!element || typeof IntersectionObserver === "undefined") return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    // Already comfortably on screen at load: leave it alone.
    if (element.getBoundingClientRect().top < window.innerHeight * 0.7) return

    setHidden(true)
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setHidden(false)
          observer.disconnect()
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -5% 0px" },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <Tag
      ref={ref as never}
      className={cn("rv-show", hidden && "rv-hidden", className)}
      style={{ "--i": index, ...style } as React.CSSProperties}
    >
      {children}
    </Tag>
  )
}
