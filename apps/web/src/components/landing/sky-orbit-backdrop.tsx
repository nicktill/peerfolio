"use client"

import { useRef } from "react"
import { useHeroParallax, type ParallaxOptions } from "@web/components/landing/use-hero-parallax"

/** Fixed star positions (percent of the hero box) so server and client markup always agree. */
const STARS: ReadonlyArray<readonly [number, number, number]> = [
  [6, 9, 0], [14, 22, 1.7], [23, 6, 3.1], [31, 17, 0.6], [44, 8, 2.4], [52, 24, 4.2], [61, 11, 1.1],
  [69, 5, 3.6], [77, 19, 0.3], [85, 10, 2.8], [92, 26, 1.4], [96, 7, 4.6], [38, 30, 3.3], [11, 34, 2.1],
]

const OPTS: ParallaxOptions = { scroll: { plate: 0.22, layer: 0.07 }, pointer: { plate: 3, layer: 6 } }

export function SkyOrbitBackdrop() {
  const rootRef = useRef<HTMLDivElement>(null)

  useHeroParallax(rootRef, OPTS)

  return (
    <div ref={rootRef} aria-hidden className="so-root pointer-events-none absolute inset-x-0 top-0 -z-10 overflow-hidden">
      <div className="so-stack so-night">
        <div className="so-par" data-par="plate"><div className="so-rise so-rise-plate"><div className="so-img so-plate" /></div></div>
        <div className="so-stars">
          {STARS.map(([x, y, d], i) => <i key={i} style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${d}s`, animationDuration: `${5 + (i % 4) * 1.6}s` }} />)}
        </div>
        <div className="so-par" data-par="layer"><div className="so-rise so-rise-layer"><div className="so-img so-layer" /></div></div>
      </div>
      <div className="so-stack so-day">
        <div className="so-par" data-par="plate"><div className="so-rise so-rise-plate"><div className="so-img so-plate" /></div></div>
        <div className="so-glint" />
        <div className="so-par" data-par="layer"><div className="so-rise so-rise-layer"><div className="so-img so-layer" /></div></div>
      </div>
      <div className="so-dusk" />
    </div>
  )
}
