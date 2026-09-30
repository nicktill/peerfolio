"use client"

import { useEffect, useState } from "react"
import { FlapField } from "./flap-field"
import { GridField, type GridMood } from "./grid-field"
import { HeatmapField } from "./heatmap-field"
import { TopoField } from "./topo-field"

/**
 * DRAFT: picks the signed-in background while we compare options.
 *   ?bg=grid (default; with ?grid=a|b|c and, for b, &mood=up|down)
 *   ?bg=heat  market heatmap on the grid
 *   ?bg=topo  topographic contours
 *   ?bg=flap  split-flap board
 * Once one is chosen this collapses to that single component.
 */
type Choice = "grid" | "heat" | "topo" | "flap"

export function AppBackground() {
  const [choice, setChoice] = useState<Choice>("grid")
  useEffect(() => {
    const bg = new URLSearchParams(window.location.search).get("bg")
    if (bg === "heat" || bg === "topo" || bg === "flap") setChoice(bg)
  }, [])

  if (choice === "heat") return <HeatmapField />
  if (choice === "topo") return <TopoField />
  if (choice === "flap") return <FlapField />
  return <GridField mood={"a" as GridMood} />
}
