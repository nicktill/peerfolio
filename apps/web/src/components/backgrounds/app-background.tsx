"use client"

import { useEffect } from "react"
import dynamic from "next/dynamic"
import { useBackground, type BackgroundId } from "@web/lib/background-pref"

/**
 * The signed-in background the viewer picked in Settings. Each design is its
 * own lazily loaded chunk, so only the chosen one is ever downloaded; Classic
 * is plain CSS and loads nothing. With "Interactive" off, the designs still
 * move on their own but ignore the cursor.
 */
const FIELDS: Record<Exclude<BackgroundId, "classic">, React.ComponentType> = {
  alive: dynamic(() => import("./grid-field").then((m) => m.AliveGrid), { ssr: false }),
  market: dynamic(() => import("./grid-field").then((m) => m.MarketGrid), { ssr: false }),
  topo: dynamic(() => import("./topo-field").then((m) => m.TopoField), { ssr: false }),
  depth: dynamic(() => import("./depth-field").then((m) => m.DepthField), { ssr: false }),
  glyph: dynamic(() => import("./glyph-field").then((m) => m.GlyphField), { ssr: false }),
  horizon: dynamic(() => import("./horizon-field").then((m) => m.HorizonField), { ssr: false }),
  orbit: dynamic(() => import("./orbit-field").then((m) => m.OrbitField), { ssr: false }),
}

export function AppBackground() {
  const [pref] = useBackground()

  // Read by every design's pointer handler (see canvas.ts `cursorOff`).
  useEffect(() => {
    if (!pref) return
    if (pref.interactive) delete document.documentElement.dataset.bgStill
    else document.documentElement.dataset.bgStill = "1"
  }, [pref])

  if (!pref) return null
  if (pref.id === "classic") return <div aria-hidden className="classic-dots pointer-events-none fixed inset-0 -z-10" />
  const Field = FIELDS[pref.id]
  // Keyed so switching designs fully remounts (fresh canvas, fresh listeners).
  return <Field key={pref.id} />
}
