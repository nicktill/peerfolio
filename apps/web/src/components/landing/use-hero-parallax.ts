"use client"

import { useEffect, type RefObject } from "react"

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export interface ParallaxOptions {
  /** Px of counter-scroll per px scrolled, for the back plate and the foreground layer. */
  scroll: { plate: number; layer: number; max?: number }
  /** Px of pointer drift at the edge of the screen, for the back plate and the foreground layer. */
  pointer: { plate: number; layer: number }
  /** Keep scroll parallax on touch devices (off for single plates: nothing to gain, battery to lose). */
  scrollOnTouch?: boolean
}

/**
 * Shared hero motion: scroll and pointer parallax on `[data-par=plate|layer]` children (transform only), a header
 * state flag, and pausing when the hero is off-screen or the tab is hidden. Nothing runs under reduced motion.
 */
export function useHeroParallax(rootRef: RefObject<HTMLElement | null>, opts: ParallaxOptions) {
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const html = document.documentElement
    const plates = Array.from(root.querySelectorAll<HTMLElement>("[data-par='plate']"))
    const layers = Array.from(root.querySelectorAll<HTMLElement>("[data-par='layer']"))

    // The header sits on the art until the page moves; then it takes the page colour back.
    const markScrolled = () => {
      if (window.scrollY > 8) html.setAttribute("data-hero-scrolled", "")
      else html.removeAttribute("data-hero-scrolled")
    }
    markScrolled()
    window.addEventListener("scroll", markScrolled, { passive: true })

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)")
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)")

    let visible = true
    let motion = false
    let raf = 0
    let scrollY = 0
    let px = 0, py = 0 // pointer target, -1..1
    let cx = 0, cy = 0 // eased pointer
    let lastScroll = NaN, lastX = NaN, lastY = NaN

    const frame = () => {
      raf = 0
      cx += (px - cx) * 0.08
      cy += (py - cy) * 0.08
      if (Math.abs(px - cx) < 0.001) cx = px
      if (Math.abs(py - cy) < 0.001) cy = py
      if (scrollY !== lastScroll || cx !== lastX || cy !== lastY) {
        lastScroll = scrollY; lastX = cx; lastY = cy
        // Plate trails the page (counter-moves), the foreground layer sticks closer to it: that gap is the depth.
        const s = clamp(scrollY, 0, opts.scroll.max ?? 700)
        const plate = `translate3d(${(cx * -opts.pointer.plate).toFixed(2)}px, ${(s * opts.scroll.plate + cy * -opts.pointer.plate).toFixed(2)}px, 0)`
        const layer = `translate3d(${(cx * opts.pointer.layer).toFixed(2)}px, ${(s * opts.scroll.layer + cy * opts.pointer.layer).toFixed(2)}px, 0)`
        for (const el of plates) el.style.transform = plate
        for (const el of layers) el.style.transform = layer
      }
      if (cx !== px || cy !== py) schedule()
    }
    const schedule = () => { if (!raf && motion && visible && !document.hidden) raf = requestAnimationFrame(frame) }

    const onScroll = () => { scrollY = window.scrollY; schedule() }
    const onPointer = (e: PointerEvent) => {
      px = (e.clientX / window.innerWidth) * 2 - 1
      py = (e.clientY / window.innerHeight) * 2 - 1
      schedule()
    }

    const setPaused = () => root.toggleAttribute("data-paused", !visible || document.hidden)
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      setPaused()
      if (visible) schedule()
    })
    io.observe(root)
    const onVisibility = () => { setPaused(); schedule() }
    document.addEventListener("visibilitychange", onVisibility)

    const enable = () => {
      const on = !reduced.matches
      if (on === motion) return
      motion = on
      if (on) {
        scrollY = window.scrollY
        if (fine.matches || opts.scrollOnTouch !== false) window.addEventListener("scroll", onScroll, { passive: true })
        if (fine.matches) window.addEventListener("pointermove", onPointer, { passive: true })
        schedule()
      } else {
        window.removeEventListener("scroll", onScroll)
        window.removeEventListener("pointermove", onPointer)
        for (const el of [...plates, ...layers]) el.style.transform = ""
        px = py = cx = cy = 0; lastScroll = lastX = lastY = NaN
      }
    }
    enable()
    reduced.addEventListener("change", enable)

    return () => {
      cancelAnimationFrame(raf)
      io.disconnect()
      reduced.removeEventListener("change", enable)
      document.removeEventListener("visibilitychange", onVisibility)
      window.removeEventListener("scroll", markScrolled)
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("pointermove", onPointer)
      html.removeAttribute("data-hero-scrolled")
    }
  }, [rootRef, opts])

}
