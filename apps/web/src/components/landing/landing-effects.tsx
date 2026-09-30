"use client"

import { useEffect } from "react"
import Lenis from "lenis"
import "lenis/dist/lenis.css"

/**
 * Landing-page-only behaviour, rendered once and drawing nothing:
 *  - Lenis smooth scrolling, skipped for reduced motion (native scroll stays).
 *  - A delegated pointer handler that feeds `--mx`/`--my` to any `[data-spotlight]`
 *    element, which the `.spotlight` CSS turns into a hover glow that follows the cursor.
 *
 * It lives here and not in the root layout so the signed-in app, where people
 * scan numbers and expect native scrolling, is untouched.
 */
export function LandingEffects() {
  useEffect(() => {
    let lenis: Lenis | undefined
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      lenis = new Lenis({ autoRaf: true, lerp: 0.085, anchors: true })
    }

    const onMove = (event: PointerEvent) => {
      const card = (event.target as Element | null)?.closest<HTMLElement>("[data-spotlight]")
      if (!card) return
      const rect = card.getBoundingClientRect()
      card.style.setProperty("--mx", `${event.clientX - rect.left}px`)
      card.style.setProperty("--my", `${event.clientY - rect.top}px`)
    }
    document.addEventListener("pointermove", onMove, { passive: true })

    return () => {
      lenis?.destroy()
      document.removeEventListener("pointermove", onMove)
    }
  }, [])

  return null
}
