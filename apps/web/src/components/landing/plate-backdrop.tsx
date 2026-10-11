"use client"

import { useRef } from "react"
import { HeroBackdrop } from "@web/components/landing/hero-backdrop"
import { useHeroParallax, type ParallaxOptions } from "@web/components/landing/use-hero-parallax"

// One painted plate: a gentle drift only. Scale 1.07 (in CSS) leaves room for it so no edge ever shows.
const OPTS: ParallaxOptions = { scroll: { plate: 0.04, layer: 0, max: 600 }, pointer: { plate: 10, layer: 16 }, scrollOnTouch: false }

/**
 * A single-image hero scene that belongs to one theme. In its own theme it shows the plate (only that image is
 * requested); in the other theme it falls back to the flat hero, so the page is never left without a backdrop.
 * `art` names the plate image (public/hero/<art>/plate); `layer` an optional foreground with real alpha (public/hero/layers/<layer>) that drifts a little more than the plate. Per-scene tuning lives in landing.css under [data-hero="<id>"].
 */
export interface PlateProps { art: string; theme: "dark" | "light"; layer?: string; blend?: "screen" }

export function PlateBackdrop({ art, theme, layer, blend }: PlateProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  useHeroParallax(rootRef, OPTS)
  return (
    <>
      <div ref={rootRef} aria-hidden data-theme-only={theme} className="pl-root pointer-events-none absolute inset-x-0 top-0 -z-10 overflow-hidden">
        <div className="pl-par" data-par="plate"><div className={`pl-img pl-art-${art}`} /></div>
        {layer ? <div className="pl-par" data-par="layer"><div className={`pl-img pl-lay-${layer}`} data-blend={blend} /></div> : null}
      </div>
      <div data-fallback-for={theme} className="pl-fallback"><HeroBackdrop /></div>
    </>
  )
}
