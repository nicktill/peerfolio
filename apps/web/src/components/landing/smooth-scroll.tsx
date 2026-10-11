"use client"

import { useEffect } from "react"
import Lenis from "lenis"

let instance: Lenis | null = null

/** Scroll to a page position: eased by Lenis while it runs, the browser's smooth scroll otherwise. */
export function scrollToY(y: number) {
  if (instance) instance.scrollTo(y, { duration: 1.1 })
  else window.scrollTo({ top: y, behavior: "smooth" })
}

/**
 * Gentle inertial wheel scrolling for the landing page only. Mounted by the page, so it is
 * created on arrival and destroyed on leaving, and signed-in pages never see it. Touch stays
 * native, reduced motion turns it off, and in-page anchors go through it (the sections'
 * scroll-margin clears the sticky header).
 */
export function SmoothScroll() {
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)")
    if (reduced.matches) return

    const lenis = new Lenis({ lerp: 0.1, wheelMultiplier: 1, smoothWheel: true, syncTouch: false, anchors: false })
    instance = lenis
    let raf = 0
    const frame = (time: number) => {
      lenis.raf(time)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.('a[href^="#"]') as HTMLAnchorElement | null
      const id = link?.getAttribute("href")?.slice(1)
      const target = id ? document.getElementById(id) : null
      if (!link || !target || event.defaultPrevented || event.metaKey || event.ctrlKey) return
      event.preventDefault()
      lenis.scrollTo(target, { duration: 1.2 }) // the section's scroll-margin already clears the header
      history.replaceState(null, "", `#${id}`)
    }
    document.addEventListener("click", onClick)

    return () => {
      document.removeEventListener("click", onClick)
      cancelAnimationFrame(raf)
      lenis.destroy()
      if (instance === lenis) instance = null
    }
  }, [])

  return null
}
