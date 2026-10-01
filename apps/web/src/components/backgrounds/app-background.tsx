"use client"

import { useEffect, useState } from "react"
import { DepthField } from "./depth-field"
import { GlyphField } from "./glyph-field"
import { GridField, type GridMood } from "./grid-field"
import { HorizonField } from "./horizon-field"
import { TopoField } from "./topo-field"

/**
 * DRAFT: picks the signed-in background while we compare options.
 *   ?bg=grid    (default) with ?grid=a|b|c; b is the market mood (&mood=up|down)
 *   ?bg=topo    topographic contours (&mood=up|down)
 *   ?bg=depth   order books in the margins (&mood=up|down)
 *   ?bg=glyph   market glyphs lit by colour blooms (&mood=up|down)
 *   ?bg=horizon perspective floor and a ridge drawn from your returns (&mood=up|down)
 * Once one is chosen this collapses to that single component.
 */
const CHOICES = ["grid", "topo", "depth", "glyph", "horizon"] as const
type Choice = (typeof CHOICES)[number]

export function AppBackground() {
  const [choice, setChoice] = useState<Choice>("grid")
  useEffect(() => {
    const bg = new URLSearchParams(window.location.search).get("bg")
    if (CHOICES.includes(bg as Choice)) setChoice(bg as Choice)
  }, [])

  if (choice === "topo") return <TopoField />
  if (choice === "depth") return <DepthField />
  if (choice === "glyph") return <GlyphField />
  if (choice === "horizon") return <HorizonField />
  return <GridField mood={"a" as GridMood} />
}
