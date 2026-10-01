"use client"

import { useEffect, useState } from "react"
import { CandleField } from "./candle-field"
import { DepthField } from "./depth-field"
import { FlapField } from "./flap-field"
import { GridField, type GridMood } from "./grid-field"
import { HeatmapField } from "./heatmap-field"
import { MosaicField } from "./mosaic-field"
import { TopoField } from "./topo-field"

/**
 * DRAFT: picks the signed-in background while we compare options.
 *   ?bg=grid (default; with ?grid=a|b|c and, for b, &mood=up|down)
 *   ?bg=heat  market heatmap on the grid
 *   ?bg=topo  topographic contours
 *   ?bg=flap  exchange board (split-flap)
 *   ?bg=candles  market mood as candlesticks (&mood=up|down)
 *   ?bg=depth  order books in the margins (&mood=up|down)
 *   ?bg=mosaic  aurora through the grid (&mood=up|down)
 * topo also takes &mood=up|down.
 * Once one is chosen this collapses to that single component.
 */
const CHOICES = ["grid", "heat", "topo", "flap", "candles", "depth", "mosaic"] as const
type Choice = (typeof CHOICES)[number]

export function AppBackground() {
  const [choice, setChoice] = useState<Choice>("grid")
  useEffect(() => {
    const bg = new URLSearchParams(window.location.search).get("bg")
    if (CHOICES.includes(bg as Choice)) setChoice(bg as Choice)
  }, [])

  if (choice === "heat") return <HeatmapField />
  if (choice === "topo") return <TopoField />
  if (choice === "flap") return <FlapField />
  if (choice === "candles") return <CandleField />
  if (choice === "depth") return <DepthField />
  if (choice === "mosaic") return <MosaicField />
  return <GridField mood={"a" as GridMood} />
}
